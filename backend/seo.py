# ============================================================
# BUSCADORES Y VISTAS PREVIAS AL COMPARTIR
# ============================================================
#
# El sitio se arma en el navegador, así que un buscador o una red social que
# pide el enlace de una historia recibe una página vacía. Estos endpoints
# entregan lo que hace falta para rellenarla antes de enviarla (lo usa la
# función de Cloudflare en frontend/functions) y el mapa del sitio.
#
# Solo exponen lo que cualquier visitante sin sesión ya puede ver: historias
# visibles y capítulos publicados. Un borrador responde igual que una
# historia inexistente.

import hashlib
import html
import os
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

import images
from accounts import DELETED_USERNAME_PREFIX

router = APIRouter()

SITE_URL = (os.getenv("SITE_URL") or "https://www.fribuk.com").strip().rstrip("/")

STORY_NOT_FOUND_DETAIL = "Historia no encontrada"
USER_NOT_FOUND_DETAIL = "Usuario no encontrado"
AVATAR_DOWNLOAD_TIMEOUT_SECONDS = 5
# Un día: cada enlace nuevo lleva el ?v= de la foto actual.
AVATAR_PREVIEW_CACHE_SECONDS = 86400
# Texto del capítulo que se entrega para lectura sin JavaScript.
CHAPTER_TEXT_MAX_LENGTH = 20000
SITEMAP_PAGE_SIZE = 1000
SITEMAP_MAX_URLS = 5000
# Páginas públicas que no dependen de la base de datos.
SITEMAP_STATIC_PATHS = (
    "/", "/autores", "/forum", "/consejos", "/preguntas-frecuentes", "/terminos", "/comunidad",
    "/contenido",
    "/derechos-autor", "/privacidad", "/moderacion"
)


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def get_visible_story(story_id: str) -> dict:
    main = fribuk()
    normalized_id = main.normalize_uuid_or_404(story_id, STORY_NOT_FOUND_DETAIL)

    response = (
        main.supabase_admin
        .table("stories")
        .select("*")
        .eq("id", normalized_id)
        .limit(1)
        .execute()
    )

    if (
        not response.data
        or response.data[0].get("status") not in main.VISIBLE_STORY_STATUSES
    ):
        raise HTTPException(status_code=404, detail=STORY_NOT_FOUND_DETAIL)

    return response.data[0]


@router.get("/seo/stories/{story_id}")
def get_story_preview(story_id: str, chapter_id: str | None = None):
    main = fribuk()
    story = get_visible_story(story_id)

    author_response = (
        main.supabase_admin
        .table("users")
        .select("username")
        .eq("id", story.get("author_id"))
        .limit(1)
        .execute()
    )
    chapters = (
        main.supabase_admin
        .table("chapters")
        .select("id, title, chapter_number, status")
        .eq("story_id", str(story["id"]))
        .eq("status", "published")
        .order("chapter_number")
        .execute()
    ).data or []

    preview = {
        "id": str(story["id"]),
        "title": story.get("title") or "",
        "description": story.get("description") or "",
        "genre": story.get("genre") or "",
        "cover_url": story.get("cover_url") or None,
        "author_id": str(story["author_id"]) if story.get("author_id") else None,
        "author_username": (
            author_response.data[0].get("username") if author_response.data else None
        ),
        "chapters": [
            {"id": str(chapter["id"]), "title": chapter.get("title") or ""}
            for chapter in chapters
        ],
        "chapter": None
    }

    if chapter_id is not None:
        normalized_chapter_id = main.normalize_uuid_or_404(
            chapter_id, STORY_NOT_FOUND_DETAIL
        )
        position = next(
            (
                index for index, chapter in enumerate(chapters)
                if str(chapter["id"]) == normalized_chapter_id
            ),
            None
        )

        # Un capítulo en borrador, o de otra historia, no existe para lectores.
        if position is None:
            raise HTTPException(status_code=404, detail=STORY_NOT_FOUND_DETAIL)

        content = (
            main.supabase_admin
            .table("chapters")
            .select("id, content")
            .eq("id", normalized_chapter_id)
            .limit(1)
            .execute()
        ).data
        text = (content[0].get("content") if content else None) or ""

        preview["chapter"] = {
            "id": normalized_chapter_id,
            "title": chapters[position].get("title") or "",
            # La posición que ve el lector, no el número guardado.
            "position": position + 1,
            "content": text[:CHAPTER_TEXT_MAX_LENGTH],
            "is_truncated": len(text) > CHAPTER_TEXT_MAX_LENGTH
        }

    return preview


def get_visible_profile(user_id: str) -> dict:
    # Datos públicos de un perfil. Una cuenta eliminada no existe para nadie.
    main = fribuk()
    profile = main.get_public_profile_data(main.get_public_auth_user(user_id))
    username = profile.get("username") or ""

    if not username or username.lower().startswith(DELETED_USERNAME_PREFIX):
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)
    return profile


def avatar_version(avatar_url: str) -> str:
    # El ?v= de la foto cambia al reemplazarla: así las redes sociales, que
    # guardan la imagen de cada enlace, no siguen mostrando la anterior.
    version = parse_qs(urlparse(avatar_url).query).get("v", [""])[0]
    return version or hashlib.sha1(avatar_url.encode()).hexdigest()[:10]


@router.get("/seo/users/{user_id}")
def get_profile_preview(user_id: str):
    main = fribuk()
    profile = get_visible_profile(user_id)

    # Si la información adicional falla, la vista previa sale sin ella.
    try:
        info = main.get_user_profile_info(profile["id"])
    except Exception:
        info = {}

    stories = (
        main.supabase_admin
        .table("stories")
        .select("id, title")
        .eq("author_id", profile["id"])
        .in_("status", list(main.VISIBLE_STORY_STATUSES))
        .execute()
    ).data or []
    avatar_url = profile.get("avatar_url")

    return {
        "id": profile["id"],
        "username": profile["username"],
        "display_name": info.get("display_name") or None,
        "bio": info.get("bio") or None,
        # La foto se entrega aparte, en JPEG (ver get_profile_preview_avatar).
        "avatar_version": avatar_version(avatar_url) if avatar_url else None,
        "stories": [
            {"id": str(story["id"]), "title": story.get("title") or ""}
            for story in stories
        ]
    }


def download_avatar(avatar_url: str) -> bytes:
    main = fribuk()
    storage_prefix = (main.SUPABASE_URL or "").strip().rstrip("/") + "/storage/v1/object/public/"
    # Solo imágenes guardadas en nuestro Storage.
    if not avatar_url.startswith(storage_prefix):
        raise ValueError("La foto no está en el Storage de FriBuk")

    response = httpx.get(avatar_url, timeout=AVATAR_DOWNLOAD_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.content


@router.get("/seo/users/{user_id}/avatar.jpg")
def get_profile_preview_avatar(user_id: str):
    # Las fotos de perfil se guardan en WebP, que no todas las redes sociales
    # muestran al compartir un enlace: aquí se entregan en JPEG pequeño. Se
    # lee la foto actual, así que una retirada por moderación deja de verse.
    avatar_url = get_visible_profile(user_id).get("avatar_url")
    if not avatar_url:
        raise HTTPException(status_code=404, detail="Este perfil no tiene foto")

    try:
        data, content_type, _extension = images.optimize_image(
            download_avatar(avatar_url), images.AVATAR_PREVIEW
        )
    except Exception as error:
        print("No se pudo preparar la foto para la vista previa:", repr(error))
        raise HTTPException(status_code=404, detail="Este perfil no tiene foto")

    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": f"public, max-age={AVATAR_PREVIEW_CACHE_SECONDS}"}
    )


def fetch_all(table: str, columns: str, apply_filters) -> list[dict]:
    main = fribuk()
    rows = []
    offset = 0

    while len(rows) < SITEMAP_MAX_URLS:
        page = (
            apply_filters(main.supabase_admin.table(table).select(columns))
            .order("id")
            .range(offset, offset + SITEMAP_PAGE_SIZE - 1)
            .execute()
        ).data or []
        rows.extend(page)

        if len(page) < SITEMAP_PAGE_SIZE:
            break
        offset += SITEMAP_PAGE_SIZE

    return rows


def sitemap_entry(path: str, last_modified: str | None = None) -> str:
    # Solo la fecha: es lo que los buscadores usan de este dato.
    date = (last_modified or "")[:10]
    lastmod = f"<lastmod>{html.escape(date)}</lastmod>" if len(date) == 10 else ""
    return f"<url><loc>{html.escape(SITE_URL + path)}</loc>{lastmod}</url>"


@router.get("/sitemap.xml")
def get_sitemap():
    main = fribuk()
    entries = [sitemap_entry(path) for path in SITEMAP_STATIC_PATHS]

    stories = fetch_all(
        "stories", "*",
        lambda query: query.in_("status", list(main.VISIBLE_STORY_STATUSES))
    )
    visible_story_ids = {str(story["id"]) for story in stories}

    for story in stories:
        entries.append(sitemap_entry(
            f"/stories/{story['id']}",
            story.get("updated_at") or story.get("created_at")
        ))

    chapters = fetch_all(
        "chapters", "id, story_id, status, updated_at, created_at",
        lambda query: query.eq("status", "published")
    )

    for chapter in chapters:
        if str(chapter.get("story_id")) not in visible_story_ids:
            continue
        entries.append(sitemap_entry(
            f"/stories/{chapter['story_id']}/chapters/{chapter['id']}",
            chapter.get("updated_at") or chapter.get("created_at")
        ))

    # Consejos para escribir publicados (ver tips.py).
    tips = fetch_all(
        "writing_tips", "slug, status, updated_at, published_at",
        lambda query: query.eq("status", "published")
    )

    for tip in tips:
        entries.append(sitemap_entry(
            f"/consejos/{tip['slug']}",
            tip.get("updated_at") or tip.get("published_at")
        ))

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(entries[:SITEMAP_MAX_URLS])
        + "</urlset>"
    )

    return Response(
        content=body,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"}
    )
