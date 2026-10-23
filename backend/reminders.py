# ============================================================
# RECORDATORIOS PARA AUTORES
# ============================================================
#
# - Primer capítulo: si alguien crea una historia y pasado un día todavía no
#   publica ningún capítulo, se le anima a publicar el primero. Se envía una
#   sola vez por historia: `first_chapter_reminders` guarda las historias ya
#   avisadas, aunque la notificación se descarte después.
# - Inactividad: si una historia en curso lleva 2 semanas sin capítulos
#   nuevos, y otra vez al mes, se le recuerda que sus lectores la esperan.
#   Después no se insiste más. `story_inactivity_reminders` guarda cada aviso
#   junto con la fecha del último capítulo: al publicar otro, se empieza de
#   nuevo.
#
# Las historias pausadas o terminadas no reciben recordatorios.
#
# La revisión corre en un hilo del propio servidor cada hora; Render usa un
# solo proceso, así que no se duplica.

import threading
from datetime import datetime, timedelta, timezone

# Tiempo que se espera tras crear la historia antes de recordar.
FIRST_CHAPTER_DELAY = timedelta(hours=24)
# Las historias más antiguas que esto ya no reciben el recordatorio.
FIRST_CHAPTER_MAX_AGE = timedelta(days=30)
# Avisos por inactividad: días sin capítulos nuevos y hasta cuándo vale cada
# uno. Pasado el plazo de un aviso, ya no se envía (ni siquiera atrasado).
INACTIVITY_STAGES = (
    (14, timedelta(days=14), timedelta(days=30)),
    (30, timedelta(days=30), timedelta(days=37)),
)
# Estados en los que se recuerda publicar el primer capítulo.
FIRST_CHAPTER_STATUSES = ("draft", "published")
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
        .in_("status", FIRST_CHAPTER_STATUSES)
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


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def send_inactivity_reminders(now: datetime | None = None) -> int:
    # Devuelve cuántos recordatorios se enviaron.
    main = fribuk()
    db = main.supabase_admin
    now = now or datetime.now(timezone.utc)

    # Solo las historias en curso: «Publicada» en el formulario.
    stories = (
        db.table("stories")
        .select("id, author_id, title")
        .eq("status", "published")
        .execute()
        .data
        or []
    )
    if not stories:
        return 0

    story_ids = [str(story["id"]) for story in stories]

    # La última actividad es el capítulo publicado editado o publicado más
    # recientemente. Las historias sin capítulos tienen su propio aviso.
    last_chapter_at = {}
    for chapter in (
        db.table("chapters")
        .select("story_id, updated_at")
        .in_("story_id", story_ids)
        .eq("status", "published")
        .execute()
        .data
        or []
    ):
        story_id = str(chapter["story_id"])
        updated_at = parse_timestamp(chapter["updated_at"])
        if story_id not in last_chapter_at or updated_at > last_chapter_at[story_id]:
            last_chapter_at[story_id] = updated_at

    already_sent = {
        (str(row["story_id"]), int(row["stage"]), parse_timestamp(row["last_chapter_at"]))
        for row in (
            db.table("story_inactivity_reminders")
            .select("story_id, stage, last_chapter_at")
            .in_("story_id", story_ids)
            .execute()
            .data
            or []
        )
    }

    sent = 0
    for story in stories:
        story_id = str(story["id"])
        last_at = last_chapter_at.get(story_id)
        if not last_at or not story.get("author_id"):
            continue

        inactive_for = now - last_at
        stage = next(
            (
                days for days, start, end in INACTIVITY_STAGES
                if start <= inactive_for < end
            ),
            None
        )
        if stage is None or (story_id, stage, last_at) in already_sent:
            continue

        # Igual que con el primer capítulo: la clave primaria evita repetirlo.
        try:
            db.table("story_inactivity_reminders").insert({
                "story_id": story_id,
                "stage": stage,
                "last_chapter_at": main.utc_timestamp(last_at),
            }).execute()
        except Exception:
            continue

        main.create_notification(
            story["author_id"],
            "story_inactive",
            story_id=story_id,
            data={"story_title": story.get("title"), "days": stage}
        )
        sent += 1

    return sent


def run_checks() -> None:
    if stop_event.wait(FIRST_CHECK_DELAY_SECONDS):
        return

    while True:
        # Un fallo puntual (por ejemplo, la base sin la tabla todavía) no
        # detiene los otros recordatorios ni las revisiones siguientes.
        try:
            send_first_chapter_reminders()
        except Exception as error:
            print("Error en los recordatorios de primer capítulo:", repr(error))

        try:
            send_inactivity_reminders()
        except Exception as error:
            print("Error en los recordatorios por inactividad:", repr(error))

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
