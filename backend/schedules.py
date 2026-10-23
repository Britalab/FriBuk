# ============================================================
# DÍAS DE ESCRITURA
# ============================================================
#
# Cada historia puede tener su calendario: los días de la semana y la hora
# en que su autor planea publicar. Esos días, a esa hora (en la zona horaria
# del autor), le llega un recordatorio si todavía no publicó un capítulo.
# Si el autor quiere, los lectores ven los días en la página de la historia.
#
# Los días van de 0 (lunes) a 6 (domingo). Las historias pausadas, terminadas
# o en borrador no reciben recordatorios.

from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

DAYS_IN_WEEK = 7


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


class ScheduleUpdate(BaseModel):
    days: list[int] = []
    hour: int = 19
    timezone: str = "America/Santiago"
    show_publicly: bool = True


def get_zone(name: str | None) -> ZoneInfo | None:
    try:
        return ZoneInfo(str(name))
    except (ZoneInfoNotFoundError, ValueError):
        return None


def find_story(story_id: str) -> dict:
    main = fribuk()
    story_id = main.normalize_uuid_or_404(story_id, "Historia no encontrada")
    rows = (
        main.supabase_admin.table("stories")
        .select("id, author_id, status")
        .eq("id", story_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Historia no encontrada")
    return rows[0]


def find_schedule(story_id: str) -> dict | None:
    rows = (
        fribuk().supabase_admin.table("story_schedules")
        .select("*")
        .eq("story_id", story_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def serialize_schedule(row: dict | None, full: bool) -> dict | None:
    if not row:
        return None
    schedule = {"days": sorted(int(day) for day in row.get("days") or [])}
    # La hora y la zona horaria solo las ve el autor.
    if full:
        schedule.update({
            "hour": row.get("hour"),
            "timezone": row.get("timezone"),
            "show_publicly": bool(row.get("show_publicly")),
        })
    return schedule


def optional_user_id(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if not credentials:
        return None
    try:
        return str(fribuk().get_current_user(credentials).id)
    except HTTPException:
        return None


@router.get("/stories/{story_id}/schedule")
def get_schedule(
    story_id: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security)
):
    story = find_story(story_id)
    row = find_schedule(str(story["id"]))
    is_author = optional_user_id(credentials) == str(story["author_id"])

    if is_author:
        return {"schedule": serialize_schedule(row, full=True)}

    # Los lectores solo ven los días de las historias en curso, y si el
    # autor decidió mostrarlos.
    if story.get("status") != "published" or not (row and row.get("show_publicly")):
        return {"schedule": None}
    return {"schedule": serialize_schedule(row, full=False)}


@router.put("/stories/{story_id}/schedule")
def update_schedule(
    story_id: str,
    schedule: ScheduleUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    main = fribuk()
    current_user = main.get_current_user(credentials)
    story = find_story(story_id)

    if str(story["author_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para editar esta historia."
        )

    story_id = str(story["id"])
    days = sorted(set(schedule.days))

    # Sin días elegidos, la historia deja de tener calendario.
    if not days:
        main.supabase_admin.table("story_schedules").delete().eq(
            "story_id", story_id
        ).execute()
        return {"schedule": None}

    if any(day < 0 or day >= DAYS_IN_WEEK for day in days):
        raise HTTPException(status_code=400, detail="Elige días válidos de la semana.")
    if not 0 <= schedule.hour <= 23:
        raise HTTPException(status_code=400, detail="Elige una hora válida.")
    if not get_zone(schedule.timezone):
        raise HTTPException(status_code=400, detail="No reconocimos tu zona horaria.")

    row = {
        "story_id": story_id,
        "days": days,
        "hour": schedule.hour,
        "timezone": schedule.timezone,
        "show_publicly": schedule.show_publicly,
        "updated_at": main.utc_timestamp(datetime.now(timezone.utc)),
    }
    response = (
        main.supabase_admin.table("story_schedules")
        .upsert(row, on_conflict="story_id")
        .execute()
    )
    return {"schedule": serialize_schedule(response.data[0], full=True)}
