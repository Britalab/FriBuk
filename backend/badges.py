# ============================================================
# RECONOCIMIENTOS: TÍTULOS E INSIGNIAS
# ============================================================
#
# Fase 1: los reconocimientos de escritor que se calculan con datos que ya
# existen (historias, capítulos, valoraciones y foro).
# Fase 2: los de lector, Autor Popular y Autor en Ascenso, que usan el
# registro de lecturas (ver reading.py).
#
# - Los niveles ganados se guardan en user_badges y solo suben: lo ganado no
#   se pierde aunque después se borre una historia.
# - Los cupos de Autor Fundador (100) y Lector Fundador (500) viven en
#   founder_slots. Un cupo otorgado no se libera, y la base de datos impide
#   pasar del límite.
# - Los títulos temporales no se guardan en user_badges: Autor Popular sale
#   del top 10 del mes anterior (popular_authors) y Autor en Ascenso dura
#   30 días (temporary_titles).
# - Historia Destacada no se guarda: la gana la historia mientras su
#   promedio siga en 4,5 o más.
#
# El backend envía nombre, emoji y descripción: el frontend no repite el catálogo.

import re
import threading
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()

# Orden de este catálogo = orden en que se muestran (y el título principal
# por defecto es el primero ganado).
BADGES = {
    "autor_fundador": {
        "kind": "title",
        "group": "escritor",
        "name": "Autor Fundador",
        "emoji": "💎",
        "description": "Uno de los primeros 100 escritores en terminar una historia en FriBuk.",
        "levels": (1,),
    },
    "autor_popular": {
        "kind": "title",
        "group": "escritor",
        "name": "Autor Popular",
        "emoji": "❤️",
        "description": "Top 10 del mes en lectores únicos.",
        "levels": (1,),
        "temporary": True,
    },
    "autor_en_ascenso": {
        "kind": "title",
        "group": "escritor",
        "name": "Autor en Ascenso",
        "emoji": "🔥",
        "description": "100 seguidores nuevos en 30 días. El título dura 30 días.",
        "levels": (1,),
        "temporary": True,
    },
    "autor_constante": {
        "kind": "title",
        "group": "escritor",
        "name": "Autor Constante",
        "emoji": "📚",
        "description": "Historias terminadas.",
        "levels": (2, 3, 5),
    },
    "autor_comunidad": {
        "kind": "title",
        "group": "escritor",
        "name": "Autor de la Comunidad",
        "emoji": "🤝",
        "description": "Reacciones y votos positivos recibidos en los foros.",
        "levels": (25, 100, 500),
    },
    "lector_fundador": {
        "kind": "title",
        "group": "lector",
        "name": "Lector Fundador",
        "emoji": "💎",
        "description": "Uno de los primeros 500 lectores en terminar una historia y dejar 3 comentarios.",
        "levels": (1,),
    },
    "primera_publicacion": {
        "kind": "insignia",
        "group": "escritor",
        "name": "Primera Publicación",
        "emoji": "🌟",
        "description": "Publicó su primer capítulo.",
        "levels": (1,),
    },
    "historia_finalizada": {
        "kind": "insignia",
        "group": "escritor",
        "name": "Historia Finalizada",
        "emoji": "📖",
        "description": "Historias terminadas.",
        "levels": (1, 5, 10),
    },
    "autor_versatil": {
        "kind": "insignia",
        "group": "escritor",
        "name": "Autor Versátil",
        "emoji": "🎭",
        "description": "Historias terminadas en géneros distintos.",
        "levels": (2, 4, 6),
    },
    "primer_lector": {
        "kind": "insignia",
        "group": "lector",
        "name": "Primer Lector",
        "emoji": "👀",
        "description": "Primer comentario de un capítulo, después de leerlo 10 minutos o completo.",
        "levels": (1, 10, 50),
    },
    "comentarista": {
        "kind": "insignia",
        "group": "lector",
        "name": "Comentarista",
        "emoji": "💬",
        "description": "Reacciones de los autores a tus comentarios.",
        "levels": (10, 50, 200),
    },
    "maratonista": {
        "kind": "insignia",
        "group": "lector",
        "name": "Maratonista",
        "emoji": "🏃",
        "description": "Historias terminadas leídas completas.",
        "levels": (5, 20, 50),
    },
    "lector_fiel": {
        "kind": "insignia",
        "group": "lector",
        "name": "Lector Fiel",
        "emoji": "💌",
        "description": "Semanas seguidas leyendo al menos 5 días, siguiendo a algún autor.",
        "levels": (4, 26, 52),
    },
}

FOUNDER_AUTHOR_KIND = "author"
FOUNDER_AUTHOR_LIMIT = 100
FOUNDER_MIN_CHAPTERS = 2
FOUNDER_MIN_WORDS = 3000

FOUNDER_READER_KIND = "reader"
FOUNDER_READER_LIMIT = 500
FOUNDER_READER_MIN_COMMENTS = 3

FEATURED_STORY_MIN_AVERAGE = 4.5
FEATURED_STORY_MIN_RATINGS = 31  # "más de 30 valoraciones"

POPULAR_TOP = 10
RISING_FOLLOWERS = 100
RISING_DAYS = 30
LOYAL_DAYS_PER_WEEK = 5

MAX_FEATURED_BADGES = 4
ROMAN = ("I", "II", "III")
MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
# Las consultas con muchos ids se parten para no alargar demasiado la URL.
ID_CHUNK = 100
# Supabase devuelve como máximo 1000 filas por consulta.
PAGE_SIZE = 1000

founder_lock = threading.Lock()
popular_lock = threading.Lock()
# Mes -> {user_id: lectores}. Un mes terminado no cambia: se guarda una vez.
popular_cache = {}


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def db():
    return fribuk().supabase_admin


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def parse_time(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        moment = value
    else:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def chunks(values: list, size: int = ID_CHUNK):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def fetch_all(make_query) -> list:
    # Recorre todas las páginas de una consulta.
    rows = []
    while True:
        page = (
            make_query().range(len(rows), len(rows) + PAGE_SIZE - 1).execute()
        ).data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows


def select_in(table_name: str, columns: str, column: str, values, **filters) -> list:
    # Filas cuyo `column` está en `values`, en grupos para no alargar la URL.
    rows = []
    for ids in chunks([str(value) for value in dict.fromkeys(values)]):
        def make_query(ids=ids):
            query = db().table(table_name).select(columns).in_(column, ids)
            for key, value in filters.items():
                query = query.eq(key, value)
            return query
        rows.extend(fetch_all(make_query))
    return rows


def count_words(text: str | None) -> int:
    return len(re.findall(r"\S+", text or ""))


def level_for(badge_id: str, value: int) -> int:
    return sum(1 for threshold in BADGES[badge_id]["levels"] if value >= threshold)


# ============================================================
# MÉTRICAS DE ESCRITOR
# ============================================================

def writer_metrics(user_id: str) -> dict:
    main = fribuk()
    stories = (
        db().table("stories")
        .select("id, genre, status, created_at")
        .eq("author_id", user_id)
        .in_("status", list(main.VISIBLE_STORY_STATUSES))
        .execute()
    ).data or []

    chapters_by_story = {}
    for chapter in select_in(
        "chapters", "story_id, content", "story_id",
        [story["id"] for story in stories], status="published",
    ):
        chapters_by_story.setdefault(str(chapter["story_id"]), []).append(chapter)

    completed = []
    founder_story = None
    for story in sorted(stories, key=lambda row: str(row.get("created_at") or "")):
        chapters = chapters_by_story.get(str(story["id"]), [])
        if story.get("status") != "completed" or not chapters:
            continue
        completed.append(story)
        words = sum(count_words(chapter.get("content")) for chapter in chapters)
        if (
            founder_story is None
            and len(chapters) >= FOUNDER_MIN_CHAPTERS
            and words >= FOUNDER_MIN_WORDS
        ):
            founder_story = story

    genres = {
        (story.get("genre") or "").strip().lower()
        for story in completed
        if (story.get("genre") or "").strip()
    }

    return {
        "published_chapters": sum(len(rows) for rows in chapters_by_story.values()),
        "completed_stories": len(completed),
        "completed_genres": len(genres),
        "founder_story_id": str(founder_story["id"]) if founder_story else None,
    }


def community_points(user_id: str) -> int:
    # Reacciones y votos positivos que otras personas dieron a sus temas y
    # respuestas del foro. Los mensajes propios no suman: así no se premia el
    # spam. Iniciar sesión exige el correo confirmado, así que toda
    # interacción viene de una cuenta verificada.
    def received(table_name: str, column: str) -> int:
        own_ids = [
            row["id"] for row in (
                db().table(table_name).select("id").eq("user_id", user_id).execute()
            ).data or []
        ]
        return sum(
            1
            for row in select_in("forum_interactions", "user_id, kind, value", column, own_ids)
            if str(row.get("user_id")) != str(user_id)
            and (
                row.get("kind") == "reaction"
                or (row.get("kind") == "vote" and row.get("value") == "up")
            )
        )

    return received("forum_topics", "topic_id") + received("forum_replies", "reply_id")


def new_followers(user_id: str, days: int = RISING_DAYS) -> int:
    since = now_utc() - timedelta(days=days)
    rows = fetch_all(
        lambda: db().table("user_follows").select("created_at").eq("following_id", user_id)
    )
    return sum(1 for row in rows if (parse_time(row.get("created_at")) or since) > since)


# ============================================================
# MÉTRICAS DE LECTOR
# ============================================================

def finished_stories(user_id: str) -> int:
    # Historias terminadas de las que leyó completos todos los capítulos
    # publicados. Las propias no cuentan (no se registran sus lecturas).
    reads = fetch_all(
        lambda: db().table("chapter_reads")
        .select("chapter_id, story_id, completed_at")
        .eq("user_id", user_id)
    )
    completed_chapters = {str(row["chapter_id"]) for row in reads if row.get("completed_at")}
    story_ids = {str(row["story_id"]) for row in reads if row.get("completed_at")}
    if not story_ids:
        return 0

    finished_ids = {
        str(story["id"])
        for story in select_in("stories", "id", "id", story_ids, status="completed")
    }
    chapters_by_story = {}
    for chapter in select_in(
        "chapters", "id, story_id", "story_id", finished_ids, status="published"
    ):
        chapters_by_story.setdefault(str(chapter["story_id"]), set()).add(str(chapter["id"]))

    return sum(
        1 for chapters in chapters_by_story.values()
        if chapters and chapters <= completed_chapters
    )


def visible_comment_count(user_id: str) -> int:
    chapter_comments = (
        db().table("chapter_comments").select("id")
        .eq("user_id", user_id).eq("status", "visible").execute()
    ).data or []
    story_comments = (
        db().table("comments").select("id").eq("author_id", user_id).execute()
    ).data or []
    return len(chapter_comments) + len(story_comments)


def author_reactions_received(user_id: str) -> int:
    # 💬 Comentarista: reacciones que el autor de la historia dejó en tus
    # comentarios de sus capítulos.
    comments = fetch_all(
        lambda: db().table("chapter_comments").select("id, chapter_id")
        .eq("user_id", user_id).eq("status", "visible")
    )
    if not comments:
        return 0

    chapter_story = {
        str(row["id"]): str(row["story_id"])
        for row in select_in("chapters", "id, story_id", "id", [c["chapter_id"] for c in comments])
    }
    story_author = {
        str(row["id"]): str(row["author_id"])
        for row in select_in("stories", "id, author_id", "id", set(chapter_story.values()))
    }
    author_of_comment = {
        str(comment["id"]): story_author.get(chapter_story.get(str(comment["chapter_id"])))
        for comment in comments
    }

    return sum(
        1
        for reaction in select_in(
            "chapter_comment_reactions", "comment_id, user_id", "comment_id", author_of_comment
        )
        if author_of_comment.get(str(reaction["comment_id"])) == str(reaction["user_id"])
        and str(reaction["user_id"]) != str(user_id)
    )


def best_loyal_streak(user_id: str) -> int:
    # 💌 Lector Fiel: la racha más larga de semanas seguidas con al menos 5
    # días de lectura. Solo cuenta si sigue a algún autor.
    follows = (
        db().table("user_follows").select("following_id")
        .eq("follower_id", user_id).limit(1).execute()
    ).data or []
    if not follows:
        return 0

    days = {
        date.fromisoformat(str(row["day"])[:10])
        for row in fetch_all(
            lambda: db().table("reading_activity").select("day").eq("user_id", user_id)
        )
    }
    days_by_week = {}
    for day in days:
        monday = day - timedelta(days=day.weekday())
        days_by_week[monday] = days_by_week.get(monday, 0) + 1

    loyal_weeks = sorted(
        monday for monday, count in days_by_week.items() if count >= LOYAL_DAYS_PER_WEEK
    )
    best = streak = 0
    previous = None
    for monday in loyal_weeks:
        streak = streak + 1 if previous and monday - previous == timedelta(days=7) else 1
        best = max(best, streak)
        previous = monday
    return best


def first_reader_count(user_id: str) -> int:
    return len((
        db().table("first_reader_claims").select("chapter_id").eq("user_id", user_id).execute()
    ).data or [])


def reader_metrics(user_id: str) -> dict:
    return {
        "finished_stories": finished_stories(user_id),
        "visible_comments": visible_comment_count(user_id),
        "author_reactions": author_reactions_received(user_id),
        "loyal_weeks": best_loyal_streak(user_id),
        "first_reader": first_reader_count(user_id),
    }


# ============================================================
# GUARDADO
# ============================================================

def load_badge_rows(user_ids: list[str]) -> dict:
    # user_id -> {badge_id: fila} con lo guardado (no los títulos temporales).
    rows_by_user = {str(user_id): {} for user_id in user_ids}
    for row in select_in("user_badges", "user_id, badge_id, level, awarded_at", "user_id", user_ids):
        if row.get("badge_id") in BADGES:
            rows_by_user.setdefault(str(row["user_id"]), {})[row["badge_id"]] = row
    return rows_by_user


def save_levels(user_id: str, levels: dict, existing: dict) -> None:
    for badge_id, level in levels.items():
        current = existing.get(badge_id)
        if level <= 0 or (current and current.get("level", 0) >= level):
            continue
        if current:
            (
                db().table("user_badges")
                .update({"level": level, "updated_at": now_iso()})
                .eq("user_id", user_id)
                .eq("badge_id", badge_id)
                .execute()
            )
            continue
        try:
            (
                db().table("user_badges")
                .insert({"user_id": user_id, "badge_id": badge_id, "level": level})
                .execute()
            )
        except Exception:
            # Otra solicitud la creó al mismo tiempo: solo se sube el nivel.
            (
                db().table("user_badges")
                .update({"level": level, "updated_at": now_iso()})
                .eq("user_id", user_id)
                .eq("badge_id", badge_id)
                .execute()
            )


def founder_slots(kind: str) -> list:
    return (
        db().table("founder_slots")
        .select("slot, user_id")
        .eq("kind", kind)
        .execute()
    ).data or []


def claim_founder_slot(
    user_id: str,
    story_id: str | None,
    kind: str = FOUNDER_AUTHOR_KIND,
    limit: int = FOUNDER_AUTHOR_LIMIT,
) -> int | None:
    # Devuelve el cupo del usuario, o None si ya no quedan. El candado evita
    # que dos solicitudes de este servidor tomen el mismo cupo; la clave
    # primaria (kind, slot) y el límite de la tabla protegen el resto.
    with founder_lock:
        for _attempt in range(5):
            slots = founder_slots(kind)
            for row in slots:
                if str(row["user_id"]) == str(user_id):
                    return row["slot"]
            next_slot = max((row["slot"] for row in slots), default=0) + 1
            if next_slot > limit:
                return None
            try:
                (
                    db().table("founder_slots")
                    .insert({
                        "kind": kind,
                        "slot": next_slot,
                        "user_id": user_id,
                        "story_id": story_id,
                    })
                    .execute()
                )
                return next_slot
            except Exception as error:
                print("Cupo de fundador ocupado, se reintenta:", repr(error))
    return None


def update_rising_title(user_id: str, followers: int) -> None:
    # 🔥 Autor en Ascenso: 100 seguidores nuevos en 30 días dan el título por
    # 30 días. Si sigue creciendo a ese ritmo, se extiende.
    if followers < RISING_FOLLOWERS:
        return
    (
        db().table("temporary_titles")
        .upsert(
            {
                "user_id": user_id,
                "badge_id": "autor_en_ascenso",
                "starts_at": now_iso(),
                "ends_at": (now_utc() + timedelta(days=RISING_DAYS)).isoformat(),
            },
            on_conflict="user_id,badge_id",
        )
        .execute()
    )


def refresh_user_badges(user_id: str) -> dict:
    # Recalcula los reconocimientos y guarda los niveles nuevos. Devuelve las
    # métricas, que sirven para mostrar el progreso.
    user_id = str(user_id)
    metrics = writer_metrics(user_id)
    metrics["community_points"] = community_points(user_id)
    metrics["new_followers"] = new_followers(user_id)
    metrics.update(reader_metrics(user_id))

    levels = {
        "primera_publicacion": level_for("primera_publicacion", metrics["published_chapters"]),
        "historia_finalizada": level_for("historia_finalizada", metrics["completed_stories"]),
        "autor_constante": level_for("autor_constante", metrics["completed_stories"]),
        "autor_versatil": level_for("autor_versatil", metrics["completed_genres"]),
        "autor_comunidad": level_for("autor_comunidad", metrics["community_points"]),
        "primer_lector": level_for("primer_lector", metrics["first_reader"]),
        "comentarista": level_for("comentarista", metrics["author_reactions"]),
        "maratonista": level_for("maratonista", metrics["finished_stories"]),
        "lector_fiel": level_for("lector_fiel", metrics["loyal_weeks"]),
    }
    existing = load_badge_rows([user_id]).get(user_id, {})

    if metrics["founder_story_id"] and "autor_fundador" not in existing:
        if claim_founder_slot(user_id, metrics["founder_story_id"]) is not None:
            levels["autor_fundador"] = 1

    if (
        "lector_fundador" not in existing
        and metrics["finished_stories"] >= 1
        and metrics["visible_comments"] >= FOUNDER_READER_MIN_COMMENTS
    ):
        if claim_founder_slot(
            user_id, None, FOUNDER_READER_KIND, FOUNDER_READER_LIMIT
        ) is not None:
            levels["lector_fundador"] = 1

    save_levels(user_id, levels, existing)
    update_rising_title(user_id, metrics["new_followers"])
    return metrics


def schedule_refresh(user_id) -> None:
    # Se recalcula en segundo plano: nunca debe romper ni retrasar la acción
    # que lo origina (publicar un capítulo, terminar una historia, votar).
    # Usa la misma cola que las notificaciones (y las pruebas la reemplazan).
    if user_id:
        fribuk().run_notification_task(refresh_user_badges, str(user_id))


def schedule_refresh_for_forum_target(table_name: str, target_id: str) -> None:
    # Una reacción o un voto suma para quien escribió el tema o la respuesta.
    try:
        rows = (
            db().table(table_name).select("user_id").eq("id", target_id).execute()
        ).data or []
        if rows:
            schedule_refresh(rows[0].get("user_id"))
    except Exception as error:
        print("No se pudo buscar el autor para sus reconocimientos:", repr(error))


def claim_first_reader(chapter: dict, user_id: str, comment_id: str) -> None:
    # 👀 Primer Lector: el primer comentario principal de un capítulo, de
    # alguien que no es su autor y que ya lo leyó 10 minutos o completo.
    if str(chapter.get("story_author_id")) == str(user_id):
        return
    reads = (
        db().table("chapter_reads").select("qualified_at")
        .eq("user_id", user_id).eq("chapter_id", chapter["id"]).execute()
    ).data or []
    if not reads or not reads[0].get("qualified_at"):
        return
    claimed = (
        db().table("first_reader_claims").select("chapter_id")
        .eq("chapter_id", chapter["id"]).execute()
    ).data or []
    if claimed:
        return
    try:
        (
            db().table("first_reader_claims")
            .insert({"chapter_id": chapter["id"], "user_id": user_id, "comment_id": comment_id})
            .execute()
        )
    except Exception:
        # Otro comentario lo reclamó al mismo tiempo (clave primaria).
        return
    refresh_user_badges(user_id)


def schedule_first_reader(chapter: dict, user_id: str, comment_id: str) -> None:
    fribuk().run_notification_task(claim_first_reader, chapter, str(user_id), str(comment_id))


# ============================================================
# AUTOR POPULAR
# ============================================================

def month_start(day: date) -> date:
    return day.replace(day=1)


def previous_month(day: date) -> date:
    return month_start(month_start(day) - timedelta(days=1))


def month_label(month: date) -> str:
    return f"{MONTHS[month.month - 1]} {month.year}"


def compute_popular(month: date) -> dict:
    # Lectores únicos de cada autor durante el mes: quienes leyeron algún
    # capítulo de sus historias. Las lecturas propias no se registran.
    next_month = month_start(month + timedelta(days=32))
    days = [
        (month + timedelta(days=offset)).isoformat()
        for offset in range((next_month - month).days)
    ]
    activity = select_in("reading_activity", "user_id, story_id", "day", days)
    story_author = {
        str(row["id"]): str(row["author_id"])
        for row in select_in("stories", "id, author_id", "id", {r["story_id"] for r in activity})
    }
    readers = {}
    for row in activity:
        author_id = story_author.get(str(row["story_id"]))
        if author_id and author_id != str(row["user_id"]):
            readers.setdefault(author_id, set()).add(str(row["user_id"]))

    ranking = sorted(readers.items(), key=lambda item: (-len(item[1]), item[0]))
    return {author_id: len(ids) for author_id, ids in ranking[:POPULAR_TOP]}


def popular_authors(month: date | None = None) -> dict:
    # ❤️ Autor Popular: el top 10 del mes anterior tiene el título durante el
    # mes en curso. Un mes terminado se calcula una sola vez y se guarda.
    month = month or previous_month(now_utc().date())
    with popular_lock:
        if month in popular_cache:
            return popular_cache[month]

        stored = (
            db().table("popular_authors").select("user_id, readers")
            .eq("month", month.isoformat()).execute()
        ).data or []
        if stored:
            holders = {str(row["user_id"]): row["readers"] for row in stored}
        else:
            holders = compute_popular(month)
            ranked = sorted(holders.items(), key=lambda item: (-item[1], item[0]))
            for rank, (user_id, count) in enumerate(ranked, start=1):
                try:
                    (
                        db().table("popular_authors")
                        .insert({
                            "month": month.isoformat(), "user_id": user_id,
                            "rank": rank, "readers": count,
                        })
                        .execute()
                    )
                except Exception as error:
                    # Otro servidor ya lo guardó: el resultado es el mismo.
                    print("Ranking de Autor Popular ya guardado:", repr(error))

        popular_cache[month] = holders
        return holders


def temporary_rows(user_ids: list[str]) -> dict:
    # user_id -> {badge_id: fila} con los títulos temporales vigentes.
    rows_by_user = {}
    month = previous_month(now_utc().date())
    try:
        holders = popular_authors(month)
    except Exception as error:
        print("No se pudo calcular Autor Popular:", repr(error))
        holders = {}
    for user_id in user_ids:
        if str(user_id) in holders:
            rows_by_user.setdefault(str(user_id), {})["autor_popular"] = {
                "level": 1, "period": month_label(month),
            }

    now = now_utc()
    for row in select_in("temporary_titles", "user_id, badge_id, ends_at", "user_id", user_ids):
        ends_at = parse_time(row.get("ends_at"))
        if row.get("badge_id") in BADGES and ends_at and ends_at > now:
            rows_by_user.setdefault(str(row["user_id"]), {})[row["badge_id"]] = {
                "level": 1, "ends_at": ends_at.isoformat(),
            }
    return rows_by_user


def load_display_rows(user_ids: list[str]) -> dict:
    # Lo guardado más los títulos temporales vigentes.
    user_ids = [str(user_id) for user_id in user_ids]
    rows = load_badge_rows(user_ids)
    try:
        for user_id, temporary in temporary_rows(user_ids).items():
            rows.setdefault(user_id, {}).update(temporary)
    except Exception as error:
        print("No se pudieron cargar los títulos temporales:", repr(error))
    return rows


# ============================================================
# PRESENTACIÓN
# ============================================================

def describe(badge_id: str, row: dict | None) -> dict:
    badge = BADGES[badge_id]
    level = (row or {}).get("level", 0)
    leveled = len(badge["levels"]) > 1
    return {
        "id": badge_id,
        "kind": badge["kind"],
        "group": badge["group"],
        "name": badge["name"],
        "emoji": badge["emoji"],
        "description": badge["description"],
        "level": level,
        "level_label": ROMAN[level - 1] if leveled and level else None,
        "temporary": bool(badge.get("temporary")),
        # "oct 2026" para Autor Popular.
        "period": (row or {}).get("period"),
    }


def load_display_prefs(user_ids: list[str]) -> dict:
    return {
        str(row["user_id"]): row
        for row in select_in("user_badge_display", "user_id, main_title, featured", "user_id", user_ids)
    }


def build_summary(rows: dict, prefs: dict | None) -> dict:
    # Lo que ven los demás: el título principal, los demás títulos (el "+N")
    # y hasta 4 insignias destacadas.
    prefs = prefs or {}
    earned = [badge_id for badge_id in BADGES if badge_id in rows]
    titles = [describe(b, rows[b]) for b in earned if BADGES[b]["kind"] == "title"]
    insignias = [describe(b, rows[b]) for b in earned if BADGES[b]["kind"] == "insignia"]

    main_title = next(
        (title for title in titles if title["id"] == prefs.get("main_title")),
        titles[0] if titles else None,
    )
    by_id = {badge["id"]: badge for badge in insignias}
    featured = [by_id[badge_id] for badge_id in prefs.get("featured") or [] if badge_id in by_id]
    if not featured:
        featured = insignias[:MAX_FEATURED_BADGES]

    return {
        "main_title": main_title,
        "other_titles": [title for title in titles if title is not main_title],
        "featured": featured[:MAX_FEATURED_BADGES],
        "titles": titles,
        "insignias": insignias,
    }


def summaries_for(user_ids) -> dict:
    # user_id -> resumen público. Si algo falla, nadie muestra reconocimientos
    # y la página se carga igual.
    user_ids = list({str(user_id) for user_id in user_ids if user_id})
    if not user_ids:
        return {}
    try:
        rows = load_display_rows(user_ids)
        prefs = load_display_prefs(user_ids)
        return {
            user_id: build_summary(rows.get(user_id, {}), prefs.get(user_id))
            for user_id in user_ids
        }
    except Exception as error:
        print("No se pudieron cargar los reconocimientos:", repr(error))
        return {}


def author_title_chip(summary: dict | None) -> dict | None:
    # Lo que va junto al nombre en historias y tarjetas: título + "+N".
    if not summary or not summary.get("main_title"):
        return None
    return {
        "main_title": summary["main_title"],
        "other_titles": summary["other_titles"],
    }


def is_featured_story(general_ratings: list) -> bool:
    # ⭐ Historia Destacada: promedio de 4,5 o más con más de 30 valoraciones.
    if len(general_ratings) < FEATURED_STORY_MIN_RATINGS:
        return False
    return sum(general_ratings) / len(general_ratings) >= FEATURED_STORY_MIN_AVERAGE


def progress_for(badge_id: str, value: int, level: int) -> dict:
    levels = BADGES[badge_id]["levels"]
    next_goal = levels[level] if level < len(levels) else None
    return {"current": value, "next": next_goal}


def founder_counter(kind: str = FOUNDER_AUTHOR_KIND, limit: int = FOUNDER_AUTHOR_LIMIT) -> dict:
    taken = len(founder_slots(kind))
    return {"total": limit, "taken": taken, "remaining": max(0, limit - taken)}


def founder_counters() -> dict:
    return {
        "author": founder_counter(),
        "reader": founder_counter(FOUNDER_READER_KIND, FOUNDER_READER_LIMIT),
    }


# ============================================================
# RUTAS
# ============================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    return fribuk().get_current_user(credentials)


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    return fribuk().get_current_admin(credentials)


class BadgeDisplayUpdate(BaseModel):
    main_title: str | None = None
    featured: list[str] = []


@router.get("/badges/founders")
def get_founder_counter():
    # Contador público para el marketing: "Quedan N cupos de Autor Fundador".
    try:
        return founder_counters()
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudo cargar el contador de fundadores"
        ) from error


@router.get("/users/{user_id}/badges")
def get_user_badges(user_id: str):
    # Perfil público: solo lo ganado, sin progreso.
    summary = summaries_for([user_id]).get(str(user_id))
    return summary or build_summary({}, None)


@router.get("/me/badges")
def get_my_badges(current_user=Depends(get_current_user)):
    # Perfil propio: se recalcula al entrar, para ponerse al día con lo que
    # haya pasado sin pasar por una acción que recalcule.
    user_id = str(current_user.id)
    try:
        metrics = refresh_user_badges(user_id)
        rows = load_display_rows([user_id]).get(user_id, {})
        prefs = load_display_prefs([user_id]).get(user_id)
        founders = founder_counters()
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar tus logros"
        ) from error

    values = {
        "autor_en_ascenso": metrics["new_followers"],
        "autor_constante": metrics["completed_stories"],
        "autor_comunidad": metrics["community_points"],
        "primera_publicacion": metrics["published_chapters"],
        "historia_finalizada": metrics["completed_stories"],
        "autor_versatil": metrics["completed_genres"],
        "primer_lector": metrics["first_reader"],
        "comentarista": metrics["author_reactions"],
        "maratonista": metrics["finished_stories"],
        "lector_fiel": metrics["loyal_weeks"],
    }
    catalog = []
    for badge_id in BADGES:
        item = describe(badge_id, rows.get(badge_id))
        item["earned"] = item["level"] > 0
        item["max_level"] = len(BADGES[badge_id]["levels"])
        if badge_id == "autor_en_ascenso":
            item["progress"] = {"current": values[badge_id], "next": RISING_FOLLOWERS}
        elif badge_id in values:
            item["progress"] = progress_for(badge_id, values[badge_id], item["level"])
        catalog.append(item)

    return {
        **build_summary(rows, prefs),
        "catalog": catalog,
        "has_published": metrics["published_chapters"] > 0,
        "reader_progress": {
            "finished_stories": metrics["finished_stories"],
            "visible_comments": metrics["visible_comments"],
            "comments_needed": FOUNDER_READER_MIN_COMMENTS,
        },
        "display": {
            "main_title": (prefs or {}).get("main_title"),
            "featured": (prefs or {}).get("featured") or [],
        },
        "founders": founders,
    }


@router.put("/me/badges/display")
def update_my_badge_display(
    display: BadgeDisplayUpdate,
    current_user=Depends(get_current_user),
):
    user_id = str(current_user.id)
    rows = load_display_rows([user_id]).get(user_id, {})

    main_title = display.main_title or None
    if main_title and (
        main_title not in rows or BADGES[main_title]["kind"] != "title"
    ):
        raise HTTPException(status_code=400, detail="Solo puedes elegir un título que hayas ganado")

    featured = list(dict.fromkeys(display.featured))
    if len(featured) > MAX_FEATURED_BADGES:
        raise HTTPException(
            status_code=400,
            detail=f"Puedes destacar hasta {MAX_FEATURED_BADGES} insignias",
        )
    if any(
        badge_id not in rows or BADGES[badge_id]["kind"] != "insignia"
        for badge_id in featured
    ):
        raise HTTPException(status_code=400, detail="Solo puedes destacar insignias que hayas ganado")

    try:
        (
            db().table("user_badge_display")
            .upsert(
                {
                    "user_id": user_id,
                    "main_title": main_title,
                    "featured": featured,
                    "updated_at": now_iso(),
                },
                on_conflict="user_id",
            )
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudo guardar tu elección"
        ) from error

    return build_summary(rows, {"main_title": main_title, "featured": featured})


@router.post("/admin/badges/recalculate")
def recalculate_all_badges(_admin=Depends(get_current_admin)):
    # Para ponerse al día una sola vez tras crear las tablas: recalcula a
    # todos los autores. Se recorren en orden de su primera historia
    # terminada, para que los cupos de fundador sigan el orden de llegada.
    stories = (
        db().table("stories")
        .select("author_id, status, created_at")
        .in_("status", list(fribuk().VISIBLE_STORY_STATUSES))
        .order("created_at")
        .execute()
    ).data or []

    first_seen = {}
    for story in stories:
        author_id = str(story.get("author_id") or "")
        if not author_id:
            continue
        # Primero quienes tienen historias terminadas, en orden de antigüedad.
        rank = (0 if story.get("status") == "completed" else 1, str(story.get("created_at") or ""))
        if author_id not in first_seen or rank < first_seen[author_id]:
            first_seen[author_id] = rank

    failed = 0
    for author_id in sorted(first_seen, key=first_seen.get):
        try:
            refresh_user_badges(author_id)
        except Exception as error:
            failed += 1
            print("No se pudo recalcular a un autor:", repr(error))

    return {
        "authors": len(first_seen),
        "failed": failed,
        "founders": founder_counter(),
    }
