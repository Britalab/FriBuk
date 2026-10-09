from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from postgrest.exceptions import APIError
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr
from email_service import send_welcome_email
import admin_alerts
from chapter_anchors import build_anchor, locate_anchor
from profile_catalog import (
    DEFAULT_PROFILE_THEME,
    MAX_AMBIENT_DECORATIONS,
    MAX_EMOJI_DECORATIONS,
    PROFILE_DECORATIONS,
    PROFILE_THEME_ACCENTS,
)
from typing import Literal
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from collections import deque
import base64
import json
import threading
import time
from urllib.parse import urlparse
import re
import httpx
import uuid
from pathlib import Path
import os



# ============================================================
# CONFIGURACIÓN DE RUTAS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

print("Carpeta de main.py:", BASE_DIR)
print("Ruta del .env:", ENV_FILE)
print("¿Existe .env?:", ENV_FILE.exists())


# ============================================================
# VARIABLES DE ENTORNO
# ============================================================

load_dotenv(ENV_FILE)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print("¿SUPABASE_URL cargada?:", bool(SUPABASE_URL))
print("¿SUPABASE_ANON_KEY cargada?:", bool(SUPABASE_ANON_KEY))
print(
    "¿SUPABASE_SERVICE_ROLE_KEY cargada?:",
    bool(SUPABASE_SERVICE_ROLE_KEY)
)


# ============================================================
# VALIDACIÓN DE VARIABLES
# ============================================================

if not SUPABASE_URL:
    raise RuntimeError("Falta SUPABASE_URL en el archivo .env")

if not SUPABASE_ANON_KEY:
    raise RuntimeError("Falta SUPABASE_ANON_KEY en el archivo .env")

if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Falta SUPABASE_SERVICE_ROLE_KEY en el archivo .env"
    )


# ============================================================
# CONEXIONES CON SUPABASE
# ============================================================

# Los clientes se comparten entre los hilos que atienden las peticiones.
# Con HTTP/2 todos usan una sola conexión y las peticiones simultáneas
# fallan (httpx.ReadError); sin HTTP/2 cada hilo usa su propia conexión.

# Cliente administrativo.
# NUNCA debe exponerse al frontend.
supabase_admin: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    options=SyncClientOptions(httpx_client=httpx.Client(http2=False))
)

# Cliente público.
# Utilizado para operaciones normales.
supabase_public: Client = create_client(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    options=SyncClientOptions(httpx_client=httpx.Client(http2=False))
)


security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

def get_supabase_user(access_token: str):
    client = create_client(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    )

    client.postgrest.auth(access_token)

    return client 

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response = supabase_public.auth.get_user(access_token)

        if not response.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        return response.user

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado"
        )
# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(title="FriBuk API")


# ============================================================
# CONFIGURACIÓN CORS
# ============================================================


# Orígenes extra, separados por comas, en la variable CORS_ALLOWED_ORIGINS
# (ver .env.example): el frontend abierto desde el celular en la red local
# o, en producción, el dominio del sitio. Nunca se permite "*".
CORS_ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:5173"] + [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip() and origin.strip() != "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# ERRORES DE BASE DE DATOS NO CONTROLADOS
# ============================================================

@app.exception_handler(APIError)
async def handle_database_error(request: Request, error: APIError):
    # Nunca se devuelve al cliente el mensaje interno de la base de datos.
    known_error = known_database_error(error)
    if known_error:
        return JSONResponse(
            status_code=known_error[0],
            content={"detail": known_error[1]}
        )

    print("Error de base de datos:", repr(error))
    return JSONResponse(
        status_code=500,
        content={
            "detail": "No se pudo completar la operación. Inténtalo nuevamente."
        }
    )


# ============================================================
# MODELOS PYDANTIC
# ============================================================

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    accepted_terms: bool = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SessionRefreshRequest(BaseModel):
    refresh_token: str


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr


class PasswordUpdateRequest(BaseModel):
    # Código del enlace del correo. Se canjea recién al enviar el formulario.
    token_hash: str | None = None
    # Enlaces del formato anterior, que ya traían una sesión de recuperación.
    access_token: str | None = None
    password: str
    
class StoryCreate(BaseModel):
    title: str
    description: str | None = None
    cover_url: str | None = None
    genre: str | None = None
    tags: list[str] = []
    status: str = "draft"

    work_type: str = "original"
    original_work: str | None = None
    original_author: str | None = None

    sensitive_content: bool = False
    content_warnings: list[str] = []

class StoryUpdate(BaseModel):
    title: str
    description: str | None = None
    cover_url: str | None = None
    genre: str | None = None
    status: str = "draft"
    work_type: str = "original"
    original_work: str | None = None
    original_author: str | None = None
    sensitive_content: bool = False
    content_warnings: list[str] = []
    # Sin enviar (None), las etiquetas de la historia no se tocan.
    tags: list[str] | None = None

class CommentCreate(BaseModel):
    story_id: str
    content: str

class VoteCreate(BaseModel):
    story_id: str

class FavoriteCreate(BaseModel):
    story_id: str

class ChapterCreate(BaseModel):
    story_id: str
    chapter_number: int
    title: str
    content: str
    status: str = "draft"
    
class ChapterUpdate(BaseModel):
    chapter_number: int
    title: str
    content: str
    # Opcional: solo se usa para publicar un borrador.
    status: str | None = None

class RatingCreate(BaseModel):
    story_id: str    
    plot: int
    spelling: int

class ProfileUpdate(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    website_url: str | None = None

class SupportRequestCreate(BaseModel):
    category: str
    message: str | None = None
    story_title: str | None = None
    fribuk_url: str | None = None
    external_url: str | None = None
    reported_url: str | None = None
    
class SupportStatusUpdate(BaseModel):
    status: str
    
class ForumTopicCreate(BaseModel):
    title: str
    content: str
    image_url: str | None = None
    
class ForumReplyCreate(BaseModel):
    content: str
    image_url: str | None = None


ForumVoteValue = Literal["up", "down"]
ForumReactionValue = Literal[
    "heart",
    "laugh",
    "surprised",
    "clap",
    "sad",
    "angry",
    "blush"
]


class ForumVoteCreate(BaseModel):
    value: ForumVoteValue


class ForumReactionCreate(BaseModel):
    value: ForumReactionValue


# Reacciones de los comentarios de capítulos. Son independientes de las
# reacciones del foro: se guardan en su propia tabla.
ChapterCommentReactionValue = Literal[
    "heart",
    "laugh",
    "surprised",
    "sad",
    "angry",
    "clap",
    "love",
    "thinking",
    "impact",
    "sensitive",
    "rofl",
    "fire",
    "eyes",
    "skull",
    "unamused",
    "lip_bite",
    "lips",
    "eye"
]


class ChapterCommentCreate(BaseModel):
    content: str
    # Una respuesta indica parent_id; un comentario nuevo indica el fragmento.
    parent_id: str | None = None
    paragraph_index: int | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    quote: str | None = None


class ChapterCommentUpdate(BaseModel):
    content: str


class ChapterCommentReactionCreate(BaseModel):
    value: ChapterCommentReactionValue
# ============================================================
# VALIDACIONES Y SEGURIDAD COMPARTIDAS
# ============================================================

STORY_STATUSES = {"draft", "published", "completed", "paused"}
# Estados en los que una historia es visible para lectores: puede listarse,
# guardarse en favoritos y agregarse a listas de lectura. "draft" no lo es.
VISIBLE_STORY_STATUSES = ("published", "completed", "paused")
# Advertencias de contenido que puede marcar el autor. Son solo un aviso
# para el lector: no bloquean ni filtran historias.
STORY_CONTENT_WARNINGS = ("violence", "strong_language", "sensitive_topics")
STORY_WORK_TYPES = {
    "original",
    "fanfic",
    "adaptation",
    "translation",
    "public_domain",
    "other"
}
CHAPTER_STATUSES = {"draft", "published"}
MAX_STORY_TAGS = 30
MAX_UPLOAD_IMAGE_SIZE = 5 * 1024 * 1024
STORY_COVER_URL_PREFIX = (
    SUPABASE_URL.strip().rstrip("/") + "/storage/v1/object/public/story-covers/"
)
USERNAME_PATTERN = re.compile(r"^[\w.\-]{3,30}$")
URL_SCHEME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:")


def public_error_detail(
    error: Exception,
    fallback: str = "No se pudo completar la operación. Inténtalo nuevamente."
) -> str:
    # El detalle real (mensajes de la base de datos, rutas internas, etc.)
    # queda solo en el registro del servidor; al cliente va un texto genérico.
    known_error = known_database_error(error)
    if known_error:
        raise HTTPException(
            status_code=known_error[0],
            detail=known_error[1]
        ) from error

    print("Error interno:", repr(error))
    return fallback


def known_database_error(error: Exception) -> tuple[int, str] | None:
    # Errores de la base de datos causados por la propia petición:
    # se responden como 404 o 400 en lugar de un error interno.
    code = getattr(error, "code", None)

    if code == "22P02":
        # Un id con formato inválido equivale a un recurso que no existe.
        return 404, "Recurso no encontrado"
    if str(code) == "403":
        # El proveedor de la base de datos bloqueó la petición por
        # contener texto sospechoso (por ejemplo, un intento de inyección).
        return 400, "Solicitud no válida"

    return None


def ensure_max_length(value: str | None, max_length: int, label: str) -> None:
    if value is not None and len(value) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"{label} no puede superar los {max_length} caracteres"
        )


def clean_text_field(
    value: str | None,
    label: str,
    max_length: int,
    required: bool = False,
    single_line: bool = True
) -> str | None:
    text = (value or "").replace("\r\n", "\n").strip()

    if not text:
        if required:
            raise HTTPException(
                status_code=400,
                detail=f"{label} es obligatorio"
            )
        return None

    if single_line and ("\n" in text or "\r" in text):
        raise HTTPException(
            status_code=400,
            detail=f"{label} no puede tener saltos de línea"
        )

    ensure_max_length(text, max_length, label)
    return text


def clean_public_url(value: str | None, label: str, max_length: int = 500) -> str | None:
    # Solo se guardan enlaces http(s): un enlace "javascript:" o "data:"
    # podría ejecutar código cuando otra persona lo abre.
    url = (value or "").strip()

    if not url:
        return None

    if any(char.isspace() or ord(char) < 32 for char in url):
        raise HTTPException(
            status_code=400,
            detail=f"{label} no es un enlace válido"
        )

    if not re.match(r"^https?://", url, re.IGNORECASE):
        if URL_SCHEME_PATTERN.match(url):
            raise HTTPException(
                status_code=400,
                detail=f"{label} debe comenzar con http:// o https://"
            )
        url = f"https://{url}"

    ensure_max_length(url, max_length, label)
    return url


def clean_username(value: str | None) -> str:
    username = (value or "").strip()

    if not USERNAME_PATTERN.match(username):
        raise HTTPException(
            status_code=400,
            detail=(
                "El nombre de usuario debe tener entre 3 y 30 caracteres y solo "
                "puede incluir letras, números, guion, guion bajo y punto"
            )
        )

    return username


def validate_story_fields(story) -> dict:
    status = story.status
    work_type = story.work_type
    cover_url = (story.cover_url or "").strip() or None
    sensitive_content = bool(story.sensitive_content)

    if any(
        warning not in STORY_CONTENT_WARNINGS
        for warning in story.content_warnings
    ):
        raise HTTPException(
            status_code=400,
            detail="Advertencia de contenido no válida"
        )
    # Sin contenido sensible no se guardan advertencias. Se conserva el
    # orden fijo de la lista y se descartan las repetidas.
    content_warnings = [
        warning
        for warning in STORY_CONTENT_WARNINGS
        if sensitive_content and warning in story.content_warnings
    ]

    if status not in STORY_STATUSES:
        raise HTTPException(status_code=400, detail="Estado de historia no válido")
    if work_type not in STORY_WORK_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de obra no válido")
    # La portada solo puede ser una imagen subida a FriBuk: una URL externa
    # permitiría rastrear a quien visite la historia.
    if cover_url and not cover_url.startswith(STORY_COVER_URL_PREFIX):
        raise HTTPException(
            status_code=400,
            detail="La portada debe ser una imagen subida a FriBuk"
        )

    return {
        "title": clean_text_field(story.title, "El título", 150, required=True),
        "description": clean_text_field(
            story.description, "La descripción", 1000, single_line=False
        ),
        "cover_url": cover_url,
        "genre": clean_text_field(story.genre, "El género", 50),
        "status": status,
        "work_type": work_type,
        "original_work": clean_text_field(
            story.original_work, "La obra original", 150
        ),
        "original_author": clean_text_field(
            story.original_author, "El autor original", 150
        ),
        "sensitive_content": sensitive_content,
        "content_warnings": content_warnings
    }


def clean_story_tags(tags: list[str]) -> list[str]:
    clean_tags = []

    for tag in tags:
        tag_name = (tag or "").strip()
        if not tag_name or tag_name in clean_tags:
            continue
        ensure_max_length(tag_name, 30, "Cada etiqueta")
        clean_tags.append(tag_name)

    if len(clean_tags) > MAX_STORY_TAGS:
        raise HTTPException(
            status_code=400,
            detail=f"Una historia puede tener hasta {MAX_STORY_TAGS} etiquetas"
        )

    return clean_tags


def attach_story_tags(story_id: str, tags: list[str]) -> None:
    # Relaciona la historia con sus etiquetas, creando las que no existan.
    for tag_name in tags:
        tag_response = (
            supabase_admin
            .table("tags")
            .select("id")
            .eq("name", tag_name)
            .execute()
        )

        if tag_response.data:
            tag_id = tag_response.data[0]["id"]
        else:
            new_tag_response = (
                supabase_admin
                .table("tags")
                .insert({"name": tag_name})
                .execute()
            )
            tag_id = new_tag_response.data[0]["id"]

        supabase_admin.table("story_tags").insert({
            "story_id": story_id,
            "tag_id": tag_id
        }).execute()


def replace_story_tags(story_id: str, tags: list[str]) -> None:
    supabase_admin.table("story_tags").delete().eq("story_id", story_id).execute()
    attach_story_tags(story_id, tags)


def get_story_tags(story_ids: list) -> dict[str, list[str]]:
    # Etiquetas de cada historia. Si la consulta falla, las historias se
    # muestran igual, sin etiquetas.
    ids = [str(story_id) for story_id in story_ids if story_id]
    if not ids:
        return {}

    try:
        links = (
            supabase_admin
            .table("story_tags")
            .select("story_id, tag_id")
            .in_("story_id", ids)
            .execute()
        ).data or []
        tag_ids = list({str(link["tag_id"]) for link in links})
        if not tag_ids:
            return {}

        tags = (
            supabase_admin
            .table("tags")
            .select("id, name")
            .in_("id", tag_ids)
            .execute()
        ).data or []
    except Exception as e:
        print("No se pudieron cargar las etiquetas:", repr(e))
        return {}

    names_by_id = {str(tag["id"]): tag.get("name") for tag in tags}
    tags_by_story: dict[str, list[str]] = {}
    for link in links:
        name = names_by_id.get(str(link["tag_id"]))
        story_tags = tags_by_story.setdefault(str(link["story_id"]), [])
        if name and name not in story_tags:
            story_tags.append(name)

    return tags_by_story


def validate_chapter_fields(chapter_number: int, title: str, content: str) -> dict:
    if not (1 <= chapter_number <= 100000):
        raise HTTPException(
            status_code=400,
            detail="El número del capítulo debe ser mayor que 0"
        )

    return {
        "chapter_number": chapter_number,
        "title": clean_text_field(
            title, "El título del capítulo", 255, required=True
        ),
        "content": clean_text_field(
            content,
            "El contenido del capítulo",
            500000,
            required=True,
            single_line=False
        )
    }


def validate_support_request(support) -> dict:
    return {
        "category": clean_text_field(
            support.category, "La categoría", 100, required=True
        ),
        "message": clean_text_field(
            support.message, "El mensaje", 1000, single_line=False
        ),
        "story_title": clean_text_field(
            support.story_title, "El título de la historia", 150
        ),
        "fribuk_url": clean_public_url(support.fribuk_url, "El enlace de FriBuk"),
        "external_url": clean_public_url(support.external_url, "El enlace externo"),
        "reported_url": clean_public_url(
            support.reported_url, "El enlace del contenido reportado"
        )
    }


def ensure_story_accepts_interactions(story_id: str, user_id: str) -> str:
    # Comentar, recomendar o valorar solo se permite en historias visibles.
    # Un borrador ajeno responde igual que una historia inexistente.
    try:
        normalized_id = str(uuid.UUID(story_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Historia no encontrada")

    story_response = (
        supabase_admin
        .table("stories")
        .select("id, author_id, status")
        .eq("id", normalized_id)
        .limit(1)
        .execute()
    )

    if not story_response.data:
        raise HTTPException(status_code=404, detail="Historia no encontrada")

    story = story_response.data[0]

    if story.get("status") == "draft" and str(story.get("author_id")) != str(user_id):
        raise HTTPException(status_code=404, detail="Historia no encontrada")

    return normalized_id


def read_validated_image(file: UploadFile, allowed_types: tuple) -> tuple[bytes, str]:
    # El tipo declarado por el navegador no basta: también se comprueba que
    # el contenido sea realmente una imagen de ese tipo. La extensión sale
    # del tipo validado, nunca del nombre de archivo enviado.
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Solo se permiten imágenes JPG, JPEG o PNG"
        )

    file_bytes = file.file.read(MAX_UPLOAD_IMAGE_SIZE + 1)

    if not file_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(file_bytes) > MAX_UPLOAD_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="La imagen no puede superar los 5 MB"
        )

    extension, matches_content = FORUM_IMAGE_TYPES[file.content_type]

    if not matches_content(file_bytes):
        raise HTTPException(
            status_code=400,
            detail="El archivo no es una imagen JPG o PNG válida"
        )

    return file_bytes, extension

# ============================================================
# RUTA PRINCIPAL
# ============================================================

@app.get("/")
def root():
    return {
        "message": "FriBuk API funcionando :D"
    }


# ============================================================
# HISTORIAS
# ============================================================

@app.get("/stories")
def get_stories():

    response = (
        supabase_admin
        .table("stories")
        .select("*")
        .in_("status", VISIBLE_STORY_STATUSES)
        .execute()
    )

    stories = response.data
    author_ids = list({story["author_id"] for story in stories if story.get("author_id")})
    usernames_by_id = {}
    # Las etiquetas (tropos y temas) permiten buscar y filtrar en el inicio.
    tags_by_story = get_story_tags([story["id"] for story in stories])

    if author_ids:
        users_response = (
            supabase_admin
            .table("users")
            .select("id, username")
            .in_("id", author_ids)
            .execute()
        )
        usernames_by_id = {
            str(user["id"]): user["username"]
            for user in users_response.data
        }

    for story in stories:
        story["author_username"] = usernames_by_id.get(
            str(story.get("author_id")),
            "Autor desconocido"
        )
        story["tags"] = tags_by_story.get(str(story["id"]), [])

        # ❤️ Cantidad de personas que pulsaron "Recomendar"
        votes_response = (
            supabase_public
            .table("votes")
            .select("id", count="exact")
            .eq("story_id", story["id"])
            .execute()
        )

        recommendation_count = votes_response.count or 0

        story["recommendation_count"] = recommendation_count

        # ⭐ Valoraciones de trama y ortografía
        ratings_response = (
            supabase_public
            .table("ratings")
            .select("plot, spelling")
            .eq("story_id", story["id"])
            .execute()
        )

        ratings = ratings_response.data

        if ratings:

            general_ratings = [
                (rating["plot"] + rating["spelling"]) / 2
                for rating in ratings
            ]

            story["general_rating"] = round(
                sum(general_ratings) / len(general_ratings),
                1
            )

        else:

            story["general_rating"] = None

    return stories


@app.get("/my-stories")
def get_my_stories(current_user=Depends(get_current_user)):
    try:
        response = (
            supabase_admin
            .table("stories")
            .select("*")
            .eq("author_id", str(current_user.id))
            .execute()
        )

        stories = response.data
        chapter_counts = get_chapter_counts(
            [story["id"] for story in stories],
            include_drafts=True
        )

        for story in stories:
            story["chapter_count"] = chapter_counts.get(str(story["id"]), 0)

        return {"stories": stories}

    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


def get_chapter_counts(story_ids: list[str], include_drafts: bool) -> dict[str, int]:
    normalized_story_ids = list({str(story_id) for story_id in story_ids})
    chapter_counts = {story_id: 0 for story_id in normalized_story_ids}

    if not normalized_story_ids:
        return chapter_counts

    query = (
        supabase_admin
        .table("chapters")
        .select("story_id")
        .in_("story_id", normalized_story_ids)
    )

    if not include_drafts:
        query = query.eq("status", "published")

    response = query.execute()

    for chapter in response.data:
        story_id = str(chapter["story_id"])
        chapter_counts[story_id] = chapter_counts.get(story_id, 0) + 1

    return chapter_counts

@app.delete("/stories/{story_id}")
def delete_story(
    story_id: str,
    current_user=Depends(get_current_user)
):
    story_response = (
        supabase_admin
        .table("stories")
        .select("id, author_id")
        .eq("id", story_id)
        .maybe_single()
        .execute()
    )

    story = story_response.data

    if not story:
        raise HTTPException(
            status_code=404,
            detail="Historia no encontrada"
        )

    if story["author_id"] != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para eliminar esta historia"
        )

    # Eliminar datos relacionados
    supabase_admin.table("comments").delete().eq(
        "story_id", story_id
    ).execute()

    supabase_admin.table("votes").delete().eq(
        "story_id", story_id
    ).execute()

    supabase_admin.table("ratings").delete().eq(
        "story_id", story_id
    ).execute()

    supabase_admin.table("favorites").delete().eq(
        "story_id", story_id
    ).execute()

    supabase_admin.table("chapters").delete().eq(
        "story_id", story_id
    ).execute()

    # Finalmente eliminar la historia
    supabase_admin.table("stories").delete().eq(
        "id", story_id
    ).execute()

    return {
        "message": "Historia eliminada correctamente"
    }
    
@app.get("/stories/{story_id}")
def get_story(
    story_id: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security)
):
    try:
        # Primero buscamos la historia con el cliente admin.
        # Esto permite encontrar tanto historias publicadas
        # como borradores.
        response = (
            supabase_admin
            .table("stories")
            .select("*")
            .eq("id", story_id)
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="Historia no encontrada"
            )

        story = response.data[0]

        # Si es un borrador, solamente puede verlo su autor.
        if story["status"] == "draft":

            # Si no hay token, no puede acceder.
            if not credentials:
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para ver esta historia."
                )

            access_token = credentials.credentials

            # Validamos el token con Supabase Auth.
            response_user = supabase_public.auth.get_user(access_token)

            if not response_user.user:
                raise HTTPException(
                    status_code=401,
                    detail="Token inválido"
                )

            current_user = response_user.user

            # Comprobamos que el usuario sea el autor.
            if str(current_user.id) != str(story["author_id"]):
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para ver esta historia."
                )

        # Buscar el nombre del autor
        author_response = (
            supabase_admin
            .table("users")
            .select("username")
            .eq("id", story["author_id"])
            .execute()
        )

        if author_response.data:
            story["author_username"] = author_response.data[0]["username"]
        else:
            story["author_username"] = "Autor desconocido"

        story["tags"] = get_story_tags([story["id"]]).get(str(story["id"]), [])

        return story

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
# ============================================================
# USUARIOS
# ============================================================

@app.get("/users")
def get_users():

    response = (
        supabase_public
        .table("users")
        .select("id, username")
        .execute()
    )

    return response.data


def get_public_auth_user(user_id: str):
    try:
        normalized_user_id = str(uuid.UUID(user_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    try:
        response = supabase_admin.auth.admin.get_user_by_id(normalized_user_id)
        if not response.user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return response.user
    except HTTPException:
        raise
    except Exception as e:
        if getattr(e, "status", None) == 404:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar la información pública del usuario"
        ) from e


def get_public_profile_data(auth_user) -> dict:
    metadata = auth_user.user_metadata or {}
    username = metadata.get("username")

    if not username:
        try:
            user_response = (
                supabase_admin
                .table("users")
                .select("username")
                .eq("id", str(auth_user.id))
                .execute()
            )
            if user_response.data:
                username = user_response.data[0].get("username")
        except Exception:
            username = None

    return {
        "id": str(auth_user.id),
        "username": username,
        "avatar_url": metadata.get("avatar_url"),
        "banner_url": metadata.get("banner_url")
    }


def add_public_story_card_data(stories: list[dict]) -> list[dict]:
    if not stories:
        return stories

    story_ids = [str(story["id"]) for story in stories]
    author_ids = list({
        str(story["author_id"])
        for story in stories
        if story.get("author_id")
    })
    usernames_by_id = {}

    if author_ids:
        users_response = (
            supabase_admin
            .table("users")
            .select("id, username")
            .in_("id", author_ids)
            .execute()
        )
        usernames_by_id = {
            str(user["id"]): user.get("username")
            for user in users_response.data
        }

    chapter_counts = get_chapter_counts(story_ids, include_drafts=False)

    for story in stories:
        story_id = str(story["id"])
        story["author_username"] = usernames_by_id.get(
            str(story.get("author_id")),
            "Autor desconocido"
        )
        story["chapter_count"] = chapter_counts.get(story_id, 0)

        votes_response = (
            supabase_public
            .table("votes")
            .select("id", count="exact")
            .eq("story_id", story_id)
            .execute()
        )
        story["recommendation_count"] = votes_response.count or 0

        ratings_response = (
            supabase_public
            .table("ratings")
            .select("plot, spelling")
            .eq("story_id", story_id)
            .execute()
        )
        ratings = ratings_response.data

        if ratings:
            general_ratings = [
                (rating["plot"] + rating["spelling"]) / 2
                for rating in ratings
            ]
            story["general_rating"] = round(
                sum(general_ratings) / len(general_ratings),
                1
            )
        else:
            story["general_rating"] = None

    return stories

def add_forum_user_data(items: list[dict]) -> list[dict]:
    if not items:
        return items

    user_ids = list({
        str(item["user_id"])
        for item in items
        if item.get("user_id")
    })

    if not user_ids:
        return items

    usernames_by_id = {}
    for user_id in user_ids:
        try:
            auth_user = get_public_auth_user(user_id)
            profile_data = get_public_profile_data(auth_user)
            usernames_by_id[user_id] = profile_data.get("username") or "Usuario"
        except HTTPException as e:
            if e.status_code != 404:
                raise
            usernames_by_id[user_id] = "Usuario"

    for item in items:
        item["username"] = usernames_by_id.get(
            str(item.get("user_id")),
            "Usuario"
        )

    return items

# ============================================================
# INFORMACIÓN DE PERFIL
# ============================================================

PROFILE_INFO_FIELDS = ("display_name", "bio", "website_url")


def get_user_profile_info(user_id: str) -> dict:
    response = (
        supabase_admin
        .table("user_profiles")
        .select("display_name, bio, website_url")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = response.data[0] if response.data else {}

    return {field: row.get(field) for field in PROFILE_INFO_FIELDS}


def clean_profile_update(profile: ProfileUpdate) -> dict:
    display_name = (profile.display_name or "").strip() or None
    bio = (profile.bio or "").replace("\r\n", "\n").strip() or None
    website_url = (profile.website_url or "").strip() or None

    if display_name:
        if "\n" in display_name or "\r" in display_name:
            raise HTTPException(
                status_code=400,
                detail="El nombre visible no puede tener saltos de línea"
            )
        if len(display_name) > 50:
            raise HTTPException(
                status_code=400,
                detail="El nombre visible no puede superar los 50 caracteres"
            )

    if bio and len(bio) > 500:
        raise HTTPException(
            status_code=400,
            detail="La biografía no puede superar los 500 caracteres"
        )

    if website_url:
        if not re.match(r"^https?://", website_url, re.IGNORECASE):
            website_url = f"https://{website_url}"

        try:
            hostname = urlparse(website_url).hostname or ""
        except ValueError:
            hostname = ""

        if "." not in hostname or any(char.isspace() for char in website_url):
            raise HTTPException(
                status_code=400,
                detail="El sitio web no es una dirección válida"
            )
        if len(website_url) > 200:
            raise HTTPException(
                status_code=400,
                detail="El sitio web no puede superar los 200 caracteres"
            )

    return {
        "display_name": display_name,
        "bio": bio,
        "website_url": website_url
    }


def get_own_profile_data(current_user, profile_info: dict) -> dict:
    metadata = current_user.user_metadata or {}

    return {
        "id": str(current_user.id),
        "username": metadata.get("username"),
        "avatar_url": metadata.get("avatar_url"),
        "banner_url": metadata.get("banner_url"),
        **profile_info
    }


@app.get("/me/profile")
def get_my_profile(current_user=Depends(get_current_user)):
    try:
        profile_info = get_user_profile_info(str(current_user.id))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar la información de tu perfil"
        ) from e

    return {"profile": get_own_profile_data(current_user, profile_info)}


@app.put("/me/profile")
def update_my_profile(
    profile: ProfileUpdate,
    current_user=Depends(get_current_user)
):
    profile_info = clean_profile_update(profile)

    try:
        supabase_admin.table("user_profiles").upsert(
            {
                "user_id": str(current_user.id),
                **profile_info,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            on_conflict="user_id"
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo guardar la información de tu perfil"
        ) from e

    return {
        "message": "Perfil actualizado",
        "profile": get_own_profile_data(current_user, profile_info)
    }


@app.get("/users/{user_id}/public-profile")
def get_public_profile(user_id: str):
    auth_user = get_public_auth_user(user_id)
    profile_data = get_public_profile_data(auth_user)

    # Si la información adicional falla, el perfil público se muestra sin ella.
    try:
        profile_data.update(get_user_profile_info(profile_data["id"]))
    except Exception:
        profile_data.update({field: None for field in PROFILE_INFO_FIELDS})

    # Igual con la personalización: si falla, se usa el tema por defecto.
    try:
        profile_data["customization"] = get_user_customization(profile_data["id"])
    except Exception:
        profile_data["customization"] = default_customization()

    return {"user": profile_data}


@app.get("/users/{user_id}/stories")
def get_public_user_stories(user_id: str):
    auth_user = get_public_auth_user(user_id)

    try:
        response = (
            supabase_admin
            .table("stories")
            .select("*")
            .eq("author_id", str(auth_user.id))
            .in_("status", VISIBLE_STORY_STATUSES)
            .order("created_at", desc=True)
            .execute()
        )
        stories = add_public_story_card_data(response.data)

        profile_username = get_public_profile_data(auth_user).get("username")
        for story in stories:
            if story.get("author_username") == "Autor desconocido":
                story["author_username"] = profile_username or "Autor desconocido"

        return {"user_id": str(auth_user.id), "stories": stories}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar las historias públicas del usuario"
        ) from e


@app.get("/users/{user_id}/favorites")
def get_public_user_favorites(user_id: str):
    auth_user = get_public_auth_user(user_id)

    try:
        response = (
            supabase_admin
            .table("favorites")
            .select("id, story_id, created_at, stories(*)")
            .eq("user_id", str(auth_user.id))
            .order("created_at", desc=True)
            .execute()
        )

        favorites = []
        favorite_stories = []
        for favorite in response.data:
            story = favorite.get("stories")
            if (
                not isinstance(story, dict)
                or story.get("status") not in VISIBLE_STORY_STATUSES
            ):
                continue

            public_favorite = dict(favorite)
            public_favorite["stories"] = dict(story)
            favorites.append(public_favorite)
            favorite_stories.append(public_favorite["stories"])

        add_public_story_card_data(favorite_stories)
        return {"user_id": str(auth_user.id), "favorites": favorites}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar los favoritos públicos del usuario"
        ) from e


# ============================================================
# REGISTRO
# ============================================================

# ============================================================
# ACEPTACIÓN DE TÉRMINOS
# ============================================================

# Versión vigente de los Términos y Condiciones. Debe actualizarse junto
# con el texto de Terms.jsx: cada versión genera una aceptación distinta,
# lo que permite exigir una nueva aceptación cuando cambien los términos.
TERMS_DOCUMENT = "terms"
TERMS_VERSION = "2026-09"
TERMS_REQUIRED_DETAIL = (
    "Debes aceptar los Términos y Condiciones y la Política de Privacidad "
    "para crear tu cuenta."
)
# Margen para reconocer una cuenta creada por el registro en curso.
NEW_ACCOUNT_WINDOW = timedelta(minutes=5)


def is_obfuscated_signup_user(auth_user) -> bool:
    # Cuando el correo ya pertenece a una cuenta confirmada, Supabase
    # responde con un usuario ficticio sin identidades para no revelarlo.
    return not (getattr(auth_user, "identities", None) or [])


def record_terms_acceptance(user_id: str, email: str, username: str) -> None:
    # La versión y la fecha las define el servidor, nunca el navegador.
    # Si el registro se repite antes de confirmar el correo, la aceptación
    # ya existe y se conserva la original.
    # El correo y el nombre de usuario se guardan como copia histórica:
    # la aceptación se conserva aunque la cuenta se elimine después.
    (
        supabase_admin
        .table("terms_acceptances")
        .upsert(
            {
                "user_id": user_id,
                "document": TERMS_DOCUMENT,
                "version": TERMS_VERSION,
                "accepted_at": datetime.now(timezone.utc).isoformat(),
                "email": email,
                "username": username
            },
            on_conflict="user_id,document,version",
            ignore_duplicates=True
        )
        .execute()
    )


def discard_signup_without_acceptance(auth_user) -> None:
    # Compensación: una cuenta nueva no puede quedar sin aceptación.
    # Solo se elimina si está sin confirmar y fue creada recién, para no
    # tocar nunca una cuenta que ya existía.
    if getattr(auth_user, "email_confirmed_at", None):
        return

    created_at = auth_user.created_at
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) - created_at > NEW_ACCOUNT_WINDOW:
        return

    try:
        supabase_admin.auth.admin.delete_user(str(auth_user.id))
    except Exception as e:
        print(
            "No se pudo eliminar la cuenta sin aceptación de términos:",
            str(auth_user.id),
            repr(e)
        )


@app.post("/users")
def create_user(user: UserCreate):

    # Se valida antes de crear la cuenta: el formulario no es la única
    # protección.
    if user.accepted_terms is not True:
        raise HTTPException(status_code=400, detail=TERMS_REQUIRED_DETAIL)

    username = clean_username(user.username)

    try:

        response = supabase_public.auth.sign_up({
            "email": user.email,
            "password": user.password,
            "options": {
                "data": {
                    "username": username
                }
            }
        })

        if not response.user:
            raise HTTPException(
                status_code=400,
                detail=REGISTER_ERROR_DETAIL
            )

        # Un correo ya registrado no crea ninguna cuenta: no hay nada que
        # guardar y la respuesta es la misma, para no revelar que existe.
        if not is_obfuscated_signup_user(response.user):
            try:
                record_terms_acceptance(
                    str(response.user.id),
                    response.user.email,
                    username
                )
            except Exception as e:
                print("Error al guardar la aceptación de términos:", repr(e))
                discard_signup_without_acceptance(response.user)
                raise HTTPException(
                    status_code=400,
                    detail=REGISTER_ERROR_DETAIL
                )

        # El correo de bienvenida no se envía aquí: la cuenta todavía no
        # está confirmada. Se envía en el primer inicio de sesión.
        return {
            "message": (
                "Cuenta creada. Te enviamos un correo para confirmar tu "
                "dirección: debes confirmarla antes de iniciar sesión."
            ),
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "username": username
            }
        }

    except HTTPException:
        raise

    except Exception as e:
        # El error real de Supabase queda solo en el registro del servidor.
        print("Error en el registro:", repr(e))
        raise HTTPException(
            status_code=400,
            detail=REGISTER_ERROR_DETAIL
        )


REGISTER_ERROR_DETAIL = (
    "No se pudo crear la cuenta. Revisa los datos e inténtalo nuevamente."
)


# ============================================================
# CORREO DE BIENVENIDA
# ============================================================

# Las cuentas creadas antes de esta fecha ya recibieron la bienvenida al
# registrarse, así que no se les vuelve a enviar.
WELCOME_EMAIL_CUTOFF = datetime(2026, 10, 5, 17, 27, 19, tzinfo=timezone.utc)
WELCOME_EMAIL_FLAG = "welcome_email_sent"


def needs_welcome_email(auth_user) -> bool:
    # Solo cuentas con el correo confirmado según Supabase Auth. La marca
    # vive en app_metadata, que el usuario no puede modificar.
    if not getattr(auth_user, "email_confirmed_at", None):
        return False
    if (auth_user.app_metadata or {}).get(WELCOME_EMAIL_FLAG):
        return False

    created_at = auth_user.created_at
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    return created_at >= WELCOME_EMAIL_CUTOFF


def set_welcome_email_flag(auth_user, value: bool) -> None:
    app_metadata = dict(auth_user.app_metadata or {})
    app_metadata[WELCOME_EMAIL_FLAG] = value
    supabase_admin.auth.admin.update_user_by_id(
        str(auth_user.id),
        {"app_metadata": app_metadata}
    )


def send_first_login_welcome(auth_user) -> None:
    # Primero se marca y después se envía: si dos inicios de sesión
    # coinciden, el correo no sale dos veces. Si el envío falla, se quita
    # la marca para reintentarlo en el próximo inicio de sesión.
    set_welcome_email_flag(auth_user, True)

    sent = send_welcome_email(
        auth_user.email,
        (auth_user.user_metadata or {}).get("username")
    )

    if not sent:
        set_welcome_email_flag(auth_user, False)


# ============================================================
# LOGIN
# ============================================================

@app.post("/login")
def login(user: LoginRequest):

    try:

        response = supabase_public.auth.sign_in_with_password({
            "email": user.email,
            "password": user.password
        })

        if not response.user or not response.session:
            raise HTTPException(
                status_code=401,
                detail="Correo o contraseña incorrectos"
            )

        try:
            if needs_welcome_email(response.user):
                run_notification_task(send_first_login_welcome, response.user)
        except Exception as e:
            # La bienvenida nunca debe impedir el inicio de sesión.
            print("No se pudo preparar el correo de bienvenida:", repr(e))

        return {
            "message": "Inicio de sesión correcto",
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "username": (response.user.user_metadata or {}).get("username"),
                "avatar_url": (response.user.user_metadata or {}).get("avatar_url"),
                "banner_url": (response.user.user_metadata or {}).get("banner_url"),
                "is_admin": is_admin_user(response.user.id)
            },
            "access_token": response.session.access_token,
            # Permite renovar la sesión sin volver a pedir la contraseña.
            "refresh_token": response.session.refresh_token,
            "token_type": "bearer"
        }

    except Exception as e:
        # Supabase solo informa que el correo no está confirmado cuando la
        # contraseña es correcta, así que este mensaje no revela cuentas.
        if getattr(e, "code", None) == "email_not_confirmed":
            raise HTTPException(
                status_code=403,
                detail="Debes confirmar tu correo electrónico antes de iniciar sesión."
            )

        raise HTTPException(
            status_code=401,
            detail="Correo o contraseña incorrectos"
        )

# ============================================================
# RENOVACIÓN DE LA SESIÓN
# ============================================================

# El token de acceso dura poco. Con el de renovación, el frontend pide uno
# nuevo en segundo plano y la persona no tiene que volver a iniciar sesión.
SESSION_REFRESH_TOKEN_MAX_LENGTH = 2000


def exchange_refresh_token(refresh_token: str) -> dict | None:
    # Se llama directo a Supabase Auth, sin pasar por el cliente compartido:
    # así la renovación de una persona no altera la sesión de ese cliente.
    response = httpx.post(
        f"{SUPABASE_URL.strip().rstrip('/')}/auth/v1/token",
        params={"grant_type": "refresh_token"},
        headers={"apikey": SUPABASE_ANON_KEY},
        json={"refresh_token": refresh_token},
        timeout=10
    )

    # Token inválido, usado o revocado: la sesión ya no se puede renovar.
    if 400 <= response.status_code < 500:
        return None
    response.raise_for_status()

    data = response.json()
    if not data.get("access_token") or not data.get("refresh_token"):
        return None

    return {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"]
    }


@app.post("/auth/refresh")
def refresh_session(body: SessionRefreshRequest):
    refresh_token = (body.refresh_token or "").strip()

    if not refresh_token or len(refresh_token) > SESSION_REFRESH_TOKEN_MAX_LENGTH:
        raise HTTPException(
            status_code=401,
            detail="La sesión expiró. Inicia sesión nuevamente."
        )

    try:
        session = exchange_refresh_token(refresh_token)
    except Exception as e:
        # Fallo de red o de Supabase: la sesión puede seguir siendo válida.
        print("No se pudo renovar la sesión:", repr(e))
        raise HTTPException(
            status_code=503,
            detail="No se pudo renovar la sesión. Inténtalo nuevamente."
        )

    if not session:
        raise HTTPException(
            status_code=401,
            detail="La sesión expiró. Inicia sesión nuevamente."
        )

    return {**session, "token_type": "bearer"}


# ============================================================
# RECUPERAR LA CONTRASEÑA
# ============================================================

# 1. La persona pide el enlace con su correo. 2. Supabase le envía un
# correo con un enlace a la página "restablecer" del sitio, que lleva un
# código de un solo uso. 3. Desde esa página elige una contraseña nueva.
#
# El código se canjea recién cuando la persona envía el formulario, no al
# abrir el enlace: los filtros de correo visitan los enlaces para revisarlos
# y, si abrirlo bastara para gastarlo, llegaría vencido a su destinataria.

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72
PASSWORD_RESET_PATH = "/restablecer"
PASSWORD_RECOVERY_MESSAGE = (
    "Si ese correo tiene una cuenta en FriBuk, te enviamos un enlace para "
    "elegir una contraseña nueva. Revisa también la carpeta de spam."
)

# Límites en memoria: (solicitudes permitidas, ventana en segundos).
PASSWORD_RECOVERY_RATE_LIMITS = {"ip": (15, 3600), "email": (6, 3600)}
PASSWORD_RECOVERY_MAX_TRACKED_KEYS = 20000

password_recovery_requests: dict[tuple[str, str], deque] = {}
password_recovery_requests_lock = threading.Lock()


def limit_password_recovery(client_ip: str, email: str) -> None:
    now = time.monotonic()

    with password_recovery_requests_lock:
        if len(password_recovery_requests) > PASSWORD_RECOVERY_MAX_TRACKED_KEYS:
            password_recovery_requests.clear()

        tracked = []
        for kind, key in (("ip", client_ip), ("email", email)):
            limit, window = PASSWORD_RECOVERY_RATE_LIMITS[kind]
            timestamps = password_recovery_requests.setdefault((kind, key), deque())
            while timestamps and now - timestamps[0] > window:
                timestamps.popleft()
            if len(timestamps) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Pediste el enlace demasiadas veces. "
                        "Espera un rato e inténtalo nuevamente."
                    )
                )
            tracked.append(timestamps)

        for timestamps in tracked:
            timestamps.append(now)


def password_reset_url(origin: str | None) -> str:
    # El enlace vuelve al mismo sitio desde el que se pidió, siempre que sea
    # uno de los orígenes permitidos; nunca a una dirección arbitraria.
    allowed = [item for item in CORS_ALLOWED_ORIGINS if item]
    normalized = (origin or "").strip().rstrip("/")
    base = normalized if normalized in allowed else next(
        (item for item in allowed if "localhost" not in item), allowed[0]
    )
    return base + PASSWORD_RESET_PATH


def request_password_recovery(email: str, redirect_to: str) -> None:
    # Llamada directa a Supabase Auth, sin pasar por el cliente compartido.
    # Supabase responde igual exista o no la cuenta.
    response = httpx.post(
        f"{SUPABASE_URL.strip().rstrip('/')}/auth/v1/recover",
        params={"redirect_to": redirect_to},
        headers={"apikey": SUPABASE_ANON_KEY},
        json={"email": email},
        timeout=10
    )
    response.raise_for_status()


@app.post("/auth/password-recovery")
def start_password_recovery(body: PasswordRecoveryRequest, request: Request):
    email = body.email.strip().lower()
    client_ip = request.client.host if request.client else "desconocido"
    limit_password_recovery(client_ip, email)

    try:
        request_password_recovery(
            email, password_reset_url(request.headers.get("origin"))
        )
    except Exception as e:
        # No se revela si falló ni si la cuenta existe.
        print("No se pudo pedir la recuperación de contraseña:", repr(e))

    return {"message": PASSWORD_RECOVERY_MESSAGE}


def token_authentication_methods(access_token: str) -> set[str]:
    # Lee del token cómo se obtuvo la sesión. Solo se usa después de que
    # Supabase confirmó que el token es auténtico.
    try:
        payload = access_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        return {
            str(entry.get("method"))
            for entry in claims.get("amr") or []
            if isinstance(entry, dict)
        }
    except Exception:
        return set()


def redeem_recovery_token_hash(token_hash: str) -> str | None:
    # Canjea el código del enlace y devuelve el id de la cuenta, o None si
    # el código no existe, venció o ya se usó. Llamada directa a Supabase
    # Auth, sin pasar por el cliente compartido.
    response = httpx.post(
        f"{SUPABASE_URL.strip().rstrip('/')}/auth/v1/verify",
        headers={"apikey": SUPABASE_ANON_KEY},
        json={"type": "recovery", "token_hash": token_hash},
        timeout=10
    )
    if 400 <= response.status_code < 500:
        return None
    response.raise_for_status()

    user_id = (response.json().get("user") or {}).get("id")
    return str(user_id) if user_id else None


def recovery_user_id_from_session(access_token: str) -> str | None:
    # Formato anterior del enlace: la sesión tiene que ser de recuperación.
    # Una sesión normal no alcanza, para que quien solo tenga una sesión
    # abierta no pueda cambiar la contraseña sin conocer la actual.
    try:
        response_user = supabase_public.auth.get_user(access_token)
        recovery_user = response_user.user if response_user else None
    except Exception:
        recovery_user = None

    if not recovery_user:
        return None
    if "recovery" not in token_authentication_methods(access_token):
        raise HTTPException(
            status_code=403,
            detail="Para cambiar la contraseña usa el enlace que te enviamos por correo."
        )
    return str(recovery_user.id)


@app.post("/auth/password-update")
def update_password_with_recovery(body: PasswordUpdateRequest):
    expired = HTTPException(
        status_code=401,
        detail="El enlace ya no es válido. Pide uno nuevo para cambiar tu contraseña."
    )

    password = body.password or ""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres"
        )
    if len(password.encode("utf-8")) > PASSWORD_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail="La contraseña es demasiado larga"
        )

    token_hash = (body.token_hash or "").strip()
    access_token = (body.access_token or "").strip()

    # La contraseña ya se validó arriba: el código no se gasta en un intento
    # con una contraseña que no sirve.
    if token_hash:
        try:
            user_id = redeem_recovery_token_hash(token_hash)
        except Exception as e:
            print("No se pudo canjear el código de recuperación:", repr(e))
            raise HTTPException(
                status_code=503,
                detail="No se pudo comprobar el enlace. Inténtalo nuevamente."
            )
    elif access_token:
        user_id = recovery_user_id_from_session(access_token)
    else:
        user_id = None

    if not user_id:
        raise expired

    try:
        supabase_admin.auth.admin.update_user_by_id(
            user_id, {"password": password}
        )
    except Exception as e:
        print("No se pudo cambiar la contraseña:", repr(e))
        raise HTTPException(
            status_code=400,
            detail="No se pudo cambiar la contraseña. Prueba con una distinta."
        )

    return {"message": "Tu contraseña se cambió. Ya puedes iniciar sesión."}


@app.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "message": "Usuario autenticado correctamente",
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "username": (current_user.user_metadata or {}).get("username"),
            "avatar_url": (current_user.user_metadata or {}).get("avatar_url"),
            "banner_url": (current_user.user_metadata or {}).get("banner_url"),
            "is_admin": is_admin_user(current_user.id)
        }
    }


@app.post("/me/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    try:
        file_bytes, _extension = read_validated_image(
            file, ("image/jpeg", "image/png")
        )

        avatar_path = f"avatars/{current_user.id}/avatar"
        storage = supabase_admin.storage.from_("story-covers")
        storage.upload(
            avatar_path,
            file_bytes,
            {
                "content-type": file.content_type,
                "cache-control": "0",
                "x-upsert": "true"
            }
        )
        avatar_url = storage.get_public_url(avatar_path)

        user_metadata = dict(current_user.user_metadata or {})
        user_metadata["avatar_url"] = avatar_url
        supabase_admin.auth.admin.update_user_by_id(
            str(current_user.id),
            {"user_metadata": user_metadata}
        )

        return {"message": "Foto de perfil actualizada", "avatar_url": avatar_url}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.post("/me/banner")
def upload_banner(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    try:
        file_bytes, _extension = read_validated_image(
            file, ("image/jpeg", "image/png")
        )

        banner_path = f"banners/{current_user.id}/banner"
        storage = supabase_admin.storage.from_("story-covers")
        storage.upload(
            banner_path,
            file_bytes,
            {
                "content-type": file.content_type,
                "cache-control": "0",
                "x-upsert": "true"
            }
        )
        # La ruta es fija: el parámetro de versión hace que el navegador
        # muestre la imagen nueva en lugar de la que tenía guardada.
        banner_url = f"{storage.get_public_url(banner_path)}?v={int(time.time())}"

        user_metadata = dict(current_user.user_metadata or {})
        user_metadata["banner_url"] = banner_url
        supabase_admin.auth.admin.update_user_by_id(
            str(current_user.id),
            {"user_metadata": user_metadata}
        )

        return {"message": "Banner actualizado", "banner_url": banner_url}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/me/banner")
def delete_banner(current_user=Depends(get_current_user)):
    try:
        user_metadata = dict(current_user.user_metadata or {})
        user_metadata["banner_url"] = None
        supabase_admin.auth.admin.update_user_by_id(
            str(current_user.id),
            {"user_metadata": user_metadata}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))

    # El perfil ya no muestra el banner: si el archivo no se puede borrar,
    # la siguiente subida lo reemplaza.
    try:
        supabase_admin.storage.from_("story-covers").remove(
            [f"banners/{current_user.id}/banner"]
        )
    except Exception as cleanup_error:
        print("No se pudo eliminar el banner del almacenamiento:", cleanup_error)

    return {"message": "Banner eliminado", "banner_url": None}


@app.post("/stories")
def create_story(
    story: StoryCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el JWT con Supabase Auth
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        # 2. Crear la historia
        story_data = {
            "author_id": str(current_user.id),
            "title": story.title,
            "description": story.description,
            "cover_url": story.cover_url,
            "genre": story.genre,
            "status": story.status,
            "work_type": story.work_type,
            "original_work": story.original_work,
            "original_author": story.original_author
        }

        story_data.update(validate_story_fields(story))
        response = supabase_admin.table("stories").insert(story_data).execute()

        created_story = response.data[0]
        story_id = created_story["id"]

        # 3. Guardar las etiquetas
        attach_story_tags(story_id, clean_story_tags(story.tags))

        # 4. Devolver la historia creada
        return {
            "message": "Historia creada correctamente",
            "story": created_story
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
        
@app.post("/upload-cover")
def upload_cover(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # Verificar usuario autenticado
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # Validar tipo, tamaño y contenido real de la imagen
        file_bytes, extension = read_validated_image(
            file, ("image/jpeg", "image/png")
        )

        # Nombre único. La extensión sale del tipo validado,
        # no del nombre de archivo enviado por el cliente.
        file_name = f"{current_user.id}/{uuid.uuid4()}.{extension}"

        # Subir a Supabase Storage
        response = (
            supabase_admin
            .storage
            .from_("story-covers")
            .upload(
                file_name,
                file_bytes,
                {
                    "content-type": file.content_type
                }
            )
        )

        # Obtener URL pública
        public_url = (
            supabase_admin
            .storage
            .from_("story-covers")
            .get_public_url(file_name)
        )

        return {
            "message": "Portada subida correctamente",
            "file_name": file_name,
            "url": public_url
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
        
@app.put("/stories/{story_id}")
def update_story(
    story_id: str,
    story: StoryUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el token con Supabase Auth
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # 2. Buscar la historia
        story_response = (
            supabase_admin
            .table("stories")
            .select("author_id")
            .eq("id", story_id)
            .execute()
        )

        if not story_response.data:
            raise HTTPException(
                status_code=404,
                detail="Historia no encontrada"
            )

        existing_story = story_response.data[0]

        # 3. Comprobar que el usuario sea el autor
        if str(existing_story["author_id"]) != str(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para editar esta historia."
            )

        # 4. Preparar los datos actualizados
        story_data = {
            "title": story.title,
            "description": story.description,
            "cover_url": story.cover_url,
            "genre": story.genre,
            "status": story.status,
            "work_type": story.work_type,
            "original_work": story.original_work,
            "original_author": story.original_author,
            "sensitive_content": story.sensitive_content,
            "content_warnings": story.content_warnings
        }

        clean_story = validate_story_fields(story)
        story_data.update({key: clean_story[key] for key in story_data})
        new_tags = clean_story_tags(story.tags) if story.tags is not None else None

        # 5. Actualizar la historia
        response = (
            supabase_admin
            .table("stories")
            .update(story_data)
            .eq("id", story_id)
            .execute()
        )

        if new_tags is not None:
            replace_story_tags(story_id, new_tags)

        return {
            "message": "Historia actualizada correctamente",
            "story": response.data[0]
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el token con Supabase Auth
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # 2. Buscar el usuario en nuestra tabla users
        response = (
            supabase_admin
            .table("users")
            .select("id, username, role")
            .eq("id", str(current_user.id))
            .single()
            .execute()
        )

        user_data = response.data

        # 3. Comprobar que sea administrador
        if not user_data or user_data["role"] != "admin":
            raise HTTPException(
                status_code=403,
                detail="No tienes permisos de administrador"
            )

        return user_data

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )


def is_admin_user(user_id: str) -> bool:
    # Solo sirve para que el frontend muestre u oculte controles: los
    # endpoints de administración se protegen con get_current_admin.
    try:
        response = (
            supabase_admin
            .table("users")
            .select("role")
            .eq("id", str(user_id))
            .limit(1)
            .execute()
        )
        return bool(response.data) and response.data[0].get("role") == "admin"
    except Exception:
        return False


# ============================================================
# BANNER DEL INICIO
# ============================================================

# El banner del inicio es un único archivo en Storage, sin tabla propia:
# existe si el archivo existe, y su fecha de actualización sirve de versión.
HOME_BANNER_BUCKET = "story-covers"
HOME_BANNER_FOLDER = "site"
HOME_BANNER_NAME = "home-banner"
HOME_BANNER_PATH = f"{HOME_BANNER_FOLDER}/{HOME_BANNER_NAME}"
HOME_BANNER_TTL_SECONDS = 60

home_banner_cache: tuple[float, str | None] | None = None
home_banner_lock = threading.Lock()


def set_home_banner_cache(banner_url: str | None) -> None:
    global home_banner_cache

    with home_banner_lock:
        home_banner_cache = (
            time.monotonic() + HOME_BANNER_TTL_SECONDS,
            banner_url
        )


def get_home_banner_url() -> str | None:
    with home_banner_lock:
        cached = home_banner_cache

    if cached and cached[0] > time.monotonic():
        return cached[1]

    storage = supabase_admin.storage.from_(HOME_BANNER_BUCKET)
    files = storage.list(HOME_BANNER_FOLDER, {"search": HOME_BANNER_NAME})
    banner_file = next(
        (item for item in files if item.get("name") == HOME_BANNER_NAME),
        None
    )

    banner_url = None
    if banner_file:
        version = re.sub(
            r"\D", "",
            str(banner_file.get("updated_at") or banner_file.get("created_at") or "")
        )
        banner_url = f"{storage.get_public_url(HOME_BANNER_PATH)}?v={version}"

    set_home_banner_cache(banner_url)
    return banner_url


@app.get("/site/home-banner")
def get_home_banner():
    # Si falla, el inicio se muestra sin banner.
    try:
        return {"banner_url": get_home_banner_url()}
    except Exception as e:
        print("No se pudo cargar el banner del inicio:", repr(e))
        return {"banner_url": None}


@app.post("/site/home-banner")
def upload_home_banner(
    file: UploadFile = File(...),
    admin_user=Depends(get_current_admin)
):
    try:
        file_bytes, _extension = read_validated_image(
            file, ("image/jpeg", "image/png")
        )

        storage = supabase_admin.storage.from_(HOME_BANNER_BUCKET)
        storage.upload(
            HOME_BANNER_PATH,
            file_bytes,
            {
                "content-type": file.content_type,
                "cache-control": "0",
                "x-upsert": "true"
            }
        )
        banner_url = (
            f"{storage.get_public_url(HOME_BANNER_PATH)}?v={int(time.time())}"
        )
        set_home_banner_cache(banner_url)

        return {"message": "Banner del inicio actualizado", "banner_url": banner_url}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/site/home-banner")
def delete_home_banner(admin_user=Depends(get_current_admin)):
    try:
        supabase_admin.storage.from_(HOME_BANNER_BUCKET).remove([HOME_BANNER_PATH])
        set_home_banner_cache(None)
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))

    return {"message": "Banner del inicio eliminado", "banner_url": None}


# ============================================================
# SOPORTE
# ============================================================

@app.post("/support")
def create_support_request(
    support: SupportRequestCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el JWT con Supabase Auth
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # 2. Preparar la solicitud
        support_data = {
            "user_id": str(current_user.id),
            "category": support.category,
            "message": support.message,
            "story_title": support.story_title,
            "fribuk_url": support.fribuk_url,
            "external_url": support.external_url,
            "reported_url": support.reported_url,
            "status": "pending"
        }

        support_data.update(validate_support_request(support))

        # 3. Guardar el ticket
        response = (
            supabase_admin
            .table("support_requests")
            .insert(support_data)
            .execute()
        )

        created_request = response.data[0]

        # Aviso por correo a la administración.
        admin_alerts.alert_support_request(
            created_request.get("category"), created_request.get("message")
        )

        # 4. Responder
        return {
            "message": "Solicitud enviada correctamente",
            "support_request": created_request
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
        
@app.get("/support")
def get_support_requests(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el usuario
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # 2. Obtener solamente las solicitudes del usuario autenticado
        response = (
            supabase_admin
            .table("support_requests")
            .select("*")
            .eq("user_id", str(current_user.id))
            .order("created_at", desc=True)
            .execute()
        )

        return {
            "support_requests": response.data
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )

@app.get("/support/admin")
def get_admin_support_requests(
    admin_user = Depends(get_current_admin)
):
    try:
        response = (
            supabase_admin
            .table("support_requests")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        return {
            "support_requests": response.data
        }

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
        
@app.patch("/support/admin/{support_id}/status")
def update_support_status(
    support_id: str,
    support_status: SupportStatusUpdate,
    admin_user = Depends(get_current_admin)
):
    allowed_statuses = [
        "pending",
        "in_review",
        "resolved"
    ]

    if support_status.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Estado no válido"
        )

    try:
        response = (
            supabase_admin
            .table("support_requests")
            .update({
                "status": support_status.status
            })
            .eq("id", support_id)
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="Solicitud de soporte no encontrada"
            )

        run_notification_task(
            notify_support_status, response.data[0], admin_user.get("id")
        )

        return {
            "message": "Estado actualizado correctamente",
            "support_request": response.data[0]
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
# ============================================================
# COMENTARIOS
# ============================================================

@app.get("/stories/{story_id}/comments")
def get_comments(story_id: str):
    response = (
        supabase_public
        .table("comments")
        .select("*")
        .eq("story_id", story_id)
        .execute()
    )
    return response.data


@app.post("/comments")
def create_comment(
    comment: CommentCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el JWT
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        # 2. Armar los datos, con author_id tomado del token verificado
        comment_data = {
            "author_id": str(current_user.id),
            "story_id": comment.story_id,
            "content": comment.content
        }

        comment_data.update({
            "story_id": ensure_story_accepts_interactions(
                comment.story_id, str(current_user.id)
            ),
            "content": clean_text_field(
                comment.content, "El comentario", 2000,
                required=True, single_line=False
            )
        })

        # 3. Insert con el cliente admin
        response = supabase_admin.table("comments").insert(comment_data).execute()

        run_notification_task(
            notify_story_event,
            "story_comment",
            comment.story_id,
            str(current_user.id),
            {
                "comment_id": str(response.data[0].get("id")),
                "excerpt": notification_excerpt(comment.content)
            }
        )

        return {
            "message": "Comentario creado correctamente",
            "comment": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        # Verificamos que el comentario sea del usuario antes de borrar
        existing = (
            supabase_admin
            .table("comments")
            .select("author_id")
            .eq("id", comment_id)
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Comentario no encontrado")

        if existing.data[0]["author_id"] != str(current_user.id):
            raise HTTPException(status_code=403, detail="No podés borrar comentarios de otros usuarios")

        supabase_admin.table("comments").delete().eq("id", comment_id).execute()

        return {"message": "Comentario eliminado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))
    
# ============================================================
# VOTOS
# ============================================================

@app.post("/votes")
def create_vote(
    vote: VoteCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        ensure_story_accepts_interactions(vote.story_id, str(current_user.id))

        vote_data = {
            "user_id": str(current_user.id),
            "story_id": vote.story_id
        }

        # Evitar votos duplicados del mismo usuario a la misma historia
        existing = (
            supabase_admin
            .table("votes")
            .select("*")
            .eq("user_id", str(current_user.id))
            .eq("story_id", vote.story_id)
            .execute()
        )

        if existing.data:
            raise HTTPException(status_code=400, detail="Ya votaste esta historia")

        response = supabase_admin.table("votes").insert(vote_data).execute()

        run_notification_task(
            notify_story_event, "story_vote", vote.story_id, str(current_user.id)
        )

        return {
            "message": "Voto registrado correctamente",
            "vote": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/votes/{story_id}")
def remove_vote(
    story_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        supabase_admin.table("votes") \
            .delete() \
            .eq("user_id", str(current_user.id)) \
            .eq("story_id", story_id) \
            .execute()

        return {"message": "Voto eliminado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))
    
@app.get("/stories/{story_id}/votes/me")
def get_my_vote(
    story_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        existing = (
            supabase_admin
            .table("votes")
            .select("id")
            .eq("user_id", str(current_user.id))
            .eq("story_id", story_id)
            .execute()
        )

        return {
            "voted": bool(existing.data)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )


@app.get("/stories/{story_id}/votes/count")
def get_vote_count(story_id: str):
    response = (
        supabase_public
        .table("votes")
        .select("id", count="exact")
        .eq("story_id", story_id)
        .execute()
    )
    return {"story_id": story_id, "votes": response.count}


# ============================================================
# FAVORITOS
# ============================================================

@app.post("/favorites/{story_id}")
def add_favorite(
    story_id: str,
    current_user=Depends(get_current_user)
):
    try:
        story_response = (
            supabase_admin
            .table("stories")
            .select("id, status")
            .eq("id", story_id)
            .execute()
        )

        if (
            not story_response.data
            or story_response.data[0]["status"] not in VISIBLE_STORY_STATUSES
        ):
            raise HTTPException(status_code=404, detail="Historia no encontrada")

        # Solo un favorito nuevo genera notificación, no repetir la acción.
        previous_favorite = (
            supabase_admin
            .table("favorites")
            .select("id")
            .eq("user_id", str(current_user.id))
            .eq("story_id", story_id)
            .limit(1)
            .execute()
        )
        is_new_favorite = not previous_favorite.data

        favorite_data = {
            "user_id": str(current_user.id),
            "story_id": story_id
        }

        response = (
            supabase_admin
            .table("favorites")
            .upsert(favorite_data, on_conflict="user_id,story_id")
            .execute()
        )

        if is_new_favorite:
            run_notification_task(
                notify_story_event,
                "story_favorite",
                story_id,
                str(current_user.id)
            )

        return {
            "message": "Historia agregada a favoritos",
            "favorite": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/favorites/{story_id}")
def remove_favorite(
    story_id: str,
    current_user=Depends(get_current_user)
):
    try:
        supabase_admin.table("favorites") \
            .delete() \
            .eq("user_id", str(current_user.id)) \
            .eq("story_id", story_id) \
            .execute()

        return {"message": "Historia eliminada de favoritos"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.get("/favorites")
def get_favorites(current_user=Depends(get_current_user)):
    try:
        response = (
            supabase_admin
            .table("favorites")
            .select("*, stories(*)")
            .eq("user_id", str(current_user.id))
            .order("created_at", desc=True)
            .execute()
        )

        favorites = response.data
        favorite_stories = [
            favorite["stories"]
            for favorite in favorites
            if isinstance(favorite.get("stories"), dict)
        ]
        chapter_counts = get_chapter_counts(
            [story["id"] for story in favorite_stories],
            include_drafts=False
        )

        for story in favorite_stories:
            story["chapter_count"] = chapter_counts.get(str(story["id"]), 0)

        return {"favorites": favorites}

    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.get("/stories/{story_id}/favorite")
def get_story_favorite(
    story_id: str,
    current_user=Depends(get_current_user)
):
    try:
        response = (
            supabase_admin
            .table("favorites")
            .select("id")
            .eq("user_id", str(current_user.id))
            .eq("story_id", story_id)
            .execute()
        )

        return {
            "story_id": story_id,
            "is_favorite": bool(response.data)
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))

# ============================================================
# CAPÍTULOS
# ============================================================

@app.get("/stories/{story_id}/chapters")
def get_chapters(
    story_id: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security)
):
    try:
        # Primero buscamos la historia con el cliente admin.
        # Esto permite encontrar tanto historias publicadas
        # como borradores.
        story_response = (
            supabase_admin
            .table("stories")
            .select("author_id, status")
            .eq("id", story_id)
            .execute()
        )

        if not story_response.data:
            raise HTTPException(
                status_code=404,
                detail="Historia no encontrada"
            )

        story = story_response.data[0]

        # Si la historia es un borrador,
        # solamente su autor puede ver sus capítulos.
        if story["status"] == "draft":

            # Si no hay token, no puede acceder.
            if not credentials:
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para ver los capítulos de esta historia."
                )

            access_token = credentials.credentials

            # Validamos el token con Supabase Auth.
            response_user = supabase_public.auth.get_user(access_token)

            if not response_user.user:
                raise HTTPException(
                    status_code=401,
                    detail="Token inválido"
                )

            current_user = response_user.user

            # Comprobamos que el usuario sea el autor.
            if str(current_user.id) != str(story["author_id"]):
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para ver los capítulos de esta historia."
                )

            # El autor puede ver capítulos publicados y borradores.
            response = (
                supabase_admin
                .table("chapters")
                .select("*")
                .eq("story_id", story_id)
                .order("chapter_number")
                .execute()
            )

        else:
            # Para historias publicadas, los lectores solamente pueden ver
            # capítulos publicados. Su autor también ve sus borradores,
            # para poder editarlos y publicarlos.
            is_author = False

            if credentials:
                try:
                    response_user = supabase_public.auth.get_user(
                        credentials.credentials
                    )
                    is_author = bool(
                        response_user.user
                        and str(response_user.user.id) == str(story["author_id"])
                    )
                except Exception:
                    is_author = False

            query = (
                supabase_admin
                .table("chapters")
                .select("*")
                .eq("story_id", story_id)
            )

            if not is_author:
                query = query.eq("status", "published")

            response = query.order("chapter_number").execute()

        return response.data

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )


@app.post("/chapters")
def create_chapter(
    chapter: ChapterCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        # Verificar que la historia sea del usuario autenticado
        story = (
            supabase_admin
            .table("stories")
            .select("author_id")
            .eq("id", chapter.story_id)
            .execute()
        )

        if not story.data:
            raise HTTPException(status_code=404, detail="Historia no encontrada")

        if story.data[0]["author_id"] != str(current_user.id):
            raise HTTPException(status_code=403, detail="No podés agregar capítulos a historias de otros usuarios")

        chapter_data = {
            "story_id": chapter.story_id,
            "chapter_number": chapter.chapter_number,
            "title": chapter.title,
            "content": chapter.content,
            "status": chapter.status
        }

        if chapter.status not in CHAPTER_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Estado de capítulo no válido"
            )
        chapter_data.update(validate_chapter_fields(
            chapter.chapter_number, chapter.title, chapter.content
        ))

        response = supabase_admin.table("chapters").insert(chapter_data).execute()

        # Avisa a quienes tienen la historia en Favoritos, solo si queda publicado.
        run_notification_task(notify_chapter_published, response.data[0], None)

        return {
            "message": "Capítulo creado correctamente",
            "chapter": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/chapters/{chapter_id}")
def delete_chapter(
    chapter_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        chapter = (
            supabase_admin
            .table("chapters")
            .select("story_id")
            .eq("id", chapter_id)
            .execute()
        )

        if not chapter.data:
            raise HTTPException(status_code=404, detail="Capítulo no encontrado")

        story = (
            supabase_admin
            .table("stories")
            .select("author_id")
            .eq("id", chapter.data[0]["story_id"])
            .execute()
        )

        if not story.data or story.data[0]["author_id"] != str(current_user.id):
            raise HTTPException(status_code=403, detail="No podés borrar capítulos de otros usuarios")

        supabase_admin.table("chapters").delete().eq("id", chapter_id).execute()

        return {"message": "Capítulo eliminado correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))
    
@app.put("/chapters/{chapter_id}")
def update_chapter(
    chapter_id: str,
    chapter: ChapterUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el token con Supabase Auth
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # 2. Buscar el capítulo y su historia
        chapter_response = (
            supabase_admin
            .table("chapters")
            .select("story_id, status, content")
            .eq("id", chapter_id)
            .execute()
        )

        if not chapter_response.data:
            raise HTTPException(
                status_code=404,
                detail="Capítulo no encontrado"
            )

        existing_chapter = chapter_response.data[0]

        # 3. Buscar al autor de la historia
        story_response = (
            supabase_admin
            .table("stories")
            .select("author_id")
            .eq("id", existing_chapter["story_id"])
            .execute()
        )

        if not story_response.data:
            raise HTTPException(
                status_code=404,
                detail="Historia no encontrada"
            )

        story = story_response.data[0]

        # 4. Comprobar que el usuario sea el autor
        if str(story["author_id"]) != str(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para editar este capítulo."
            )

        # 5. Preparar los datos actualizados
        chapter_data = {
            "chapter_number": chapter.chapter_number,
            "title": chapter.title,
            "content": chapter.content
        }

        chapter_data.update(validate_chapter_fields(
            chapter.chapter_number, chapter.title, chapter.content
        ))

        # Publicar: la única transición de estado permitida es
        # borrador -> publicado, y solo cuando se pide de forma explícita.
        current_status = existing_chapter.get("status")

        if chapter.status is not None and chapter.status != current_status:
            if chapter.status != "published" or current_status != "draft":
                raise HTTPException(
                    status_code=400,
                    detail="Solo se puede publicar un capítulo que está en borrador."
                )
            chapter_data["status"] = "published"

        # 6. Actualizar el capítulo
        response = (
            supabase_admin
            .table("chapters")
            .update(chapter_data)
            .eq("id", chapter_id)
            .execute()
        )

        # Si el texto cambió, los comentarios anclados se reubican o quedan
        # huérfanos. Un fallo aquí no debe impedir guardar el capítulo.
        if existing_chapter.get("content") != response.data[0].get("content"):
            try:
                reanchor_chapter_comments(
                    chapter_id, response.data[0].get("content")
                )
            except Exception as e:
                print("No se pudieron reubicar los comentarios:", repr(e))

        # Solo notifica si el capítulo pasa a estar publicado con esta edición.
        run_notification_task(
            notify_chapter_published,
            response.data[0],
            existing_chapter.get("status")
        )

        return {
            "message": "Capítulo actualizado correctamente",
            "chapter": response.data[0]
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )    
    
    
# ============================================================
# RATINGS
# ============================================================

@app.post("/ratings")
def create_or_update_rating(
    rating: RatingCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        ensure_story_accepts_interactions(rating.story_id, str(current_user.id))

        for field_name, value in [
            ("plot", rating.plot),
            ("spelling", rating.spelling)
        ]:
            if not (1 <= value <= 5):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field_name} debe estar entre 1 y 5"
                )

        # Solo la primera valoración de un usuario genera notificación.
        previous_rating = (
            supabase_admin
            .table("ratings")
            .select("id")
            .eq("user_id", str(current_user.id))
            .eq("story_id", rating.story_id)
            .limit(1)
            .execute()
        )
        is_first_rating = not previous_rating.data

        rating_data = {
            "user_id": str(current_user.id),
            "story_id": rating.story_id,
            "plot": rating.plot,
            "spelling": rating.spelling
        }

        response = (
            supabase_admin
            .table("ratings")
            .upsert(rating_data, on_conflict="user_id,story_id")
            .execute()
        )

        if is_first_rating:
            run_notification_task(
                notify_story_event,
                "story_rating",
                rating.story_id,
                str(current_user.id)
            )

        return {
            "message": "Calificación guardada correctamente",
            "rating": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.get("/stories/{story_id}/ratings")
def get_story_ratings(story_id: str):
    response = (
        supabase_public
        .table("ratings")
        .select("*")
        .eq("story_id", story_id)
        .execute()
    )
    return response.data


@app.get("/stories/{story_id}/ratings/average")
def get_ratings_average(story_id: str):
    response = (
        supabase_public
        .table("ratings")
        .select("plot, spelling")
        .eq("story_id", story_id)
        .execute()
    )

    if not response.data:
        return {
            "story_id": story_id,
            "count": 0,
            "average_plot": None,
            "average_spelling": None,
            "general_rating": None
        }

    count = len(response.data)

    avg_plot = sum(r["plot"] for r in response.data) / count
    avg_spell = sum(r["spelling"] for r in response.data) / count

    general_rating = (avg_plot + avg_spell) / 2

    return {
        "story_id": story_id,
        "count": count,
        "average_plot": round(avg_plot, 2),
        "average_spelling": round(avg_spell, 2),
        "general_rating": round(general_rating, 2)
    }
    

@app.get("/chapters/{chapter_id}")
def get_chapter(
    chapter_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        # 1. Validar el token con Supabase Auth
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(
                status_code=401,
                detail="Token inválido"
            )

        current_user = response_user.user

        # 2. Buscar el capítulo
        chapter_response = (
            supabase_admin
            .table("chapters")
            .select("*")
            .eq("id", chapter_id)
            .execute()
        )

        if not chapter_response.data:
            raise HTTPException(
                status_code=404,
                detail="Capítulo no encontrado"
            )

        chapter = chapter_response.data[0]

        # 3. Buscar la historia asociada
        story_response = (
            supabase_admin
            .table("stories")
            .select("author_id")
            .eq("id", chapter["story_id"])
            .execute()
        )

        if not story_response.data:
            raise HTTPException(
                status_code=404,
                detail="Historia no encontrada"
            )

        story = story_response.data[0]

        # 4. Comprobar que el usuario sea el autor
        if str(story["author_id"]) != str(current_user.id):
            raise HTTPException(
                status_code=403,
                detail="No tienes permiso para acceder a este capítulo."
            )

        # 5. Devolver el capítulo
        return chapter

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=public_error_detail(e)
        )
# ============================================================
# FORO
# ============================================================

FORUM_IMAGE_BUCKET = "forum-images"
MAX_FORUM_IMAGE_SIZE = 5 * 1024 * 1024
FORUM_IMAGE_TYPES = {
    "image/jpeg": ("jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": ("png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (
        "webp",
        lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    ),
}


def upload_forum_image(
    image: UploadFile,
    user_id: str,
    image_group: Literal["topics", "replies"],
) -> tuple[str, str]:
    mime_type = image.content_type
    image_type = FORUM_IMAGE_TYPES.get(mime_type)
    if image_type is None:
        raise HTTPException(
            status_code=400,
            detail="Solo se permiten imágenes JPEG, PNG o WebP",
        )

    extension, matches_content = image_type
    image_data = image.file.read(MAX_FORUM_IMAGE_SIZE + 1)
    if len(image_data) > MAX_FORUM_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="La imagen no puede superar los 5 MB",
        )
    if not image_data:
        raise HTTPException(status_code=400, detail="La imagen está vacía")
    if not matches_content(image_data):
        raise HTTPException(
            status_code=400,
            detail="El contenido no coincide con el tipo de imagen permitido",
        )

    storage_path = f"{image_group}/{user_id}/{uuid.uuid4()}.{extension}"
    storage = supabase_admin.storage.from_(FORUM_IMAGE_BUCKET)
    storage.upload(
        storage_path,
        image_data,
        {"content-type": mime_type},
    )
    public_url = storage.get_public_url(storage_path)
    return public_url, storage_path


def delete_forum_image(storage_path: str) -> None:
    try:
        supabase_admin.storage.from_(FORUM_IMAGE_BUCKET).remove([storage_path])
    except Exception as cleanup_error:
        print("No se pudo eliminar la imagen de foro recién subida:", cleanup_error)

def get_forum_topics():

    try:

        response = (
            supabase_admin
            .table("forum_topics")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        return add_forum_user_data(response.data)

    except Exception as e:

        raise HTTPException(
                status_code=500,
                detail=public_error_detail(e)
            )
@app.post("/forum/topics")
def create_forum_topic(
    title: str = Form(...),
    content: str = Form(...),
    image: UploadFile | None = File(default=None),
    current_user=Depends(get_current_user),
):
    ensure_max_length(title, 120, "El título")
    ensure_max_length(content, 20000, "El contenido")

    image_url = None
    uploaded_path = None

    if image is not None:
        image_url, uploaded_path = upload_forum_image(
            image,
            str(current_user.id),
            "topics",
        )

    try:
        response = (
            supabase_admin
            .table("forum_topics")
            .insert({
                "user_id": str(current_user.id),
                "title": title,
                "content": content,
                "image_url": image_url,
            })
            .execute()
        )

        return {
            "message": "Tema creado correctamente",
            "topic": add_forum_user_data([response.data[0]])[0],
        }
    except Exception as e:
        if uploaded_path is not None:
            delete_forum_image(uploaded_path)
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.get("/forum/topics")
def get_forum_topics():

    try:
        # Obtener todos los temas
        response = (
            supabase_admin
            .table("forum_topics")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        # Los temas retirados por moderación no aparecen en la lista.
        return moderation.visible_forum_topics(
            add_forum_user_data(response.data or [])
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=public_error_detail(e)
        )


FORUM_REACTION_VALUES = (
    "heart",
    "laugh",
    "surprised",
    "clap",
    "sad",
    "angry",
    "blush"
)


def get_optional_forum_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security)
):
    if not credentials:
        return None

    try:
        response_user = supabase_public.auth.get_user(credentials.credentials)
        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")
        return response_user.user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado"
        ) from e


def ensure_forum_interaction_target_exists(
    table_name: str,
    target_id: str,
    target_label: str
):
    response = (
        supabase_admin
        .table(table_name)
        .select("id")
        .eq("id", target_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail=f"{target_label} no encontrado")


def find_forum_interaction(
    target_column: str,
    target_id: str,
    user_id: str,
    kind: str,
    value: str | None = None
):
    query = (
        supabase_admin
        .table("forum_interactions")
        .select("*")
        .eq(target_column, target_id)
        .eq("user_id", user_id)
        .eq("kind", kind)
    )
    if value is not None:
        query = query.eq("value", value)

    response = query.limit(1).execute()
    return response.data[0] if response.data else None


def update_forum_vote(interaction_id: str, vote_value: ForumVoteValue):
    response = (
        supabase_admin
        .table("forum_interactions")
        .update({
            "value": vote_value,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        .eq("id", interaction_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=409, detail="No se pudo actualizar el voto")
    return response.data[0]


def set_forum_vote(
    target_table: str,
    target_column: str,
    target_id: str,
    target_label: str,
    vote_value: ForumVoteValue,
    current_user
):
    ensure_forum_interaction_target_exists(target_table, target_id, target_label)
    user_id = str(current_user.id)
    existing = find_forum_interaction(
        target_column, target_id, user_id, "vote"
    )

    if existing:
        interaction = update_forum_vote(existing["id"], vote_value)
    else:
        interaction_data = {
            "user_id": user_id,
            "topic_id": target_id if target_column == "topic_id" else None,
            "reply_id": target_id if target_column == "reply_id" else None,
            "kind": "vote",
            "value": vote_value
        }
        try:
            response = (
                supabase_admin
                .table("forum_interactions")
                .insert(interaction_data)
                .execute()
            )
            interaction = response.data[0]
        except Exception:
            # Si otra solicitud creó el voto al mismo tiempo, actualizarlo.
            existing = find_forum_interaction(
                target_column, target_id, user_id, "vote"
            )
            if not existing:
                raise
            interaction = update_forum_vote(existing["id"], vote_value)

    return {"message": "Voto guardado correctamente", "interaction": interaction}


def remove_forum_interaction(
    target_table: str,
    target_column: str,
    target_id: str,
    target_label: str,
    current_user,
    kind: str,
    value: str | None = None
):
    ensure_forum_interaction_target_exists(target_table, target_id, target_label)
    user_id = str(current_user.id)
    existing = find_forum_interaction(
        target_column, target_id, user_id, kind, value
    )
    if not existing:
        return {"message": "No había una interacción para eliminar", "removed": False}

    (
        supabase_admin
        .table("forum_interactions")
        .delete()
        .eq("id", existing["id"])
        .eq("user_id", user_id)
        .execute()
    )
    return {"message": "Interacción eliminada correctamente", "removed": True}


def add_forum_reaction(
    target_table: str,
    target_column: str,
    target_id: str,
    target_label: str,
    reaction_value: ForumReactionValue,
    current_user
):
    ensure_forum_interaction_target_exists(target_table, target_id, target_label)
    user_id = str(current_user.id)
    existing = find_forum_interaction(
        target_column, target_id, user_id, "reaction", reaction_value
    )
    if existing:
        return {
            "message": "La reacción ya estaba registrada",
            "interaction": existing,
            "created": False
        }

    interaction_data = {
        "user_id": user_id,
        "topic_id": target_id if target_column == "topic_id" else None,
        "reply_id": target_id if target_column == "reply_id" else None,
        "kind": "reaction",
        "value": reaction_value
    }
    try:
        response = (
            supabase_admin
            .table("forum_interactions")
            .insert(interaction_data)
            .execute()
        )
        interaction = response.data[0]
    except Exception:
        # La restricción única también protege solicitudes simultáneas.
        existing = find_forum_interaction(
            target_column, target_id, user_id, "reaction", reaction_value
        )
        if not existing:
            raise
        return {
            "message": "La reacción ya estaba registrada",
            "interaction": existing,
            "created": False
        }

    return {
        "message": "Reacción agregada correctamente",
        "interaction": interaction,
        "created": True
    }


def get_forum_interaction_summary(
    target_table: str,
    target_column: str,
    target_id: str,
    target_label: str,
    current_user=None
):
    ensure_forum_interaction_target_exists(target_table, target_id, target_label)
    interactions = []
    page_size = 500
    offset = 0
    while True:
        response = (
            supabase_admin
            .table("forum_interactions")
            .select("kind, value, user_id")
            .eq(target_column, target_id)
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        interactions.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    votes = {"up": 0, "down": 0}
    reactions = {value: 0 for value in FORUM_REACTION_VALUES}
    current_user_vote = None
    current_user_reactions = []
    current_user_id = str(current_user.id) if current_user else None

    for interaction in interactions:
        kind = interaction.get("kind")
        value = interaction.get("value")
        interaction_user_id = str(interaction.get("user_id"))

        if kind == "vote" and value in votes:
            votes[value] += 1
            if interaction_user_id == current_user_id:
                current_user_vote = value
        elif kind == "reaction" and value in reactions:
            reactions[value] += 1
            if interaction_user_id == current_user_id:
                current_user_reactions.append(value)

    current_user_state = None
    if current_user:
        current_user_state = {
            "vote": current_user_vote,
            "reactions": [
                value for value in FORUM_REACTION_VALUES
                if value in current_user_reactions
            ]
        }

    return {
        "votes": votes,
        "reactions": reactions,
        "current_user": current_user_state
    }


@app.put("/forum/topics/{topic_id}/vote")
def vote_forum_topic(
    topic_id: str,
    vote: ForumVoteCreate,
    current_user=Depends(get_current_user)
):
    try:
        return set_forum_vote(
            "forum_topics", "topic_id", topic_id, "Tema", vote.value, current_user
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.delete("/forum/topics/{topic_id}/vote")
def delete_forum_topic_vote(
    topic_id: str,
    current_user=Depends(get_current_user)
):
    try:
        return remove_forum_interaction(
            "forum_topics", "topic_id", topic_id, "Tema", current_user, "vote"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.put("/forum/replies/{reply_id}/vote")
def vote_forum_reply(
    reply_id: str,
    vote: ForumVoteCreate,
    current_user=Depends(get_current_user)
):
    try:
        return set_forum_vote(
            "forum_replies", "reply_id", reply_id, "Respuesta", vote.value, current_user
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.delete("/forum/replies/{reply_id}/vote")
def delete_forum_reply_vote(
    reply_id: str,
    current_user=Depends(get_current_user)
):
    try:
        return remove_forum_interaction(
            "forum_replies", "reply_id", reply_id, "Respuesta", current_user, "vote"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.post("/forum/topics/{topic_id}/reactions")
def react_to_forum_topic(
    topic_id: str,
    reaction: ForumReactionCreate,
    current_user=Depends(get_current_user)
):
    try:
        return add_forum_reaction(
            "forum_topics", "topic_id", topic_id, "Tema", reaction.value, current_user
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.delete("/forum/topics/{topic_id}/reactions/{reaction}")
def delete_forum_topic_reaction(
    topic_id: str,
    reaction: ForumReactionValue,
    current_user=Depends(get_current_user)
):
    try:
        return remove_forum_interaction(
            "forum_topics", "topic_id", topic_id, "Tema",
            current_user, "reaction", reaction
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.post("/forum/replies/{reply_id}/reactions")
def react_to_forum_reply(
    reply_id: str,
    reaction: ForumReactionCreate,
    current_user=Depends(get_current_user)
):
    try:
        return add_forum_reaction(
            "forum_replies", "reply_id", reply_id, "Respuesta", reaction.value, current_user
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.delete("/forum/replies/{reply_id}/reactions/{reaction}")
def delete_forum_reply_reaction(
    reply_id: str,
    reaction: ForumReactionValue,
    current_user=Depends(get_current_user)
):
    try:
        return remove_forum_interaction(
            "forum_replies", "reply_id", reply_id, "Respuesta",
            current_user, "reaction", reaction
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.get("/forum/topics/{topic_id}/interactions")
def get_forum_topic_interactions(
    topic_id: str,
    current_user=Depends(get_optional_forum_user)
):
    try:
        return get_forum_interaction_summary(
            "forum_topics", "topic_id", topic_id, "Tema", current_user
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e


@app.get("/forum/replies/{reply_id}/interactions")
def get_forum_reply_interactions(
    reply_id: str,
    current_user=Depends(get_optional_forum_user)
):
    try:
        return get_forum_interaction_summary(
            "forum_replies", "reply_id", reply_id, "Respuesta", current_user
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=public_error_detail(e)) from e
@app.get("/forum/topics/{topic_id}")
def get_forum_topic(
    topic_id: str,
    viewer=Depends(get_optional_forum_user)
):

    try:

        response = (
            supabase_admin
            .table("forum_topics")
            .select("*")
            .eq("id", topic_id)
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=404,
                detail="Tema no encontrado"
            )

        # Un tema retirado solo lo ven su autor y los administradores.
        return moderation.present_forum_topic(
            add_forum_user_data([response.data])[0], viewer
        )

    except HTTPException:
        raise
    except Exception as e:
        # Sin filas, o con un id que no es un UUID: el tema no existe.
        if getattr(e, "code", None) in ("PGRST116", "22P02"):
            raise HTTPException(
                status_code=404,
                detail="Tema no encontrado"
            )

        raise HTTPException(
            status_code=500,
            detail=public_error_detail(e)
        )
@app.get("/forum/topics/{topic_id}/replies")
def get_forum_replies(
    topic_id: str,
    viewer=Depends(get_optional_forum_user)
):

    try:

        response = (
            supabase_admin
            .table("forum_replies")
            .select("*")
            .eq("topic_id", topic_id)
            .order("created_at", desc=False)
            .execute()
        )

        # Las respuestas retiradas se muestran sin su contenido.
        return moderation.present_forum_replies(
            add_forum_user_data(response.data), viewer
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=public_error_detail(e)
        )
        
# ------------------------------------------------------------
# Eliminar publicaciones propias del foro
# ------------------------------------------------------------
# Quien publicó puede borrar su tema, su respuesta o solo su imagen (por
# ejemplo, si se equivocó de archivo). No es moderación: el retiro por
# infracción lo hace un administrador y conserva el contenido.

def get_own_forum_post(table_name: str, post_id: str, user_id: str, label: str) -> dict:
    normalized_id = normalize_uuid_or_404(post_id, f"{label} no encontrado")
    response = (
        supabase_admin
        .table(table_name)
        .select("*")
        .eq("id", normalized_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    # La publicación de otra persona responde igual que una inexistente.
    if not response.data:
        raise HTTPException(status_code=404, detail=f"{label} no encontrado")

    return response.data[0]


def ensure_forum_posts_not_in_review(target_type: str, post_ids: list[str]) -> None:
    # Lo reportado o retirado se conserva hasta que la moderación lo revise.
    if moderation.cases_in_review(target_type, post_ids):
        raise HTTPException(
            status_code=409,
            detail=(
                "Esta publicación está en revisión por moderación y no se "
                "puede eliminar por ahora."
            )
        )


def delete_forum_post_image(post: dict) -> None:
    storage_path = moderation.storage_path_from_url(
        post.get("image_url"), FORUM_IMAGE_BUCKET
    )
    if storage_path:
        delete_forum_image(storage_path)


@app.delete("/forum/topics/{topic_id}")
def delete_forum_topic(topic_id: str, current_user=Depends(get_current_user)):
    try:
        topic = get_own_forum_post(
            "forum_topics", topic_id, str(current_user.id), "Tema"
        )
        replies = (
            supabase_admin
            .table("forum_replies")
            .select("id, image_url")
            .eq("topic_id", str(topic["id"]))
            .execute()
        ).data or []
        reply_ids = [str(reply["id"]) for reply in replies]

        ensure_forum_posts_not_in_review("forum_topic", [str(topic["id"])])
        ensure_forum_posts_not_in_review("forum_reply", reply_ids)

        # Un tema se elimina con todas sus respuestas.
        if reply_ids:
            (
                supabase_admin
                .table("forum_interactions")
                .delete()
                .in_("reply_id", reply_ids)
                .execute()
            )
            (
                supabase_admin
                .table("forum_replies")
                .delete()
                .eq("topic_id", str(topic["id"]))
                .execute()
            )
        (
            supabase_admin
            .table("forum_interactions")
            .delete()
            .eq("topic_id", str(topic["id"]))
            .execute()
        )
        (
            supabase_admin
            .table("forum_topics")
            .delete()
            .eq("id", str(topic["id"]))
            .eq("user_id", str(current_user.id))
            .execute()
        )

        for post in [topic, *replies]:
            delete_forum_post_image(post)

        return {"message": "Tema eliminado"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/forum/replies/{reply_id}")
def delete_forum_reply(reply_id: str, current_user=Depends(get_current_user)):
    try:
        reply = get_own_forum_post(
            "forum_replies", reply_id, str(current_user.id), "Respuesta"
        )
        ensure_forum_posts_not_in_review("forum_reply", [str(reply["id"])])

        (
            supabase_admin
            .table("forum_interactions")
            .delete()
            .eq("reply_id", str(reply["id"]))
            .execute()
        )
        (
            supabase_admin
            .table("forum_replies")
            .delete()
            .eq("id", str(reply["id"]))
            .eq("user_id", str(current_user.id))
            .execute()
        )
        delete_forum_post_image(reply)

        return {"message": "Respuesta eliminada"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


def remove_own_forum_image(
    table_name: str, target_type: str, post_id: str, user_id: str, label: str
) -> dict:
    post = get_own_forum_post(table_name, post_id, user_id, label)

    if not post.get("image_url"):
        raise HTTPException(
            status_code=400, detail="Esta publicación no tiene imagen."
        )
    # Sin texto no queda nada que mostrar: se elimina la publicación entera.
    if not (post.get("content") or "").strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Esta publicación solo tiene la imagen. "
                "Elimínala completa si ya no la quieres."
            )
        )
    ensure_forum_posts_not_in_review(target_type, [str(post["id"])])

    (
        supabase_admin
        .table(table_name)
        .update({"image_url": None})
        .eq("id", str(post["id"]))
        .eq("user_id", user_id)
        .execute()
    )
    delete_forum_post_image(post)

    return {"message": "Imagen eliminada", "image_url": None}


@app.delete("/forum/topics/{topic_id}/image")
def delete_forum_topic_image(topic_id: str, current_user=Depends(get_current_user)):
    try:
        return remove_own_forum_image(
            "forum_topics", "forum_topic", topic_id, str(current_user.id), "Tema"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.delete("/forum/replies/{reply_id}/image")
def delete_forum_reply_image(reply_id: str, current_user=Depends(get_current_user)):
    try:
        return remove_own_forum_image(
            "forum_replies", "forum_reply", reply_id, str(current_user.id), "Respuesta"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))


@app.post("/forum/topics/{topic_id}/replies")
def create_forum_reply(
    topic_id: str,
    content: str | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    current_user=Depends(get_current_user)
):
    uploaded_path = None

    try:

        # Verificar que el tema exista
        topic_response = (
            supabase_admin
            .table("forum_topics")
            .select("id")
            .eq("id", topic_id)
            .execute()
        )

        if not topic_response.data:
            raise HTTPException(
                status_code=404,
                detail="Tema no encontrado"
            )

        moderation.ensure_forum_topic_open(topic_id)

        if (content is None or not content.strip()) and image is None:
            raise HTTPException(
                status_code=400,
                detail="La respuesta debe incluir texto o una imagen",
            )

        ensure_max_length(content, 20000, "La respuesta")

        image_url = None
        if image is not None:
            image_url, uploaded_path = upload_forum_image(
                image,
                str(current_user.id),
                "replies",
            )

        # Crear la respuesta
        response = (
            supabase_admin
            .table("forum_replies")
            .insert({
                "topic_id": topic_id,
                "user_id": str(current_user.id),
                "content": content or "",
                "image_url": image_url,
            })
            .execute()
        )

        run_notification_task(
            notify_forum_reply, topic_id, str(current_user.id), response.data[0]
        )

        # Con el nombre de quien la escribió, para mostrarla sin recargar.
        return {
            "message": "Respuesta creada correctamente",
            "reply": add_forum_user_data([response.data[0]])[0]
        }

    except HTTPException:
        if uploaded_path is not None:
            delete_forum_image(uploaded_path)
        raise

    except Exception as e:
        if uploaded_path is not None:
            delete_forum_image(uploaded_path)

        raise HTTPException(
            status_code=500,
            detail=public_error_detail(e)
        )


# ============================================================
# SEGUIDORES
# ============================================================

def normalize_follow_user_id(user_id: str) -> str:
    try:
        return str(uuid.UUID(user_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security)
):
    # Sin token, o con un token inválido, la consulta se trata como anónima.
    if not credentials:
        return None

    try:
        response = supabase_public.auth.get_user(credentials.credentials)
        return response.user
    except Exception:
        return None


def is_following_user(follower_id: str, following_id: str) -> bool:
    response = (
        supabase_admin
        .table("user_follows")
        .select("follower_id")
        .eq("follower_id", follower_id)
        .eq("following_id", following_id)
        .limit(1)
        .execute()
    )

    return bool(response.data)


def count_follows(column: str, user_id: str) -> int:
    response = (
        supabase_admin
        .table("user_follows")
        .select(column, count="exact")
        .eq(column, user_id)
        .limit(1)
        .execute()
    )

    return response.count or 0


def get_follow_user_card(user_id: str, usernames_by_id: dict) -> dict | None:
    username = usernames_by_id.get(user_id)
    avatar_url = None

    # El avatar vive en los metadatos de Supabase Auth, no en la tabla users.
    try:
        auth_user = get_public_auth_user(user_id)
        metadata = auth_user.user_metadata or {}
        username = metadata.get("username") or username
        avatar_url = metadata.get("avatar_url")
    except HTTPException:
        if user_id not in usernames_by_id:
            return None

    return {
        "id": user_id,
        "username": username,
        "avatar_url": avatar_url
    }


def get_follow_user_cards(user_ids: list) -> list[dict]:
    unique_ids = list(dict.fromkeys(str(user_id) for user_id in user_ids if user_id))

    if not unique_ids:
        return []

    usernames_by_id = {}
    try:
        users_response = (
            supabase_admin
            .table("users")
            .select("id, username")
            .in_("id", unique_ids)
            .execute()
        )
        usernames_by_id = {
            str(user["id"]): user.get("username")
            for user in users_response.data
        }
    except Exception:
        usernames_by_id = {}

    # Auth solo permite consultar un usuario por llamada: se hacen en paralelo.
    with ThreadPoolExecutor(max_workers=min(8, len(unique_ids))) as executor:
        cards = list(executor.map(
            lambda user_id: get_follow_user_card(user_id, usernames_by_id),
            unique_ids
        ))

    return [card for card in cards if card]


@app.post("/users/{user_id}/follow")
def follow_user(
    user_id: str,
    current_user=Depends(get_current_user)
):
    target_id = normalize_follow_user_id(user_id)
    follower_id = str(current_user.id)

    if target_id == follower_id:
        raise HTTPException(
            status_code=400,
            detail="No puedes seguirte a ti mismo"
        )

    # Lanza 404 si el usuario no existe.
    get_public_auth_user(target_id)

    try:
        if is_following_user(follower_id, target_id):
            return {
                "message": "Ya sigues a este usuario",
                "following": True
            }

        supabase_admin.table("user_follows").insert({
            "follower_id": follower_id,
            "following_id": target_id
        }).execute()

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo seguir a este usuario"
        ) from e

    run_notification_task(notify_follow, target_id, follower_id)

    return {
        "message": "Ahora sigues a este usuario",
        "following": True
    }


@app.delete("/users/{user_id}/follow")
def unfollow_user(
    user_id: str,
    current_user=Depends(get_current_user)
):
    target_id = normalize_follow_user_id(user_id)

    try:
        supabase_admin.table("user_follows") \
            .delete() \
            .eq("follower_id", str(current_user.id)) \
            .eq("following_id", target_id) \
            .execute()

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo dejar de seguir a este usuario"
        ) from e

    return {
        "message": "Dejaste de seguir a este usuario",
        "following": False
    }


@app.get("/users/{user_id}/follow-stats")
def get_follow_stats(
    user_id: str,
    current_user=Depends(get_optional_current_user)
):
    target_id = normalize_follow_user_id(user_id)

    try:
        followers = count_follows("following_id", target_id)
        following = count_follows("follower_id", target_id)
        is_following = bool(
            current_user
            and str(current_user.id) != target_id
            and is_following_user(str(current_user.id), target_id)
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar las estadísticas de seguimiento"
        ) from e

    return {
        "followers": followers,
        "following": following,
        "is_following": is_following
    }


@app.get("/users/{user_id}/followers")
def get_followers(user_id: str):
    target_id = normalize_follow_user_id(user_id)

    try:
        response = (
            supabase_admin
            .table("user_follows")
            .select("follower_id")
            .eq("following_id", target_id)
            .execute()
        )

        return get_follow_user_cards(
            [row["follower_id"] for row in response.data]
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar la lista de seguidores"
        ) from e


@app.get("/users/{user_id}/following")
def get_following(user_id: str):
    target_id = normalize_follow_user_id(user_id)

    try:
        response = (
            supabase_admin
            .table("user_follows")
            .select("following_id")
            .eq("follower_id", target_id)
            .execute()
        )

        return get_follow_user_cards(
            [row["following_id"] for row in response.data]
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar la lista de seguidos"
        ) from e


# ============================================================
# LISTAS DE LECTURA
# ============================================================

MAX_READING_LISTS_PER_USER = 20
MAX_STORIES_PER_READING_LIST = 100
READING_LIST_COLUMNS = (
    "id, user_id, name, description, is_public, created_at, updated_at"
)


class ReadingListData(BaseModel):
    name: str
    description: str | None = None
    is_public: bool = False


def normalize_uuid_or_404(value: str, detail: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail=detail)


def clean_reading_list_data(reading_list: ReadingListData) -> dict:
    name = (reading_list.name or "").strip()
    description = (
        (reading_list.description or "").replace("\r\n", "\n").strip() or None
    )

    if not name:
        raise HTTPException(
            status_code=400,
            detail="La lista necesita un nombre"
        )
    if "\n" in name or "\r" in name:
        raise HTTPException(
            status_code=400,
            detail="El nombre de la lista no puede tener saltos de línea"
        )
    if len(name) > 80:
        raise HTTPException(
            status_code=400,
            detail="El nombre de la lista no puede superar los 80 caracteres"
        )
    if description and len(description) > 500:
        raise HTTPException(
            status_code=400,
            detail="La descripción no puede superar los 500 caracteres"
        )

    return {
        "name": name,
        "description": description,
        "is_public": reading_list.is_public
    }


def get_user_reading_list_rows(user_id: str, only_public: bool = False) -> list[dict]:
    query = (
        supabase_admin
        .table("reading_lists")
        .select(READING_LIST_COLUMNS)
        .eq("user_id", user_id)
    )

    if only_public:
        query = query.eq("is_public", True)

    return query.order("created_at", desc=True).execute().data or []


def get_reading_list_row(list_id: str) -> dict | None:
    response = (
        supabase_admin
        .table("reading_lists")
        .select(READING_LIST_COLUMNS)
        .eq("id", list_id)
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def get_owned_reading_list(list_id: str, current_user) -> dict:
    # Una lista ajena responde igual que una lista inexistente.
    normalized_id = normalize_uuid_or_404(list_id, "Lista no encontrada")
    row = get_reading_list_row(normalized_id)

    if not row or str(row["user_id"]) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Lista no encontrada")

    return row


def ensure_reading_list_name_available(
    rows: list[dict],
    name: str,
    ignore_list_id: str | None = None
) -> None:
    for row in rows:
        if str(row["id"]) == ignore_list_id:
            continue
        if (row.get("name") or "").strip().lower() == name.lower():
            raise HTTPException(
                status_code=400,
                detail="Ya tienes una lista con ese nombre"
            )


def get_reading_list_entries(list_id: str) -> list[dict]:
    response = (
        supabase_admin
        .table("reading_list_stories")
        .select("story_id, added_at, stories(*)")
        .eq("list_id", list_id)
        .order("added_at", desc=True)
        .execute()
    )

    return response.data or []


def get_published_reading_list_stories(list_id: str) -> list[dict]:
    # Las historias que dejaron de ser visibles (volvieron a borrador) se
    # ocultan, pero su registro se conserva por si vuelven a publicarse.
    stories = []

    for entry in get_reading_list_entries(list_id):
        story = entry.get("stories")
        if isinstance(story, dict) and story.get("status") in VISIBLE_STORY_STATUSES:
            stories.append(dict(story))

    return stories


def serialize_reading_lists(rows: list[dict]) -> list[dict]:
    if not rows:
        return []

    with ThreadPoolExecutor(max_workers=min(8, len(rows))) as executor:
        story_counts = list(executor.map(
            lambda row: len(get_published_reading_list_stories(str(row["id"]))),
            rows
        ))

    return [
        {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "name": row["name"],
            "description": row.get("description"),
            "is_public": bool(row.get("is_public")),
            "story_count": story_count,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at")
        }
        for row, story_count in zip(rows, story_counts)
    ]


def reading_list_error(detail: str, error: Exception, status_code: int = 400):
    if getattr(error, "code", None) == "23505":
        return HTTPException(
            status_code=400,
            detail="Ya tienes una lista con ese nombre"
        )

    return HTTPException(status_code=status_code, detail=detail)


@app.get("/me/reading-lists")
def get_my_reading_lists(
    story_id: str | None = None,
    current_user=Depends(get_current_user)
):
    normalized_story_id = (
        normalize_uuid_or_404(story_id, "Historia no encontrada")
        if story_id
        else None
    )

    try:
        rows = get_user_reading_list_rows(str(current_user.id))
        reading_lists = serialize_reading_lists(rows)

        if normalized_story_id and rows:
            entries_response = (
                supabase_admin
                .table("reading_list_stories")
                .select("list_id")
                .eq("story_id", normalized_story_id)
                .in_("list_id", [str(row["id"]) for row in rows])
                .execute()
            )
            list_ids_with_story = {
                str(entry["list_id"]) for entry in entries_response.data
            }

            for reading_list in reading_lists:
                reading_list["contains_story"] = (
                    reading_list["id"] in list_ids_with_story
                )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar tus listas de lectura"
        ) from e

    return {
        "lists": reading_lists,
        "max_lists": MAX_READING_LISTS_PER_USER
    }


@app.post("/reading-lists")
def create_reading_list(
    reading_list: ReadingListData,
    current_user=Depends(get_current_user)
):
    list_data = clean_reading_list_data(reading_list)

    try:
        rows = get_user_reading_list_rows(str(current_user.id))

        if len(rows) >= MAX_READING_LISTS_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Alcanzaste el máximo de "
                    f"{MAX_READING_LISTS_PER_USER} listas de lectura"
                )
            )

        ensure_reading_list_name_available(rows, list_data["name"])

        response = (
            supabase_admin
            .table("reading_lists")
            .insert({"user_id": str(current_user.id), **list_data})
            .execute()
        )

    except HTTPException:
        raise
    except Exception as e:
        raise reading_list_error("No se pudo crear la lista", e) from e

    return {
        "message": "Lista creada",
        "list": serialize_reading_lists(response.data[:1])[0]
    }


@app.put("/reading-lists/{list_id}")
def update_reading_list(
    list_id: str,
    reading_list: ReadingListData,
    current_user=Depends(get_current_user)
):
    list_data = clean_reading_list_data(reading_list)

    try:
        owned_list = get_owned_reading_list(list_id, current_user)
        ensure_reading_list_name_available(
            get_user_reading_list_rows(str(current_user.id)),
            list_data["name"],
            ignore_list_id=str(owned_list["id"])
        )

        response = (
            supabase_admin
            .table("reading_lists")
            .update({
                **list_data,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
            .eq("id", str(owned_list["id"]))
            .eq("user_id", str(current_user.id))
            .execute()
        )

    except HTTPException:
        raise
    except Exception as e:
        raise reading_list_error("No se pudo actualizar la lista", e) from e

    return {
        "message": "Lista actualizada",
        "list": serialize_reading_lists(response.data[:1])[0]
    }


@app.delete("/reading-lists/{list_id}")
def delete_reading_list(
    list_id: str,
    current_user=Depends(get_current_user)
):
    try:
        owned_list = get_owned_reading_list(list_id, current_user)

        supabase_admin.table("reading_lists") \
            .delete() \
            .eq("id", str(owned_list["id"])) \
            .eq("user_id", str(current_user.id)) \
            .execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo eliminar la lista"
        ) from e

    return {"message": "Lista eliminada"}


@app.post("/reading-lists/{list_id}/stories/{story_id}")
def add_story_to_reading_list(
    list_id: str,
    story_id: str,
    current_user=Depends(get_current_user)
):
    normalized_story_id = normalize_uuid_or_404(story_id, "Historia no encontrada")

    try:
        owned_list = get_owned_reading_list(list_id, current_user)
        owned_list_id = str(owned_list["id"])

        story_response = (
            supabase_admin
            .table("stories")
            .select("id, status")
            .eq("id", normalized_story_id)
            .execute()
        )

        if (
            not story_response.data
            or story_response.data[0]["status"] not in VISIBLE_STORY_STATUSES
        ):
            raise HTTPException(status_code=404, detail="Historia no encontrada")

        entries_response = (
            supabase_admin
            .table("reading_list_stories")
            .select("story_id")
            .eq("list_id", owned_list_id)
            .execute()
        )
        story_ids_in_list = {
            str(entry["story_id"]) for entry in entries_response.data
        }

        if normalized_story_id not in story_ids_in_list:
            if len(story_ids_in_list) >= MAX_STORIES_PER_READING_LIST:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Esta lista alcanzó el máximo de "
                        f"{MAX_STORIES_PER_READING_LIST} historias"
                    )
                )

            supabase_admin.table("reading_list_stories").upsert(
                {"list_id": owned_list_id, "story_id": normalized_story_id},
                on_conflict="list_id,story_id"
            ).execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo guardar la historia en la lista"
        ) from e

    return {
        "message": "Historia guardada en la lista",
        "list_id": owned_list_id,
        "story_id": normalized_story_id,
        "in_list": True
    }


@app.delete("/reading-lists/{list_id}/stories/{story_id}")
def remove_story_from_reading_list(
    list_id: str,
    story_id: str,
    current_user=Depends(get_current_user)
):
    normalized_story_id = normalize_uuid_or_404(story_id, "Historia no encontrada")

    try:
        owned_list = get_owned_reading_list(list_id, current_user)
        owned_list_id = str(owned_list["id"])

        supabase_admin.table("reading_list_stories") \
            .delete() \
            .eq("list_id", owned_list_id) \
            .eq("story_id", normalized_story_id) \
            .execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo quitar la historia de la lista"
        ) from e

    return {
        "message": "Historia quitada de la lista",
        "list_id": owned_list_id,
        "story_id": normalized_story_id,
        "in_list": False
    }


@app.get("/reading-lists/{list_id}")
def get_reading_list(
    list_id: str,
    current_user=Depends(get_optional_current_user)
):
    normalized_id = normalize_uuid_or_404(list_id, "Lista no encontrada")

    try:
        row = get_reading_list_row(normalized_id)
        is_owner = bool(
            row
            and current_user
            and str(row["user_id"]) == str(current_user.id)
        )

        # Una lista privada no existe para quien no es su propietario.
        if not row or (not row.get("is_public") and not is_owner):
            raise HTTPException(status_code=404, detail="Lista no encontrada")

        stories = add_public_story_card_data(
            get_published_reading_list_stories(normalized_id)
        )

        owner = {
            "id": str(row["user_id"]),
            "username": None,
            "avatar_url": None
        }
        try:
            owner = get_public_profile_data(
                get_public_auth_user(str(row["user_id"]))
            )
        except HTTPException:
            pass

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar la lista"
        ) from e

    return {
        "list": {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "name": row["name"],
            "description": row.get("description"),
            "is_public": bool(row.get("is_public")),
            "story_count": len(stories),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "is_owner": is_owner,
            "owner": owner
        },
        "stories": stories
    }


@app.get("/users/{user_id}/reading-lists")
def get_public_user_reading_lists(user_id: str):
    target_id = normalize_uuid_or_404(user_id, "Usuario no encontrado")

    try:
        rows = get_user_reading_list_rows(target_id, only_public=True)
        reading_lists = serialize_reading_lists(rows)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar las listas de lectura"
        ) from e

    return {"user_id": target_id, "lists": reading_lists}


# ============================================================
# PROGRESO DE LECTURA
# ============================================================

class ReadingProgressUpdate(BaseModel):
    chapter_id: str
    paragraph_index: int = 0


READING_PROGRESS_MAX_PARAGRAPH = 100000
READING_PROGRESS_RECENT_LIMIT = 6


@app.get("/stories/{story_id}/progress")
def get_reading_progress(story_id: str, current_user=Depends(get_current_user)):
    normalized_story_id = normalize_uuid_or_404(story_id, "Historia no encontrada")

    # Si falla, la historia se lee igual, solo que desde el comienzo.
    try:
        response = (
            supabase_admin
            .table("reading_progress")
            .select("chapter_id, paragraph_index, updated_at")
            .eq("user_id", str(current_user.id))
            .eq("story_id", normalized_story_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print("No se pudo cargar el progreso de lectura:", repr(e))
        return {"progress": None}

    return {"progress": response.data[0] if response.data else None}


@app.put("/stories/{story_id}/progress")
def save_reading_progress(
    story_id: str,
    progress: ReadingProgressUpdate,
    current_user=Depends(get_current_user)
):
    normalized_story_id = normalize_uuid_or_404(story_id, "Historia no encontrada")
    chapter_id = normalize_uuid_or_404(progress.chapter_id, "Capítulo no encontrado")
    paragraph_index = max(
        0, min(progress.paragraph_index, READING_PROGRESS_MAX_PARAGRAPH)
    )

    try:
        # Solo se guarda el progreso de lo que cualquier lector puede leer.
        chapter_response = (
            supabase_admin
            .table("chapters")
            .select("id")
            .eq("id", chapter_id)
            .eq("story_id", normalized_story_id)
            .eq("status", "published")
            .limit(1)
            .execute()
        )
        story_response = (
            supabase_admin
            .table("stories")
            .select("id")
            .eq("id", normalized_story_id)
            .in_("status", list(VISIBLE_STORY_STATUSES))
            .limit(1)
            .execute()
        )

        if not chapter_response.data or not story_response.data:
            raise HTTPException(status_code=404, detail="Capítulo no encontrado")

        supabase_admin.table("reading_progress").upsert(
            {
                "user_id": str(current_user.id),
                "story_id": normalized_story_id,
                "chapter_id": chapter_id,
                "paragraph_index": paragraph_index,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            on_conflict="user_id,story_id"
        ).execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=public_error_detail(e))

    return {
        "progress": {
            "chapter_id": chapter_id,
            "paragraph_index": paragraph_index
        }
    }


@app.get("/me/reading-progress")
def get_my_reading_progress(current_user=Depends(get_current_user)):
    # Historias que el lector tiene a medias, de la más reciente a la más
    # antigua. Si falla, el inicio se muestra sin esta sección.
    try:
        progress_response = (
            supabase_admin
            .table("reading_progress")
            .select("story_id, chapter_id, paragraph_index, updated_at")
            .eq("user_id", str(current_user.id))
            .order("updated_at", desc=True)
            .limit(READING_PROGRESS_RECENT_LIMIT)
            .execute()
        )
        rows = progress_response.data or []

        if not rows:
            return {"items": []}

        story_ids = [str(row["story_id"]) for row in rows]

        stories_response = (
            supabase_admin
            .table("stories")
            .select("id, title, cover_url")
            .in_("id", story_ids)
            .in_("status", list(VISIBLE_STORY_STATUSES))
            .execute()
        )
        stories_by_id = {
            str(story["id"]): story for story in stories_response.data or []
        }

        chapters_response = (
            supabase_admin
            .table("chapters")
            .select("id, story_id, title, chapter_number")
            .in_("story_id", story_ids)
            .eq("status", "published")
            .order("chapter_number")
            .execute()
        )
        chapters_by_story: dict[str, list[dict]] = {}
        for chapter in chapters_response.data or []:
            chapters_by_story.setdefault(str(chapter["story_id"]), []).append(chapter)

        items = []
        for row in rows:
            story = stories_by_id.get(str(row["story_id"]))
            chapters = chapters_by_story.get(str(row["story_id"]), [])
            position = next(
                (
                    index
                    for index, chapter in enumerate(chapters)
                    if str(chapter["id"]) == str(row["chapter_id"])
                ),
                None
            )

            # La historia o el capítulo dejaron de estar publicados.
            if not story or position is None:
                continue

            items.append({
                "story_id": str(story["id"]),
                "story_title": story.get("title"),
                "cover_url": story.get("cover_url"),
                "chapter_id": str(row["chapter_id"]),
                "chapter_title": chapters[position].get("title"),
                "chapter_position": position + 1,
                "chapter_total": len(chapters),
                "paragraph_index": row.get("paragraph_index") or 0,
                "updated_at": row.get("updated_at")
            })

        return {"items": items}

    except Exception as e:
        print("No se pudo cargar la lista de lecturas en curso:", repr(e))
        return {"items": []}


# ============================================================
# PERSONALIZACIÓN DEL PERFIL ("MI ESPACIO")
# ============================================================

class CustomizationUpdate(BaseModel):
    theme: str = DEFAULT_PROFILE_THEME
    decorations: list[str] = []
    colors: dict = {}


def default_customization() -> dict:
    return {
        "theme": DEFAULT_PROFILE_THEME,
        "decorations": [],
        "colors": {}
    }


def validate_customization(customization: CustomizationUpdate) -> dict:
    # Solo se acepta lo que existe en el catálogo: no se guarda CSS ni
    # colores libres, así el perfil siempre es legible.
    theme = customization.theme

    if theme not in PROFILE_THEME_ACCENTS:
        raise HTTPException(
            status_code=400,
            detail="El tema elegido no existe"
        )

    if len(customization.decorations) > len(PROFILE_DECORATIONS):
        raise HTTPException(
            status_code=400,
            detail="Elegiste demasiadas decoraciones"
        )

    decorations = list(dict.fromkeys(customization.decorations))

    if any(item not in PROFILE_DECORATIONS for item in decorations):
        raise HTTPException(
            status_code=400,
            detail="Una de las decoraciones elegidas no existe"
        )

    emoji_count = sum(
        1 for item in decorations if PROFILE_DECORATIONS[item] == "emoji"
    )
    ambient_count = sum(
        1 for item in decorations if PROFILE_DECORATIONS[item] == "ambient"
    )

    if emoji_count > MAX_EMOJI_DECORATIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Puedes elegir hasta {MAX_EMOJI_DECORATIONS} emojis"
        )
    if ambient_count > MAX_AMBIENT_DECORATIONS:
        raise HTTPException(
            status_code=400,
            detail="Puedes elegir solo 1 fondo"
        )

    if any(key != "accent" for key in customization.colors):
        raise HTTPException(
            status_code=400,
            detail="Solo se puede personalizar el color de acento"
        )

    colors = {}
    accent = customization.colors.get("accent")

    if accent not in (None, ""):
        if (
            not isinstance(accent, str)
            or accent not in PROFILE_THEME_ACCENTS[theme]
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Ese color de acento no está disponible "
                    "para el tema elegido"
                )
            )
        colors["accent"] = accent

    return {
        "theme": theme,
        "decorations": decorations,
        "colors": colors
    }


def sanitize_customization(row: dict | None) -> dict:
    # Lectura tolerante: si el catálogo cambia, lo que ya no exista
    # se descarta en lugar de romper el perfil.
    customization = default_customization()

    if not isinstance(row, dict):
        return customization

    if row.get("theme") in PROFILE_THEME_ACCENTS:
        customization["theme"] = row["theme"]

    emoji_count = 0
    ambient_count = 0
    stored_decorations = row.get("decorations")

    for item in stored_decorations if isinstance(stored_decorations, list) else []:
        if (
            not isinstance(item, str)
            or item not in PROFILE_DECORATIONS
            or item in customization["decorations"]
        ):
            continue

        if PROFILE_DECORATIONS[item] == "ambient":
            if ambient_count >= MAX_AMBIENT_DECORATIONS:
                continue
            ambient_count += 1
        elif PROFILE_DECORATIONS[item] == "emoji":
            if emoji_count >= MAX_EMOJI_DECORATIONS:
                continue
            emoji_count += 1

        customization["decorations"].append(item)

    stored_colors = row.get("colors")
    accent = stored_colors.get("accent") if isinstance(stored_colors, dict) else None

    if (
        isinstance(accent, str)
        and accent in PROFILE_THEME_ACCENTS[customization["theme"]]
    ):
        customization["colors"] = {"accent": accent}

    return customization


def get_user_customization(user_id: str) -> dict:
    response = (
        supabase_admin
        .table("profile_customizations")
        .select("theme, decorations, colors")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    return sanitize_customization(response.data[0] if response.data else None)


@app.get("/me/customization")
def get_my_customization(current_user=Depends(get_current_user)):
    try:
        customization = get_user_customization(str(current_user.id))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar la personalización de tu perfil"
        ) from e

    return {"customization": customization}


@app.put("/me/customization")
def update_my_customization(
    customization: CustomizationUpdate,
    current_user=Depends(get_current_user)
):
    customization_data = validate_customization(customization)

    try:
        supabase_admin.table("profile_customizations").upsert(
            {
                "user_id": str(current_user.id),
                **customization_data,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            on_conflict="user_id"
        ).execute()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo guardar la personalización de tu perfil"
        ) from e

    return {
        "message": "Personalización guardada",
        "customization": customization_data
    }


# ============================================================
# BÚSQUEDA DE USUARIOS
# ============================================================

USER_SEARCH_MIN_LENGTH = 2
USER_SEARCH_MAX_LENGTH = 30
USER_SEARCH_MAX_RESULTS = 20
USER_SEARCH_RATE_LIMIT = 30
USER_SEARCH_RATE_WINDOW_SECONDS = 10
USER_SEARCH_AVATAR_TTL_SECONDS = 300
USER_SEARCH_MAX_TRACKED_KEYS = 5000

user_search_requests: dict[str, deque] = {}
user_search_requests_lock = threading.Lock()
user_search_avatars: dict[str, tuple[float, str | None]] = {}
user_search_avatars_lock = threading.Lock()


def limit_user_search_requests(request: Request) -> None:
    # Limitador en memoria, por IP y solo para la búsqueda de usuarios.
    client_ip = request.client.host if request.client else "desconocido"
    now = time.monotonic()

    with user_search_requests_lock:
        if len(user_search_requests) > USER_SEARCH_MAX_TRACKED_KEYS:
            user_search_requests.clear()

        timestamps = user_search_requests.setdefault(client_ip, deque())

        while timestamps and now - timestamps[0] > USER_SEARCH_RATE_WINDOW_SECONDS:
            timestamps.popleft()

        if len(timestamps) >= USER_SEARCH_RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Demasiadas búsquedas seguidas. Espera unos segundos."
            )

        timestamps.append(now)


def clean_user_search_query(q: str | None) -> str:
    raw_query = (q or "").strip()

    if not raw_query:
        return ""

    if len(raw_query) > USER_SEARCH_MAX_LENGTH + 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "La búsqueda no puede superar los "
                f"{USER_SEARCH_MAX_LENGTH} caracteres"
            )
        )

    # Se admite escribir "@usuario". El "*" se descarta porque la API de
    # la base de datos lo interpreta como comodín.
    query = raw_query.lstrip("@").replace("*", "").strip()

    if len(query) < USER_SEARCH_MIN_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Escribe al menos {USER_SEARCH_MIN_LENGTH} caracteres"
        )
    if len(query) > USER_SEARCH_MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                "La búsqueda no puede superar los "
                f"{USER_SEARCH_MAX_LENGTH} caracteres"
            )
        )

    return query


def escape_like_pattern(value: str) -> str:
    # "_" y "%" se buscan como texto, no como comodines.
    return (
        value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def find_users_by_username(pattern: str | None, limit: int) -> list[dict]:
    # Solo se leen id y username: nunca el rol ni otros datos de la tabla.
    query = supabase_admin.table("users").select("id, username")

    if pattern is None:
        query = query.neq("username", "")
    else:
        query = query.ilike("username", pattern)

    return query.order("username").limit(limit).execute().data or []


def get_user_search_avatar(user_id: str) -> str | None:
    now = time.monotonic()

    with user_search_avatars_lock:
        cached = user_search_avatars.get(user_id)
        if cached and cached[0] > now:
            return cached[1]

    # El avatar vive en los metadatos de Supabase Auth.
    try:
        auth_user = get_public_auth_user(user_id)
        avatar_url = (auth_user.user_metadata or {}).get("avatar_url")
    except HTTPException:
        avatar_url = None

    with user_search_avatars_lock:
        if len(user_search_avatars) > USER_SEARCH_MAX_TRACKED_KEYS:
            user_search_avatars.clear()
        user_search_avatars[user_id] = (
            now + USER_SEARCH_AVATAR_TTL_SECONDS,
            avatar_url
        )

    return avatar_url


def get_user_search_display_names(user_ids: list[str]) -> dict:
    try:
        response = (
            supabase_admin
            .table("user_profiles")
            .select("user_id, display_name")
            .in_("user_id", user_ids)
            .execute()
        )
        return {
            str(row["user_id"]): row.get("display_name")
            for row in response.data
        }
    except Exception:
        return {}


@app.get("/users/search")
def search_users(
    request: Request,
    q: str | None = None,
    limit: int = USER_SEARCH_MAX_RESULTS
):
    limit_user_search_requests(request)

    query = clean_user_search_query(q)
    limit = max(1, min(limit, USER_SEARCH_MAX_RESULTS))

    try:
        if query:
            escaped_query = escape_like_pattern(query)
            # Orden de relevancia: coincidencia exacta, después los que
            # empiezan por el texto y por último los que lo contienen.
            candidates = (
                find_users_by_username(escaped_query, 5)
                + find_users_by_username(f"{escaped_query}%", limit + 1)
                + find_users_by_username(f"%{escaped_query}%", limit + 1)
            )
        else:
            # Sin texto: primeros usuarios por orden alfabético.
            candidates = find_users_by_username(None, limit + 1)

        rows_by_id = {}
        for row in candidates:
            if row.get("username"):
                rows_by_id.setdefault(str(row["id"]), row)

        rows = list(rows_by_id.values())
        has_more = len(rows) > limit
        rows = rows[:limit]
        user_ids = [str(row["id"]) for row in rows]

        display_names = (
            get_user_search_display_names(user_ids) if user_ids else {}
        )

        avatars = []
        if user_ids:
            with ThreadPoolExecutor(max_workers=min(8, len(user_ids))) as executor:
                avatars = list(executor.map(get_user_search_avatar, user_ids))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=public_error_detail(
                e, "No se pudo completar la búsqueda de usuarios"
            )
        ) from e

    return {
        "query": query,
        "users": [
            {
                "id": user_id,
                "username": row["username"],
                "display_name": display_names.get(user_id),
                "avatar_url": avatar_url
            }
            for user_id, row, avatar_url in zip(user_ids, rows, avatars)
        ],
        "has_more": has_more
    }


# ============================================================
# NOTIFICACIONES
# ============================================================
# Solo el backend crea notificaciones: no existe ningún endpoint para
# crearlas y el destinatario siempre se calcula aquí, desde la base de datos.

NOTIFICATION_PAGE_SIZE = 20
NOTIFICATION_MAX_PAGE_SIZE = 50
NOTIFICATION_RETENTION_DAYS = 90
NOTIFICATION_REPEAT_HOURS = 24
NOTIFICATION_EXCERPT_LENGTH = 140
NOTIFICATION_RECENT_ACTORS = 10
NOTIFICATION_INSERT_CHUNK = 500

# Tipos que se agrupan mientras la notificación siga sin leer:
# "brity y 3 personas más recomendaron tu historia".
GROUPED_NOTIFICATION_TYPES = {
    "follow",
    "story_vote",
    "story_favorite",
    "story_rating"
}
SUPPORT_STATUS_VALUES = {"pending", "in_review", "resolved"}

notification_executor = ThreadPoolExecutor(max_workers=2)


def run_notification_task(task, *args) -> None:
    # Las notificaciones se crean en segundo plano y nunca deben romper
    # ni retrasar la acción que las origina.
    def safe_task():
        try:
            task(*args)
        except Exception as e:
            print("No se pudo crear la notificación:", repr(e))

    try:
        notification_executor.submit(safe_task)
    except Exception as e:
        print("No se pudo programar la notificación:", repr(e))


def utc_timestamp(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def notification_excerpt(text: str | None) -> str | None:
    clean_text = " ".join((text or "").split())

    if not clean_text:
        return None
    if len(clean_text) > NOTIFICATION_EXCERPT_LENGTH:
        return clean_text[:NOTIFICATION_EXCERPT_LENGTH - 1].rstrip() + "…"

    return clean_text


def filter_notification_story(query, story_id: str | None):
    if story_id is None:
        return query.is_("story_id", "null")
    return query.eq("story_id", story_id)


def create_notification(
    recipient_user_id: str | None,
    notification_type: str,
    actor_user_id: str | None = None,
    story_id: str | None = None,
    forum_topic_id: str | None = None,
    support_request_id: str | None = None,
    data: dict | None = None
) -> None:
    if not recipient_user_id:
        return

    recipient_user_id = str(recipient_user_id)
    actor_user_id = str(actor_user_id) if actor_user_id else None

    # Nadie recibe notificaciones de sus propias acciones.
    if actor_user_id == recipient_user_id:
        return

    now = datetime.now(timezone.utc)
    notification_data = dict(data or {})
    row = {
        "recipient_user_id": recipient_user_id,
        "actor_user_id": actor_user_id,
        "type": notification_type,
        "story_id": story_id,
        "forum_topic_id": forum_topic_id,
        "support_request_id": support_request_id,
        "data": notification_data
    }

    if notification_type not in GROUPED_NOTIFICATION_TYPES or not actor_user_id:
        supabase_admin.table("notifications").insert(row).execute()
        return

    def find_group_rows(only_unread: bool) -> list[dict]:
        query = (
            supabase_admin
            .table("notifications")
            .select("id, actor_user_id, actor_count, data, is_read")
            .eq("recipient_user_id", recipient_user_id)
            .eq("type", notification_type)
        )
        query = filter_notification_story(query, story_id)

        if only_unread:
            query = query.eq("is_read", False)
        else:
            repeat_limit = now - timedelta(hours=NOTIFICATION_REPEAT_HOURS)
            query = query.gte("updated_at", utc_timestamp(repeat_limit))

        return (
            query.order("updated_at", desc=True).limit(20).execute().data or []
        )

    def known_actors(group_row: dict) -> list[str]:
        stored = (group_row.get("data") or {}).get("actor_ids")
        actors = [str(item) for item in stored] if isinstance(stored, list) else []
        if group_row.get("actor_user_id"):
            actors.append(str(group_row["actor_user_id"]))
        return actors

    # La misma persona repitiendo la misma acción (seguir, dejar de seguir
    # y volver a seguir) no genera otra notificación durante 24 horas.
    for recent_row in find_group_rows(only_unread=False):
        if actor_user_id in known_actors(recent_row):
            return

    def add_to_group(group_row: dict) -> None:
        if actor_user_id in known_actors(group_row):
            return

        actor_ids = list(dict.fromkeys(known_actors(group_row) + [actor_user_id]))
        supabase_admin.table("notifications").update({
            "actor_user_id": actor_user_id,
            "actor_count": int(group_row.get("actor_count") or 1) + 1,
            "data": {
                **(group_row.get("data") or {}),
                **notification_data,
                "actor_ids": actor_ids[-NOTIFICATION_RECENT_ACTORS:]
            },
            "updated_at": utc_timestamp(now)
        }).eq("id", group_row["id"]).eq(
            "recipient_user_id", recipient_user_id
        ).execute()

    open_groups = find_group_rows(only_unread=True)

    if open_groups:
        add_to_group(open_groups[0])
        return

    try:
        supabase_admin.table("notifications").insert({
            **row,
            "data": {**notification_data, "actor_ids": [actor_user_id]}
        }).execute()
    except Exception:
        # Otra acción simultánea abrió el grupo: se suma a ese.
        open_groups = find_group_rows(only_unread=True)
        if not open_groups:
            raise
        add_to_group(open_groups[0])


def notify_follow(following_id: str, follower_id: str) -> None:
    create_notification(following_id, "follow", actor_user_id=follower_id)


def notify_story_event(
    notification_type: str,
    story_id: str,
    actor_user_id: str,
    extra_data: dict | None = None
) -> None:
    story_response = (
        supabase_admin
        .table("stories")
        .select("id, author_id, title")
        .eq("id", story_id)
        .limit(1)
        .execute()
    )

    if not story_response.data:
        return

    story = story_response.data[0]
    create_notification(
        story.get("author_id"),
        notification_type,
        actor_user_id=actor_user_id,
        story_id=str(story["id"]),
        data={"story_title": story.get("title"), **(extra_data or {})}
    )


def notify_forum_reply(topic_id: str, actor_user_id: str, reply: dict) -> None:
    topic_response = (
        supabase_admin
        .table("forum_topics")
        .select("id, user_id, title")
        .eq("id", topic_id)
        .limit(1)
        .execute()
    )

    if not topic_response.data:
        return

    topic = topic_response.data[0]
    create_notification(
        topic.get("user_id"),
        "forum_reply",
        actor_user_id=actor_user_id,
        forum_topic_id=str(topic["id"]),
        data={
            "topic_title": topic.get("title"),
            "reply_id": str(reply.get("id")) if reply.get("id") else None,
            "excerpt": notification_excerpt(reply.get("content"))
        }
    )


def notify_support_status(support_request: dict, admin_user_id: str | None) -> None:
    recipient_user_id = support_request.get("user_id")
    status = support_request.get("status")

    if not recipient_user_id or status not in SUPPORT_STATUS_VALUES:
        return
    # Si quien cambia el estado es el propio solicitante, no hace falta avisarle.
    if admin_user_id and str(admin_user_id) == str(recipient_user_id):
        return

    last_response = (
        supabase_admin
        .table("notifications")
        .select("data")
        .eq("recipient_user_id", str(recipient_user_id))
        .eq("type", "support_status")
        .eq("support_request_id", str(support_request["id"]))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    # Guardar dos veces el mismo estado no repite el aviso.
    if last_response.data and (last_response.data[0].get("data") or {}).get("status") == status:
        return

    # Sin actor: no se muestra qué persona del equipo gestionó la solicitud.
    create_notification(
        recipient_user_id,
        "support_status",
        support_request_id=str(support_request["id"]),
        data={"status": status, "category": support_request.get("category")}
    )

    # Al resolverla, además se le avisa por correo que ya fue revisada.
    if status == "resolved":
        admin_alerts.deliver_support_reviewed(
            recipient_user_id, support_request.get("category")
        )


def notify_chapter_published(chapter: dict, previous_status: str | None) -> None:
    # Solo cuando el capítulo queda publicado: crear o editar un borrador,
    # o volver a guardar uno que ya estaba publicado, no notifica.
    if chapter.get("status") != "published" or previous_status == "published":
        return

    chapter_id = str(chapter["id"])
    story_response = (
        supabase_admin
        .table("stories")
        .select("id, author_id, title, status")
        .eq("id", str(chapter["story_id"]))
        .limit(1)
        .execute()
    )

    if not story_response.data:
        return

    story = story_response.data[0]

    # Los capítulos de una historia en borrador no son visibles para lectores.
    if story.get("status") == "draft":
        return

    story_id = str(story["id"])
    author_id = str(story["author_id"]) if story.get("author_id") else None

    # Destinatarios: únicamente quienes tienen la historia en Favoritos.
    recipient_ids = []
    offset = 0
    while True:
        favorites_response = (
            supabase_admin
            .table("favorites")
            .select("user_id")
            .eq("story_id", story_id)
            .order("user_id")
            .range(offset, offset + 999)
            .execute()
        )
        page = favorites_response.data or []
        recipient_ids.extend(str(row["user_id"]) for row in page if row.get("user_id"))
        if len(page) < 1000:
            break
        offset += 1000

    already_response = (
        supabase_admin
        .table("notifications")
        .select("recipient_user_id")
        .eq("type", "story_chapter")
        .eq("chapter_id", chapter_id)
        .execute()
    )
    already_notified = {
        str(row["recipient_user_id"]) for row in already_response.data or []
    }

    rows = [
        {
            "recipient_user_id": recipient_id,
            "actor_user_id": author_id,
            "type": "story_chapter",
            "story_id": story_id,
            "chapter_id": chapter_id,
            "data": {
                "story_title": story.get("title"),
                "chapter_title": chapter.get("title"),
                "chapter_number": chapter.get("chapter_number")
            }
        }
        # Una notificación por capítulo y por lector; nunca para quien publica.
        for recipient_id in dict.fromkeys(recipient_ids)
        if recipient_id != author_id and recipient_id not in already_notified
    ]

    for start in range(0, len(rows), NOTIFICATION_INSERT_CHUNK):
        supabase_admin.table("notifications").insert(
            rows[start:start + NOTIFICATION_INSERT_CHUNK]
        ).execute()


def count_unread_notifications(user_id: str) -> int:
    response = (
        supabase_admin
        .table("notifications")
        .select("id", count="exact")
        .eq("recipient_user_id", user_id)
        .eq("is_read", False)
        .limit(1)
        .execute()
    )

    return response.count or 0


def serialize_notifications(rows: list[dict]) -> list[dict]:
    actor_ids = list(dict.fromkeys(
        str(row["actor_user_id"]) for row in rows if row.get("actor_user_id")
    ))
    usernames_by_id = {}
    avatars_by_id = {}

    if actor_ids:
        try:
            users_response = (
                supabase_admin
                .table("users")
                .select("id, username")
                .in_("id", actor_ids)
                .execute()
            )
            usernames_by_id = {
                str(user["id"]): user.get("username")
                for user in users_response.data
            }
        except Exception:
            usernames_by_id = {}

        with ThreadPoolExecutor(max_workers=min(8, len(actor_ids))) as executor:
            avatars_by_id = dict(zip(
                actor_ids,
                executor.map(get_user_search_avatar, actor_ids)
            ))

    notifications = []
    for row in rows:
        actor_id = str(row["actor_user_id"]) if row.get("actor_user_id") else None
        # actor_ids es un dato interno de la agrupación: no se expone.
        public_data = {
            key: value
            for key, value in (row.get("data") or {}).items()
            if key != "actor_ids"
        }

        notifications.append({
            "id": str(row["id"]),
            "type": row["type"],
            "is_read": bool(row.get("is_read")),
            "actor": {
                "id": actor_id,
                "username": usernames_by_id.get(actor_id),
                "avatar_url": avatars_by_id.get(actor_id)
            } if actor_id else None,
            "actor_count": int(row.get("actor_count") or 1),
            "story_id": row.get("story_id"),
            "chapter_id": row.get("chapter_id"),
            "forum_topic_id": row.get("forum_topic_id"),
            "support_request_id": row.get("support_request_id"),
            "data": public_data,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at")
        })

    return notifications


@app.get("/notifications")
def get_notifications(
    limit: int = NOTIFICATION_PAGE_SIZE,
    before: str | None = None,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    limit = max(1, min(limit, NOTIFICATION_MAX_PAGE_SIZE))
    before_timestamp = None

    if before:
        try:
            before_timestamp = utc_timestamp(
                datetime.fromisoformat(before.strip().replace("Z", "+00:00"))
            )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="El parámetro before no es una fecha válida"
            )

    try:
        if before_timestamp is None:
            # Retención: al abrir la lista se borran las de más de 90 días.
            try:
                retention_limit = (
                    datetime.now(timezone.utc)
                    - timedelta(days=NOTIFICATION_RETENTION_DAYS)
                )
                supabase_admin.table("notifications") \
                    .delete() \
                    .eq("recipient_user_id", user_id) \
                    .lt("updated_at", utc_timestamp(retention_limit)) \
                    .execute()
            except Exception:
                pass

        query = (
            supabase_admin
            .table("notifications")
            .select("*")
            .eq("recipient_user_id", user_id)
        )

        if before_timestamp is not None:
            query = query.lt("updated_at", before_timestamp)

        rows = (
            query.order("updated_at", desc=True).limit(limit + 1).execute().data
            or []
        )
        has_more = len(rows) > limit
        rows = rows[:limit]

        return {
            "notifications": serialize_notifications(rows),
            "has_more": has_more,
            "next_before": rows[-1].get("updated_at") if has_more else None,
            "unread_count": count_unread_notifications(user_id)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudieron cargar tus notificaciones"
        ) from e


@app.get("/notifications/unread-count")
def get_unread_notification_count(current_user=Depends(get_current_user)):
    try:
        return {"unread_count": count_unread_notifications(str(current_user.id))}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar el contador de notificaciones"
        ) from e


@app.post("/notifications/read-all")
def mark_all_notifications_read(current_user=Depends(get_current_user)):
    try:
        response = (
            supabase_admin
            .table("notifications")
            .update({
                "is_read": True,
                "read_at": utc_timestamp(datetime.now(timezone.utc))
            })
            .eq("recipient_user_id", str(current_user.id))
            .eq("is_read", False)
            .execute()
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudieron marcar las notificaciones como leídas"
        ) from e

    return {
        "message": "Notificaciones marcadas como leídas",
        "updated": len(response.data or []),
        "unread_count": 0
    }


@app.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user=Depends(get_current_user)
):
    # Una notificación ajena responde igual que una inexistente.
    normalized_id = normalize_uuid_or_404(
        notification_id, "Notificación no encontrada"
    )

    try:
        response = (
            supabase_admin
            .table("notifications")
            .update({
                "is_read": True,
                "read_at": utc_timestamp(datetime.now(timezone.utc))
            })
            .eq("id", normalized_id)
            .eq("recipient_user_id", str(current_user.id))
            .execute()
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo marcar la notificación como leída"
        ) from e

    if not response.data:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    return {
        "message": "Notificación marcada como leída",
        "id": normalized_id,
        "unread_count": count_unread_notifications(str(current_user.id))
    }


@app.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: str,
    current_user=Depends(get_current_user)
):
    normalized_id = normalize_uuid_or_404(
        notification_id, "Notificación no encontrada"
    )

    try:
        response = (
            supabase_admin
            .table("notifications")
            .delete()
            .eq("id", normalized_id)
            .eq("recipient_user_id", str(current_user.id))
            .execute()
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudo eliminar la notificación"
        ) from e

    if not response.data:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    return {
        "message": "Notificación eliminada",
        "id": normalized_id,
        "unread_count": count_unread_notifications(str(current_user.id))
    }


@app.post("/notifications/clear-read")
def clear_read_notifications(current_user=Depends(get_current_user)):
    # Limpia el centro de actividad: borra solo las notificaciones ya leídas
    # del usuario autenticado. Las que siguen sin leer se conservan.
    user_id = str(current_user.id)

    try:
        response = (
            supabase_admin
            .table("notifications")
            .delete()
            .eq("recipient_user_id", user_id)
            .eq("is_read", True)
            .execute()
        )
        unread_count = count_unread_notifications(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="No se pudieron limpiar las notificaciones leídas"
        ) from e

    return {
        "message": "Notificaciones leídas eliminadas",
        "deleted": len(response.data or []),
        "unread_count": unread_count
    }


# ============================================================
# COMENTARIOS DE CAPÍTULOS
# ============================================================
#
# Comentarios anclados a un fragmento del texto de un capítulo.
# Usan sus propias tablas (chapter_comments y chapter_comment_reactions):
# no comparten datos con los comentarios de historias ni con el foro.

CHAPTER_COMMENT_MAX_LENGTH = 1000
CHAPTER_COMMENT_QUOTE_MAX_LENGTH = 600
CHAPTER_COMMENT_PAGE_SIZE = 1000
CHAPTER_COMMENT_ID_CHUNK = 100
# Emojis que puede incluir el texto de un comentario, iguales o combinados.
# No tiene relación con las reacciones, que se guardan aparte.
CHAPTER_COMMENT_MAX_EMOJIS = 12
CHAPTER_COMMENT_REACTIONS = (
    "heart",
    "laugh",
    "surprised",
    "sad",
    "angry",
    "clap",
    "love",
    "thinking",
    "impact",
    "sensitive",
    "rofl",
    "fire",
    "eyes",
    "skull",
    "unamused",
    "lip_bite",
    "lips",
    "eye"
)
CHAPTER_COMMENT_COLUMNS = (
    "id, chapter_id, user_id, parent_id, content, paragraph_index, "
    "start_offset, end_offset, quote, is_orphaned, status, created_at, edited_at"
)
CHAPTER_NOT_FOUND_DETAIL = "Capítulo no encontrado"
CHAPTER_COMMENT_NOT_FOUND_DETAIL = "Comentario no encontrado"
CHAPTER_CHANGED_DETAIL = (
    "El texto del capítulo cambió. Recarga la página e inténtalo nuevamente."
)

# Límites en memoria: (solicitudes permitidas, ventana en segundos).
CHAPTER_COMMENT_RATE_LIMITS = {
    "read": (120, 60),
    "write": (8, 60),
    "reaction": (40, 60)
}
CHAPTER_COMMENT_MAX_TRACKED_KEYS = 5000

chapter_comment_requests: dict[tuple[str, str], deque] = {}
chapter_comment_requests_lock = threading.Lock()


def limit_chapter_comment_requests(bucket: str, key: str) -> None:
    # Las lecturas se limitan por IP; las escrituras, por usuario.
    limit, window = CHAPTER_COMMENT_RATE_LIMITS[bucket]
    now = time.monotonic()

    with chapter_comment_requests_lock:
        if len(chapter_comment_requests) > CHAPTER_COMMENT_MAX_TRACKED_KEYS:
            chapter_comment_requests.clear()

        timestamps = chapter_comment_requests.setdefault((bucket, key), deque())

        while timestamps and now - timestamps[0] > window:
            timestamps.popleft()

        if len(timestamps) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Demasiadas acciones seguidas. Espera unos segundos."
            )

        timestamps.append(now)


EMOJI_VARIATION_SELECTOR = 0xFE0F
EMOJI_ZERO_WIDTH_JOINER = 0x200D
EMOJI_KEYCAP = 0x20E3


def is_emoji_code_point(code: int) -> bool:
    return (
        0x1F000 <= code <= 0x1FAFF      # caras, gestos, objetos, banderas
        or 0x2600 <= code <= 0x27BF     # símbolos y adornos (☀ ❤ ✨)
        or 0x2B00 <= code <= 0x2BFF     # ⭐ ⬛
        or 0x2300 <= code <= 0x23FF     # ⌚ ⏰
    )


def is_emoji_modifier(code: int) -> bool:
    return (
        code in (EMOJI_VARIATION_SELECTOR, EMOJI_KEYCAP)
        or 0x1F3FB <= code <= 0x1F3FF   # tonos de piel
        or 0xE0020 <= code <= 0xE007F   # etiquetas de banderas regionales
    )


def count_emojis(text: str | None) -> int:
    # Cuenta emojis como los ve una persona: una bandera, una familia o un
    # emoji con tono de piel valen 1 aunque usen varios caracteres.
    # El frontend usa la misma regla (utils/emoji.js).
    codes = [ord(char) for char in text or ""]
    total = 0
    index = 0

    while index < len(codes):
        code = codes[index]
        next_code = codes[index + 1] if index + 1 < len(codes) else None

        if 0x1F1E6 <= code <= 0x1F1FF:
            # Una bandera son dos letras regionales seguidas.
            total += 1
            index += 2 if next_code is not None and 0x1F1E6 <= next_code <= 0x1F1FF else 1
            continue

        is_emoji = is_emoji_code_point(code) or (
            # Un carácter común seguido del selector se muestra como emoji (©️, 1️⃣).
            next_code == EMOJI_VARIATION_SELECTOR
            and not is_emoji_modifier(code)
            and code != EMOJI_ZERO_WIDTH_JOINER
            and not chr(code).isspace()
        )

        if not is_emoji:
            index += 1
            continue

        total += 1
        index += 1

        while index < len(codes):
            if is_emoji_modifier(codes[index]):
                index += 1
            elif (
                codes[index] == EMOJI_ZERO_WIDTH_JOINER
                and index + 1 < len(codes)
                and is_emoji_code_point(codes[index + 1])
            ):
                # Emojis unidos (👩‍👧) forman uno solo.
                index += 2
            else:
                break

    return total


def clean_chapter_comment_content(value: str | None) -> str:
    content = clean_text_field(
        value, "El comentario", CHAPTER_COMMENT_MAX_LENGTH,
        required=True, single_line=False
    )

    if count_emojis(content) > CHAPTER_COMMENT_MAX_EMOJIS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Un comentario puede incluir hasta "
                f"{CHAPTER_COMMENT_MAX_EMOJIS} emojis"
            )
        )

    return content


def is_admin_user(user_id: str) -> bool:
    try:
        response = (
            supabase_admin
            .table("users")
            .select("role")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return False

    return bool(response.data) and response.data[0].get("role") == "admin"


def get_commentable_chapter(chapter_id: str, with_content: bool = False) -> dict:
    # Solo los capítulos publicados admiten comentarios. Un borrador
    # responde igual que un capítulo inexistente.
    normalized_id = normalize_uuid_or_404(chapter_id, CHAPTER_NOT_FOUND_DETAIL)
    columns = "id, story_id, status" + (", content" if with_content else "")

    chapter_response = (
        supabase_admin
        .table("chapters")
        .select(columns)
        .eq("id", normalized_id)
        .limit(1)
        .execute()
    )

    if not chapter_response.data:
        raise HTTPException(status_code=404, detail=CHAPTER_NOT_FOUND_DETAIL)

    chapter = chapter_response.data[0]

    if chapter.get("status") != "published":
        raise HTTPException(status_code=404, detail=CHAPTER_NOT_FOUND_DETAIL)

    story_response = (
        supabase_admin
        .table("stories")
        .select("author_id, status")
        .eq("id", chapter["story_id"])
        .limit(1)
        .execute()
    )

    if not story_response.data:
        raise HTTPException(status_code=404, detail=CHAPTER_NOT_FOUND_DETAIL)

    story = story_response.data[0]
    chapter["id"] = str(chapter["id"])
    chapter["story_author_id"] = str(story.get("author_id"))
    chapter["story_is_visible"] = story.get("status") in VISIBLE_STORY_STATUSES
    return chapter


def get_visible_chapter(chapter_id: str, with_content: bool = False) -> dict:
    # Para escribir: el capítulo y su historia deben ser visibles para lectores.
    chapter = get_commentable_chapter(chapter_id, with_content)

    if not chapter["story_is_visible"]:
        raise HTTPException(status_code=404, detail=CHAPTER_NOT_FOUND_DETAIL)

    return chapter


def get_visible_chapter_comment(comment_id: str) -> dict:
    # Un comentario retirado por moderación, o la respuesta a uno retirado,
    # responde igual que un comentario inexistente.
    normalized_id = normalize_uuid_or_404(
        comment_id, CHAPTER_COMMENT_NOT_FOUND_DETAIL
    )

    response = (
        supabase_admin
        .table("chapter_comments")
        .select(CHAPTER_COMMENT_COLUMNS)
        .eq("id", normalized_id)
        .limit(1)
        .execute()
    )

    if not response.data or response.data[0].get("status") != "visible":
        raise HTTPException(
            status_code=404, detail=CHAPTER_COMMENT_NOT_FOUND_DETAIL
        )

    comment = response.data[0]

    if comment.get("parent_id"):
        parent_response = (
            supabase_admin
            .table("chapter_comments")
            .select("status")
            .eq("id", comment["parent_id"])
            .limit(1)
            .execute()
        )

        if (
            not parent_response.data
            or parent_response.data[0].get("status") != "visible"
        ):
            raise HTTPException(
                status_code=404, detail=CHAPTER_COMMENT_NOT_FOUND_DETAIL
            )

    # El capítulo debe seguir siendo visible para lectores.
    get_visible_chapter(str(comment["chapter_id"]))
    return comment


def fetch_chapter_comment_rows(
    table_name: str,
    columns: str,
    chapter_id: str,
    order_columns: tuple
) -> list[dict]:
    # Todas las filas de un capítulo en pocas consultas, sin importar
    # cuántos comentarios o reacciones tenga.
    rows = []
    offset = 0

    while True:
        query = (
            supabase_admin
            .table(table_name)
            .select(columns)
            .eq("chapter_id", chapter_id)
        )
        for column in order_columns:
            query = query.order(column)

        page = (
            query
            .range(offset, offset + CHAPTER_COMMENT_PAGE_SIZE - 1)
            .execute()
        ).data or []
        rows.extend(page)

        if len(page) < CHAPTER_COMMENT_PAGE_SIZE:
            break
        offset += CHAPTER_COMMENT_PAGE_SIZE

    return rows


def get_chapter_comment_usernames(user_ids: list[str]) -> dict:
    unique_ids = list(dict.fromkeys(user_ids))
    usernames = {}

    for start in range(0, len(unique_ids), CHAPTER_COMMENT_ID_CHUNK):
        response = (
            supabase_admin
            .table("users")
            .select("id, username")
            .in_("id", unique_ids[start:start + CHAPTER_COMMENT_ID_CHUNK])
            .execute()
        )
        for user in response.data or []:
            usernames[str(user["id"])] = user.get("username")

    return usernames


def summarize_chapter_comment_reactions(
    reaction_rows: list[dict],
    viewer_id: str | None
) -> tuple[dict, dict]:
    counts_by_comment = {}
    viewer_reactions = {}

    for row in reaction_rows:
        reaction = row.get("reaction")
        if reaction not in CHAPTER_COMMENT_REACTIONS:
            continue

        comment_id = str(row.get("comment_id"))
        counts = counts_by_comment.setdefault(comment_id, {})
        counts[reaction] = counts.get(reaction, 0) + 1

        if viewer_id and str(row.get("user_id")) == viewer_id:
            viewer_reactions[comment_id] = reaction

    return counts_by_comment, viewer_reactions


def serialize_chapter_comment(
    row: dict,
    usernames: dict,
    counts_by_comment: dict,
    viewer_reactions: dict,
    viewer_id: str | None,
    viewer_is_admin: bool
) -> dict:
    comment_id = str(row["id"])
    user_id = str(row.get("user_id"))
    is_own = bool(viewer_id) and user_id == viewer_id
    is_reply = bool(row.get("parent_id"))

    return {
        "id": comment_id,
        "parent_id": str(row["parent_id"]) if is_reply else None,
        "user_id": user_id,
        "username": usernames.get(user_id) or "Usuario",
        "content": row.get("content") or "",
        "created_at": row.get("created_at"),
        "edited_at": row.get("edited_at"),
        "paragraph_index": None if is_reply else row.get("paragraph_index"),
        "start_offset": None if is_reply else row.get("start_offset"),
        "end_offset": None if is_reply else row.get("end_offset"),
        "quote": None if is_reply else row.get("quote"),
        "is_orphaned": bool(row.get("is_orphaned")),
        "reactions": counts_by_comment.get(comment_id, {}),
        "my_reaction": viewer_reactions.get(comment_id),
        "is_own": is_own,
        "can_edit": is_own,
        "can_delete": is_own or viewer_is_admin
    }


def serialize_single_chapter_comment(row: dict, current_user) -> dict:
    return serialize_chapter_comment(
        row,
        get_chapter_comment_usernames([str(row.get("user_id"))]),
        {},
        {},
        str(current_user.id),
        False
    )


def get_chapter_comment_reaction_summary(comment_id: str, viewer_id: str) -> dict:
    response = (
        supabase_admin
        .table("chapter_comment_reactions")
        .select("comment_id, user_id, reaction")
        .eq("comment_id", comment_id)
        .execute()
    )
    counts_by_comment, viewer_reactions = summarize_chapter_comment_reactions(
        response.data or [], viewer_id
    )

    return {
        "comment_id": comment_id,
        "reactions": counts_by_comment.get(comment_id, {}),
        "my_reaction": viewer_reactions.get(comment_id)
    }


def reanchor_chapter_comments(chapter_id: str, content: str | None) -> None:
    # Tras editar un capítulo: cada comentario conserva su fragmento, se
    # mueve a la nueva posición del mismo texto o queda huérfano. Un
    # comentario huérfano no vuelve a anclarse automáticamente.
    rows = []
    offset = 0

    while True:
        page = (
            supabase_admin
            .table("chapter_comments")
            .select(
                "id, paragraph_index, start_offset, end_offset, "
                "quote, prefix, suffix"
            )
            .eq("chapter_id", chapter_id)
            .is_("parent_id", "null")
            .eq("is_orphaned", False)
            .order("id")
            .range(offset, offset + CHAPTER_COMMENT_PAGE_SIZE - 1)
            .execute()
        ).data or []
        rows.extend(page)

        if len(page) < CHAPTER_COMMENT_PAGE_SIZE:
            break
        offset += CHAPTER_COMMENT_PAGE_SIZE

    anchor_fields = (
        "paragraph_index", "start_offset", "end_offset", "prefix", "suffix"
    )
    orphaned_ids = []
    moved_ids_by_anchor = {}

    for row in rows:
        anchor = locate_anchor(content, row)

        if anchor is None:
            orphaned_ids.append(row["id"])
            continue

        new_values = tuple(anchor[field] for field in anchor_fields)
        old_values = (
            row.get("paragraph_index"),
            row.get("start_offset"),
            row.get("end_offset"),
            row.get("prefix") or "",
            row.get("suffix") or ""
        )
        if new_values != old_values:
            moved_ids_by_anchor.setdefault(new_values, []).append(row["id"])

    def update_comments(comment_ids: list, values: dict) -> None:
        for start in range(0, len(comment_ids), CHAPTER_COMMENT_ID_CHUNK):
            (
                supabase_admin
                .table("chapter_comments")
                .update(values)
                .in_("id", comment_ids[start:start + CHAPTER_COMMENT_ID_CHUNK])
                .execute()
            )

    if orphaned_ids:
        update_comments(orphaned_ids, {
            "is_orphaned": True,
            "orphaned_at": datetime.now(timezone.utc).isoformat()
        })

    # Los comentarios de un mismo fragmento se actualizan juntos.
    for new_values, comment_ids in moved_ids_by_anchor.items():
        update_comments(comment_ids, dict(zip(anchor_fields, new_values)))


@app.get("/chapters/{chapter_id}/comments")
def get_chapter_comments(
    chapter_id: str,
    request: Request,
    current_user=Depends(get_optional_current_user)
):
    limit_chapter_comment_requests(
        "read", request.client.host if request.client else "desconocido"
    )

    chapter = get_commentable_chapter(chapter_id)
    viewer_id = str(current_user.id) if current_user else None

    if not chapter["story_is_visible"]:
        # Historia en borrador: nadie puede comentar. Su autor recibe una
        # lista vacía; para el resto el capítulo no existe.
        if viewer_id != chapter["story_author_id"]:
            raise HTTPException(status_code=404, detail=CHAPTER_NOT_FOUND_DETAIL)
        return {
            "chapter_id": chapter["id"],
            "can_comment": False,
            "can_moderate": False,
            "comments": []
        }

    rows = fetch_chapter_comment_rows(
        "chapter_comments",
        CHAPTER_COMMENT_COLUMNS,
        chapter["id"],
        ("created_at", "id")
    )

    # Un comentario retirado por moderación oculta también sus respuestas.
    visible_parent_ids = {
        str(row["id"])
        for row in rows
        if row.get("status") == "visible" and not row.get("parent_id")
    }
    visible_rows = [
        row for row in rows
        if row.get("status") == "visible" and (
            not row.get("parent_id")
            or str(row["parent_id"]) in visible_parent_ids
        )
    ]

    viewer_is_admin = bool(viewer_id) and is_admin_user(viewer_id)
    comments = []

    if visible_rows:
        reaction_rows = fetch_chapter_comment_rows(
            "chapter_comment_reactions",
            "comment_id, user_id, reaction",
            chapter["id"],
            ("comment_id", "user_id")
        )
        counts_by_comment, viewer_reactions = (
            summarize_chapter_comment_reactions(reaction_rows, viewer_id)
        )
        usernames = get_chapter_comment_usernames(
            [str(row.get("user_id")) for row in visible_rows]
        )
        comments = [
            serialize_chapter_comment(
                row,
                usernames,
                counts_by_comment,
                viewer_reactions,
                viewer_id,
                viewer_is_admin
            )
            for row in visible_rows
        ]

    return {
        "chapter_id": chapter["id"],
        "can_comment": bool(viewer_id),
        "can_moderate": viewer_is_admin,
        "comments": comments
    }


@app.post("/chapters/{chapter_id}/comments")
def create_chapter_comment(
    chapter_id: str,
    comment: ChapterCommentCreate,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    limit_chapter_comment_requests("write", user_id)

    is_reply = comment.parent_id is not None
    chapter = get_visible_chapter(chapter_id, with_content=not is_reply)

    comment_data = {
        "chapter_id": chapter["id"],
        "user_id": user_id,
        "content": clean_chapter_comment_content(comment.content)
    }

    if is_reply:
        # Solo se responde a comentarios principales del mismo capítulo:
        # las respuestas no tienen respuestas propias.
        parent = get_visible_chapter_comment(comment.parent_id)

        if str(parent["chapter_id"]) != chapter["id"] or parent.get("parent_id"):
            raise HTTPException(
                status_code=404, detail=CHAPTER_COMMENT_NOT_FOUND_DETAIL
            )

        comment_data["parent_id"] = str(parent["id"])
    else:
        if (
            comment.paragraph_index is None
            or comment.start_offset is None
            or comment.end_offset is None
            or not (comment.quote or "").strip()
        ):
            raise HTTPException(
                status_code=400,
                detail="Selecciona el fragmento del texto que quieres comentar"
            )

        # El anclaje se construye con el texto guardado del capítulo, no
        # con lo que envía el navegador. Si no coinciden, el capítulo
        # cambió desde que el lector lo abrió.
        anchor = build_anchor(
            chapter.get("content"),
            comment.paragraph_index,
            comment.start_offset,
            comment.end_offset
        )

        if anchor is None or anchor["quote"] != comment.quote.strip():
            raise HTTPException(status_code=409, detail=CHAPTER_CHANGED_DETAIL)

        if len(anchor["quote"]) > CHAPTER_COMMENT_QUOTE_MAX_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    "El fragmento seleccionado no puede superar los "
                    f"{CHAPTER_COMMENT_QUOTE_MAX_LENGTH} caracteres"
                )
            )

        comment_data.update(anchor)

    response = (
        supabase_admin
        .table("chapter_comments")
        .insert(comment_data)
        .execute()
    )

    return {
        "message": "Comentario publicado correctamente",
        "comment": serialize_single_chapter_comment(response.data[0], current_user)
    }


@app.put("/chapter-comments/{comment_id}")
def update_chapter_comment(
    comment_id: str,
    comment: ChapterCommentUpdate,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    limit_chapter_comment_requests("write", user_id)

    existing = get_visible_chapter_comment(comment_id)

    # Solo su autor puede cambiar el texto de un comentario.
    if str(existing.get("user_id")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="No puedes editar comentarios de otros usuarios"
        )

    response = (
        supabase_admin
        .table("chapter_comments")
        .update({
            "content": clean_chapter_comment_content(comment.content),
            "edited_at": datetime.now(timezone.utc).isoformat()
        })
        .eq("id", existing["id"])
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404, detail=CHAPTER_COMMENT_NOT_FOUND_DETAIL
        )

    summary = get_chapter_comment_reaction_summary(str(existing["id"]), user_id)
    updated = serialize_single_chapter_comment(response.data[0], current_user)
    updated["reactions"] = summary["reactions"]
    updated["my_reaction"] = summary["my_reaction"]

    return {
        "message": "Comentario actualizado correctamente",
        "comment": updated
    }


@app.delete("/chapter-comments/{comment_id}")
def delete_chapter_comment(
    comment_id: str,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    limit_chapter_comment_requests("write", user_id)

    existing = get_visible_chapter_comment(comment_id)

    if str(existing.get("user_id")) == user_id:
        # El autor elimina su comentario junto con sus respuestas y reacciones.
        (
            supabase_admin
            .table("chapter_comments")
            .delete()
            .eq("id", existing["id"])
            .eq("user_id", user_id)
            .execute()
        )
    elif is_admin_user(user_id):
        # Moderación: el comentario deja de mostrarse, pero se conserva
        # el registro de quién lo retiró y cuándo.
        (
            supabase_admin
            .table("chapter_comments")
            .update({
                "status": "removed",
                "removed_at": datetime.now(timezone.utc).isoformat(),
                "removed_by": user_id
            })
            .eq("id", existing["id"])
            .execute()
        )
    else:
        raise HTTPException(
            status_code=403,
            detail="No puedes eliminar comentarios de otros usuarios"
        )

    return {"message": "Comentario eliminado correctamente"}


@app.post("/chapter-comments/{comment_id}/reactions")
def react_to_chapter_comment(
    comment_id: str,
    reaction: ChapterCommentReactionCreate,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    limit_chapter_comment_requests("reaction", user_id)

    comment = get_visible_chapter_comment(comment_id)

    # Una reacción por usuario y comentario: elegir otra reemplaza la anterior.
    (
        supabase_admin
        .table("chapter_comment_reactions")
        .upsert(
            {
                "comment_id": str(comment["id"]),
                "user_id": user_id,
                "chapter_id": str(comment["chapter_id"]),
                "reaction": reaction.value,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            on_conflict="comment_id,user_id"
        )
        .execute()
    )

    return get_chapter_comment_reaction_summary(str(comment["id"]), user_id)


@app.delete("/chapter-comments/{comment_id}/reactions/{reaction}")
def delete_chapter_comment_reaction(
    comment_id: str,
    reaction: str,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    limit_chapter_comment_requests("reaction", user_id)

    if reaction not in CHAPTER_COMMENT_REACTIONS:
        raise HTTPException(status_code=404, detail="Reacción no encontrada")

    comment = get_visible_chapter_comment(comment_id)

    (
        supabase_admin
        .table("chapter_comment_reactions")
        .delete()
        .eq("comment_id", str(comment["id"]))
        .eq("user_id", user_id)
        .eq("reaction", reaction)
        .execute()
    )

    return get_chapter_comment_reaction_summary(str(comment["id"]), user_id)


# ============================================================
# MENSAJES
# ============================================================

# Privados y avisos de autores a sus seguidores: ver messages.py.
from messages import router as messages_router  # noqa: E402

app.include_router(messages_router)


# ============================================================
# MODERACIÓN DE CONTENIDO
# ============================================================

# Reportes, retiro y restauración de publicaciones e imágenes: ver moderation.py.
import moderation  # noqa: E402

app.include_router(moderation.router)
