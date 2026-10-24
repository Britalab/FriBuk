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
# - Días de escritura: los días y la hora que el autor eligió para su
#   historia (ver schedules.py), si ese día todavía no publicó un capítulo.
#   `story_schedule_reminders` guarda el día ya avisado.
#
# Las historias pausadas o terminadas no reciben recordatorios.
#
# La revisión corre en un hilo del propio servidor cada 15 minutos. En el
# plan gratuito de Render el servidor se duerme sin visitas, así que además
# un cron externo llama a POST /internal/reminders/run cada 15 minutos con
# la clave REMINDERS_CRON_SECRET: lo despierta y corre la revisión. Las
# tablas de avisos enviados evitan duplicados si ambos coinciden.

import hmac
import os
import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException

import schedules

router = APIRouter()

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
# Horas tras la hora elegida en que todavía vale avisar por los días de
# escritura: si la revisión se atrasa más, ese día ya no se avisa.
SCHEDULE_WINDOW_HOURS = 3
CHECK_INTERVAL_SECONDS = 15 * 60
# Margen tras arrancar el servidor antes de la primera revisión.
FIRST_CHECK_DELAY_SECONDS = 5 * 60

stop_event = threading.Event()
# Evita que el hilo y el cron revisen al mismo tiempo.
run_lock = threading.Lock()
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

        try:
            main.create_notification(
                story["author_id"],
                "story_first_chapter",
                story_id=story_id,
                data={"story_title": story.get("title")}
            )
        except Exception:
            # Sin aviso no queda marcado: se reintenta en la próxima revisión.
            db.table("first_chapter_reminders").delete().eq("story_id", story_id).execute()
            raise
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

        try:
            main.create_notification(
                story["author_id"],
                "story_inactive",
                story_id=story_id,
                data={"story_title": story.get("title"), "days": stage}
            )
        except Exception:
            (
                db.table("story_inactivity_reminders").delete()
                .eq("story_id", story_id)
                .eq("stage", stage)
                .eq("last_chapter_at", main.utc_timestamp(last_at))
                .execute()
            )
            raise
        sent += 1

    return sent


def send_schedule_reminders(now: datetime | None = None) -> int:
    # Devuelve cuántos recordatorios se enviaron.
    main = fribuk()
    db = main.supabase_admin
    now = now or datetime.now(timezone.utc)

    schedule_rows = (
        db.table("story_schedules")
        .select("story_id, days, hour, timezone")
        .execute()
        .data
        or []
    )

    # Las historias a las que hoy, en la zona del autor, les toca capítulo y
    # ya pasó su hora (sin pasar del margen).
    due = {}
    for row in schedule_rows:
        zone = schedules.get_zone(row.get("timezone"))
        if not zone:
            continue
        local_now = now.astimezone(zone)
        days = {int(day) for day in row.get("days") or []}
        hours_late = local_now.hour - int(row.get("hour") or 0)
        if local_now.weekday() in days and 0 <= hours_late < SCHEDULE_WINDOW_HOURS:
            due[str(row["story_id"])] = (zone, local_now.date())

    if not due:
        return 0

    stories = (
        db.table("stories")
        .select("id, author_id, title")
        .in_("id", list(due))
        .eq("status", "published")
        .execute()
        .data
        or []
    )
    if not stories:
        return 0

    story_ids = [str(story["id"]) for story in stories]
    already_sent = {
        (str(row["story_id"]), str(row["local_date"]))
        for row in (
            db.table("story_schedule_reminders")
            .select("story_id, local_date")
            .in_("story_id", story_ids)
            .gte("local_date", (now - timedelta(days=2)).date().isoformat())
            .execute()
            .data
            or []
        )
    }

    # Si ese día ya publicó (o editó) un capítulo, no hace falta recordarle.
    published_today = set()
    for chapter in (
        db.table("chapters")
        .select("story_id, updated_at")
        .in_("story_id", story_ids)
        .eq("status", "published")
        .gte("updated_at", main.utc_timestamp(now - timedelta(days=2)))
        .execute()
        .data
        or []
    ):
        story_id = str(chapter["story_id"])
        zone, local_date = due[story_id]
        if parse_timestamp(chapter["updated_at"]).astimezone(zone).date() == local_date:
            published_today.add(story_id)

    sent = 0
    for story in stories:
        story_id = str(story["id"])
        local_date = due[story_id][1].isoformat()
        if story_id in published_today or (story_id, local_date) in already_sent:
            continue
        if not story.get("author_id"):
            continue

        # La clave primaria evita repetir el aviso del mismo día.
        try:
            db.table("story_schedule_reminders").insert({
                "story_id": story_id,
                "local_date": local_date,
            }).execute()
        except Exception:
            continue

        try:
            main.create_notification(
                story["author_id"],
                "story_schedule",
                story_id=story_id,
                data={"story_title": story.get("title")}
            )
        except Exception:
            (
                db.table("story_schedule_reminders").delete()
                .eq("story_id", story_id)
                .eq("local_date", local_date)
                .execute()
            )
            raise
        sent += 1

    return sent


REMINDER_CHECKS = (
    ("first_chapter", "primer capítulo", send_first_chapter_reminders),
    ("inactivity", "inactividad", send_inactivity_reminders),
    ("schedule", "días de escritura", send_schedule_reminders),
)


def run_all() -> dict | None:
    # Devuelve cuántos avisos de cada tipo se enviaron, o None si ya había
    # una revisión en curso.
    if not run_lock.acquire(blocking=False):
        return None

    sent = {}
    try:
        for key, label, check in REMINDER_CHECKS:
            # Un fallo puntual (por ejemplo, la base sin la tabla todavía) no
            # detiene los otros recordatorios ni las revisiones siguientes.
            try:
                sent[key] = check()
            except Exception as error:
                print(f"Error en los recordatorios de {label}:", repr(error))
                sent[key] = None
    finally:
        run_lock.release()

    return sent


def run_checks() -> None:
    if stop_event.wait(FIRST_CHECK_DELAY_SECONDS):
        return

    while True:
        run_all()

        if stop_event.wait(CHECK_INTERVAL_SECONDS):
            return


@router.post("/internal/reminders/run")
def run_from_cron(x_cron_secret: str | None = Header(default=None)):
    expected = os.getenv("REMINDERS_CRON_SECRET", "")

    if not expected:
        raise HTTPException(status_code=503, detail="El cron de recordatorios no está configurado.")
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, expected):
        raise HTTPException(status_code=403, detail="Clave incorrecta.")

    sent = run_all()
    return {"sent": sent, "skipped": sent is None}


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
