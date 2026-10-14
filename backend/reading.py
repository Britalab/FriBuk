# ============================================================
# REGISTRO DE LECTURAS
# ============================================================
#
# Mientras alguien lee un capítulo con la pestaña visible, el lector envía
# cada 30 segundos cuánto tiempo leyó. Con eso se guarda:
#
# - chapter_reads: tiempo leído por capítulo, si lo terminó y si ya puede
#   ser Primer Lector (10 minutos o el capítulo completo).
# - reading_activity: qué historias leyó cada día, para Lector Fiel y para
#   contar los lectores únicos del mes (Autor Popular).
#
# Contra la trampa: cada aviso suma como mucho 60 segundos y nunca más que
# el tiempo real transcurrido desde el anterior. Un capítulo solo cuenta
# como terminado si se llegó al final y se leyó al menos un cuarto del
# tiempo que lleva leerlo. Las lecturas del propio autor no se registran.

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

import badges

router = APIRouter()
security = HTTPBearer()

MAX_SECONDS_PER_UPDATE = 60
# Margen para la demora de la red entre un aviso y el siguiente.
CLOCK_MARGIN_SECONDS = 5
WORDS_PER_MINUTE = 250
MIN_SHARE_TO_COMPLETE = 0.25
MIN_SECONDS_TO_COMPLETE = 10
FIRST_READER_SECONDS = 600


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    return fribuk().get_current_user(credentials)


class ReadingUpdate(BaseModel):
    seconds: int = 0
    reached_end: bool = False


def seconds_to_complete(content: str | None) -> float:
    expected = badges.count_words(content) / WORDS_PER_MINUTE * 60
    return max(MIN_SECONDS_TO_COMPLETE, expected * MIN_SHARE_TO_COMPLETE)


def add_daily_activity(user_id: str, story_id: str, seconds: int, now) -> None:
    db = badges.db()
    day = now.date().isoformat()
    existing = (
        db.table("reading_activity").select("seconds")
        .eq("user_id", user_id).eq("story_id", story_id).eq("day", day)
        .execute()
    ).data or []
    (
        db.table("reading_activity")
        .upsert(
            {
                "user_id": user_id,
                "story_id": story_id,
                "day": day,
                "seconds": (existing[0]["seconds"] if existing else 0) + seconds,
            },
            on_conflict="user_id,story_id,day",
        )
        .execute()
    )


@router.post("/chapters/{chapter_id}/reading")
def record_reading(
    chapter_id: str,
    update: ReadingUpdate,
    current_user=Depends(get_current_user),
):
    user_id = str(current_user.id)
    chapter = fribuk().get_visible_chapter(chapter_id, with_content=True)

    if chapter["story_author_id"] == user_id:
        return {"recorded": False}

    db = badges.db()
    now = badges.now_utc()
    existing = (
        db.table("chapter_reads").select("*")
        .eq("user_id", user_id).eq("chapter_id", chapter["id"])
        .execute()
    ).data
    existing = existing[0] if existing else None

    seconds = min(max(update.seconds, 0), MAX_SECONDS_PER_UPDATE)
    if existing:
        elapsed = now - (badges.parse_time(existing.get("last_read_at")) or now)
        seconds = min(seconds, max(0, int(elapsed.total_seconds()) + CLOCK_MARGIN_SECONDS))

    total = (existing or {}).get("seconds_read", 0) + seconds
    completed_at = (existing or {}).get("completed_at")
    newly_completed = False
    if not completed_at and update.reached_end and total >= seconds_to_complete(chapter.get("content")):
        completed_at = now.isoformat()
        newly_completed = True

    qualified_at = (existing or {}).get("qualified_at")
    if not qualified_at and (total >= FIRST_READER_SECONDS or completed_at):
        qualified_at = now.isoformat()

    (
        db.table("chapter_reads")
        .upsert(
            {
                "user_id": user_id,
                "chapter_id": chapter["id"],
                "story_id": chapter["story_id"],
                "seconds_read": total,
                "first_read_at": (existing or {}).get("first_read_at") or now.isoformat(),
                "last_read_at": now.isoformat(),
                "completed_at": completed_at,
                "qualified_at": qualified_at,
            },
            on_conflict="user_id,chapter_id",
        )
        .execute()
    )

    if seconds > 0:
        add_daily_activity(user_id, str(chapter["story_id"]), seconds, now)

    # Terminar un capítulo puede completar una historia (Maratonista,
    # Lector Fundador).
    if newly_completed:
        badges.schedule_refresh(user_id)

    return {
        "recorded": True,
        "seconds_read": total,
        "completed": bool(completed_at),
        "can_be_first_reader": bool(qualified_at),
    }
