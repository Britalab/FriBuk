# ============================================================
# RECONOCIMIENTOS: TÍTULOS E INSIGNIAS
# ============================================================
#
# Fase 1: los reconocimientos de escritor que se calculan con datos que ya
# existen (historias, capítulos, valoraciones y foro).
#
# - Los niveles ganados se guardan en user_badges y solo suben: lo ganado no
#   se pierde aunque después se borre una historia.
# - Los 100 cupos de Autor Fundador viven en founder_slots. Un cupo otorgado
#   no se libera, y la base de datos impide pasar de 100.
# - Historia Destacada no se guarda: la gana la historia mientras su
#   promedio siga en 4,5 o más.
#
# El backend envía nombre, emoji y descripción: el frontend no repite el catálogo.

import re
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()

# Orden de este catálogo = orden en que se muestran.
BADGES = {
    "autor_fundador": {
        "kind": "title",
        "name": "Autor Fundador",
        "emoji": "💎",
        "description": "Uno de los primeros 100 escritores en terminar una historia en FriBuk.",
        "levels": (1,),
    },
    "autor_constante": {
        "kind": "title",
        "name": "Autor Constante",
        "emoji": "📚",
        "description": "Historias terminadas.",
        "levels": (2, 3, 5),
    },
    "autor_comunidad": {
        "kind": "title",
        "name": "Autor de la Comunidad",
        "emoji": "🤝",
        "description": "Reacciones y votos positivos recibidos en los foros.",
        "levels": (25, 100, 500),
    },
    "primera_publicacion": {
        "kind": "insignia",
        "name": "Primera Publicación",
        "emoji": "🌟",
        "description": "Publicó su primer capítulo.",
        "levels": (1,),
    },
    "historia_finalizada": {
        "kind": "insignia",
        "name": "Historia Finalizada",
        "emoji": "📖",
        "description": "Historias terminadas.",
        "levels": (1, 5, 10),
    },
    "autor_versatil": {
        "kind": "insignia",
        "name": "Autor Versátil",
        "emoji": "🎭",
        "description": "Historias terminadas en géneros distintos.",
        "levels": (2, 4, 6),
    },
}

FOUNDER_AUTHOR_KIND = "author"
FOUNDER_AUTHOR_LIMIT = 100
FOUNDER_MIN_CHAPTERS = 3
FOUNDER_MIN_WORDS = 3000

FEATURED_STORY_MIN_AVERAGE = 4.5
FEATURED_STORY_MIN_RATINGS = 31  # "más de 30 valoraciones"

MAX_FEATURED_BADGES = 4
ROMAN = ("I", "II", "III")
# Las consultas con muchos ids se parten para no alargar demasiado la URL.
ID_CHUNK = 100

founder_lock = threading.Lock()


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def db():
    return fribuk().supabase_admin


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def chunks(values: list, size: int = ID_CHUNK):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def count_words(text: str | None) -> int:
    return len(re.findall(r"\S+", text or ""))


def level_for(badge_id: str, value: int) -> int:
    return sum(1 for threshold in BADGES[badge_id]["levels"] if value >= threshold)


# ============================================================
# MÉTRICAS
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
    for story_ids in chunks([str(story["id"]) for story in stories]):
        for chapter in (
            db().table("chapters")
            .select("story_id, content")
            .in_("story_id", story_ids)
            .eq("status", "published")
            .execute()
        ).data or []:
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
            str(row["id"]) for row in (
                db().table(table_name).select("id").eq("user_id", user_id).execute()
            ).data or []
        ]
        points = 0
        for ids in chunks(own_ids):
            for row in (
                db().table("forum_interactions")
                .select("user_id, kind, value")
                .in_(column, ids)
                .execute()
            ).data or []:
                if str(row.get("user_id")) == str(user_id):
                    continue
                if row.get("kind") == "reaction" or (
                    row.get("kind") == "vote" and row.get("value") == "up"
                ):
                    points += 1
        return points

    return received("forum_topics", "topic_id") + received("forum_replies", "reply_id")


# ============================================================
# GUARDADO
# ============================================================

def load_badge_rows(user_ids: list[str]) -> dict:
    # user_id -> {badge_id: fila}
    rows_by_user = {str(user_id): {} for user_id in user_ids}
    for ids in chunks([str(user_id) for user_id in user_ids]):
        for row in (
            db().table("user_badges")
            .select("user_id, badge_id, level, awarded_at")
            .in_("user_id", ids)
            .execute()
        ).data or []:
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


def claim_founder_slot(user_id: str, story_id: str) -> int | None:
    # Devuelve el cupo del usuario, o None si ya no quedan. El candado evita
    # que dos solicitudes de este servidor tomen el mismo cupo; la clave
    # primaria (kind, slot) y el límite de la tabla protegen el resto.
    with founder_lock:
        for _attempt in range(5):
            slots = founder_slots(FOUNDER_AUTHOR_KIND)
            for row in slots:
                if str(row["user_id"]) == str(user_id):
                    return row["slot"]
            next_slot = max((row["slot"] for row in slots), default=0) + 1
            if next_slot > FOUNDER_AUTHOR_LIMIT:
                return None
            try:
                (
                    db().table("founder_slots")
                    .insert({
                        "kind": FOUNDER_AUTHOR_KIND,
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


def refresh_user_badges(user_id: str) -> dict:
    # Recalcula los reconocimientos de escritor y guarda los niveles nuevos.
    # Devuelve las métricas, que sirven para mostrar el progreso.
    user_id = str(user_id)
    metrics = writer_metrics(user_id)
    metrics["community_points"] = community_points(user_id)

    levels = {
        "primera_publicacion": level_for("primera_publicacion", metrics["published_chapters"]),
        "historia_finalizada": level_for("historia_finalizada", metrics["completed_stories"]),
        "autor_constante": level_for("autor_constante", metrics["completed_stories"]),
        "autor_versatil": level_for("autor_versatil", metrics["completed_genres"]),
        "autor_comunidad": level_for("autor_comunidad", metrics["community_points"]),
    }
    existing = load_badge_rows([user_id]).get(user_id, {})

    if metrics["founder_story_id"] and "autor_fundador" not in existing:
        if claim_founder_slot(user_id, metrics["founder_story_id"]) is not None:
            levels["autor_fundador"] = 1

    save_levels(user_id, levels, existing)
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


# ============================================================
# PRESENTACIÓN
# ============================================================

def describe(badge_id: str, level: int) -> dict:
    badge = BADGES[badge_id]
    leveled = len(badge["levels"]) > 1
    return {
        "id": badge_id,
        "kind": badge["kind"],
        "name": badge["name"],
        "emoji": badge["emoji"],
        "description": badge["description"],
        "level": level,
        "level_label": ROMAN[level - 1] if leveled and level else None,
    }


def load_display_prefs(user_ids: list[str]) -> dict:
    prefs = {}
    for ids in chunks([str(user_id) for user_id in user_ids]):
        for row in (
            db().table("user_badge_display")
            .select("user_id, main_title, featured")
            .in_("user_id", ids)
            .execute()
        ).data or []:
            prefs[str(row["user_id"])] = row
    return prefs


def build_summary(rows: dict, prefs: dict | None) -> dict:
    # Lo que ven los demás: el título principal, cuántos títulos más tiene
    # (el "+N") y hasta 4 insignias destacadas.
    prefs = prefs or {}
    earned = [badge_id for badge_id in BADGES if badge_id in rows]
    titles = [describe(b, rows[b]["level"]) for b in earned if BADGES[b]["kind"] == "title"]
    insignias = [describe(b, rows[b]["level"]) for b in earned if BADGES[b]["kind"] == "insignia"]

    main_title = next(
        (title for title in titles if title["id"] == prefs.get("main_title")),
        titles[0] if titles else None,
    )
    chosen = [badge_id for badge_id in prefs.get("featured") or [] if badge_id in rows]
    by_id = {badge["id"]: badge for badge in insignias}
    featured = [by_id[badge_id] for badge_id in chosen if badge_id in by_id]
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
        rows = load_badge_rows(user_ids)
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
        return {"author": founder_counter()}
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
        rows = load_badge_rows([user_id]).get(user_id, {})
        prefs = load_display_prefs([user_id]).get(user_id)
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar tus logros"
        ) from error

    values = {
        "autor_fundador": 1 if "autor_fundador" in rows else 0,
        "autor_constante": metrics["completed_stories"],
        "autor_comunidad": metrics["community_points"],
        "primera_publicacion": metrics["published_chapters"],
        "historia_finalizada": metrics["completed_stories"],
        "autor_versatil": metrics["completed_genres"],
    }
    catalog = []
    for badge_id in BADGES:
        level = rows.get(badge_id, {}).get("level", 0)
        item = describe(badge_id, level)
        item["earned"] = level > 0
        item["max_level"] = len(BADGES[badge_id]["levels"])
        if badge_id != "autor_fundador":
            item["progress"] = progress_for(badge_id, values[badge_id], level)
        catalog.append(item)

    return {
        **build_summary(rows, prefs),
        "catalog": catalog,
        "has_published": metrics["published_chapters"] > 0,
        "display": {
            "main_title": (prefs or {}).get("main_title"),
            "featured": (prefs or {}).get("featured") or [],
        },
        "founders": {"author": founder_counter()},
    }


@router.put("/me/badges/display")
def update_my_badge_display(
    display: BadgeDisplayUpdate,
    current_user=Depends(get_current_user),
):
    user_id = str(current_user.id)
    rows = load_badge_rows([user_id]).get(user_id, {})

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
