# ============================================================
# RECORDATORIOS PARA AUTORES
# ============================================================
#
# Si alguien crea una historia y pasado un día todavía no publica ningún
# capítulo, le llega una notificación que lo anima a publicar el primero.
# Se envía una sola vez por historia: `first_chapter_reminders` guarda las
# historias ya avisadas, aunque la notificación se descarte después.
#
# La revisión corre en un hilo del propio servidor cada hora; Render usa un
# solo proceso, así que no se duplica.

import threading
from datetime import datetime, timedelta, timezone

# Tiempo que se espera tras crear la historia antes de recordar.
FIRST_CHAPTER_DELAY = timedelta(hours=24)
# Las historias más antiguas que esto ya no reciben el recordatorio.
FIRST_CHAPTER_MAX_AGE = timedelta(days=30)
CHECK_INTERVAL_SECONDS = 60 * 60
# Margen tras arrancar el servidor antes de la primera revisión.
FIRST_CHECK_DELAY_SECONDS = 5 * 60

stop_event = threading.Event()
worker_lock = threading.Lock()
worker = None


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def send_first_chapter_reminders(now: datetime | None = None) -> int:
    # Devuelve cuántos recordatorios se enviaron.
    main = fribuk()
    db = main.supabase_admin
    now = now or datetime.now(timezone.utc)

    stories = (
        db.table("stories")
        .select("id, author_id, title, created_at")
        .lte("created_at", main.utc_timestamp(now - FIRST_CHAPTER_DELAY))
        .gte("created_at", main.utc_timestamp(now - FIRST_CHAPTER_MAX_AGE))
        .execute()
        .data
        or []
    )
    if not stories:
        return 0

    story_ids = [str(story["id"]) for story in stories]
    already_reminded = {
        str(row["story_id"])
        for row in (
            db.table("first_chapter_reminders")
            .select("story_id")
            .in_("story_id", story_ids)
            .execute()
            .data
            or []
        )
    }
    published_counts = main.get_chapter_counts(story_ids, include_drafts=False)

    sent = 0
    for story in stories:
        story_id = str(story["id"])
        if story_id in already_reminded or published_counts.get(story_id):
            continue
        if not story.get("author_id"):
            continue

        # La fila se guarda antes de avisar: si otra revisión llegó primero,
        # la clave primaria lo impide y no se repite la notificación.
        try:
            db.table("first_chapter_reminders").insert({"story_id": story_id}).execute()
        except Exception:
            continue

        main.create_notification(
            story["author_id"],
            "story_first_chapter",
            story_id=story_id,
            data={"story_title": story.get("title")}
        )
        sent += 1

    return sent


def run_checks() -> None:
    if stop_event.wait(FIRST_CHECK_DELAY_SECONDS):
        return

    while True:
        try:
            send_first_chapter_reminders()
        except Exception as error:
            # Un fallo puntual (por ejemplo, la base sin la tabla todavía)
            # no detiene las revisiones siguientes.
            print("Error en los recordatorios de primer capítulo:", repr(error))

        if stop_event.wait(CHECK_INTERVAL_SECONDS):
            return


def start() -> None:
    global worker
    with worker_lock:
        if worker and worker.is_alive():
            return
        stop_event.clear()
        worker = threading.Thread(
            target=run_checks, name="first-chapter-reminders", daemon=True
        )
        worker.start()


def stop() -> None:
    stop_event.set()
