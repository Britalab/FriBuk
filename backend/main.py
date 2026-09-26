from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr
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

# Cliente administrativo.
# NUNCA debe exponerse al frontend.
supabase_admin: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)

# Cliente público.
# Utilizado para operaciones normales.
supabase_public: Client = create_client(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
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


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# MODELOS PYDANTIC
# ============================================================

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
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

class StoryUpdate(BaseModel):
    title: str
    description: str | None = None
    cover_url: str | None = None
    genre: str | None = None
    status: str = "draft"
    work_type: str = "original"
    original_work: str | None = None
    original_author: str | None = None
    
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

class RatingCreate(BaseModel):
    story_id: str    
    plot: int
    spelling: int

class FollowCreate(BaseModel):
    following_id: str

class SupportRequestCreate(BaseModel):
    category: str
    message: str | None = None
    story_title: str | None = None
    fribuk_url: str | None = None
    external_url: str | None = None
    reported_url: str | None = None
    
class SupportStatusUpdate(BaseModel):
    status: str
    
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
        .eq("status", "published")
        .execute()
    )

    stories = response.data
    author_ids = list({story["author_id"] for story in stories if story.get("author_id")})
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
            str(user["id"]): user["username"]
            for user in users_response.data
        }

    for story in stories:
        story["author_username"] = usernames_by_id.get(
            str(story.get("author_id")),
            "Autor desconocido"
        )

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
        raise HTTPException(status_code=400, detail=str(e))


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

        return story

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
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
        "avatar_url": metadata.get("avatar_url")
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


@app.get("/users/{user_id}/public-profile")
def get_public_profile(user_id: str):
    auth_user = get_public_auth_user(user_id)
    return {"user": get_public_profile_data(auth_user)}


@app.get("/users/{user_id}/stories")
def get_public_user_stories(user_id: str):
    auth_user = get_public_auth_user(user_id)

    try:
        response = (
            supabase_admin
            .table("stories")
            .select("*")
            .eq("author_id", str(auth_user.id))
            .eq("status", "published")
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
            if not isinstance(story, dict) or story.get("status") != "published":
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

@app.post("/users")
def create_user(user: UserCreate):

    try:

        response = supabase_public.auth.sign_up({
            "email": user.email,
            "password": user.password,
            "options": {
                "data": {
                    "username": user.username
                }
            }
        })

        if not response.user:
            raise HTTPException(
                status_code=400,
                detail="No se pudo crear el usuario"
            )

        return {
            "message": "Usuario registrado correctamente",
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "username": user.username
            }
        }

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


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

        return {
            "message": "Inicio de sesión correcto",
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "username": (response.user.user_metadata or {}).get("username"),
                "avatar_url": (response.user.user_metadata or {}).get("avatar_url")
            },
            "access_token": response.session.access_token,
            "token_type": "bearer"
        }

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Correo o contraseña incorrectos"
        )

@app.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "message": "Usuario autenticado correctamente",
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "username": (current_user.user_metadata or {}).get("username"),
            "avatar_url": (current_user.user_metadata or {}).get("avatar_url")
        }
    }


@app.post("/me/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    try:
        allowed_types = {"image/jpeg", "image/png"}
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail="Solo se permiten imágenes JPG, JPEG o PNG"
            )

        file_bytes = file.file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
        if len(file_bytes) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="La imagen no puede superar los 5 MB"
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
        raise HTTPException(status_code=400, detail=str(e))


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
        response = supabase_admin.table("stories").insert(story_data).execute()

        created_story = response.data[0]
        story_id = created_story["id"]

        # 3. Guardar las etiquetas
        for tag in story.tags:
            tag_name = tag.strip()

            if not tag_name:
                continue

            # Buscar si la etiqueta ya existe
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
                # Crear la etiqueta si no existe
                new_tag_response = (
                    supabase_admin
                    .table("tags")
                    .insert({"name": tag_name})
                    .execute()
                )

                tag_id = new_tag_response.data[0]["id"]

            # Relacionar la etiqueta con la historia
            supabase_admin.table("story_tags").insert({
                "story_id": story_id,
                "tag_id": tag_id
            }).execute()

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
            detail=str(e)
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

        # Validar tipo de archivo
        allowed_types = [
            "image/jpeg",
            "image/png"
        ]

        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail="Solo se permiten imágenes JPG, JPEG o PNG"
            )

        # Leer imagen
        file_bytes = file.file.read()

        # Limitar tamaño a 5 MB
        if len(file_bytes) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="La imagen no puede superar los 5 MB"
            )

        # Obtener extensión
        extension = file.filename.split(".")[-1].lower()

        # Nombre único
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
            detail=str(e)
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
            "status": story.status
        }

        # 5. Actualizar la historia
        response = (
            supabase_admin
            .table("stories")
            .update(story_data)
            .eq("id", story_id)
            .execute()
        )

        return {
            "message": "Historia actualizada correctamente",
            "story": response.data[0]
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
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
            detail=str(e)
        )
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

        # 3. Guardar el ticket
        response = (
            supabase_admin
            .table("support_requests")
            .insert(support_data)
            .execute()
        )

        created_request = response.data[0]

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
            detail=str(e)
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
            detail=str(e)
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
            detail=str(e)
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

        return {
            "message": "Estado actualizado correctamente",
            "support_request": response.data[0]
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
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

        # 3. Insert con el cliente admin
        response = supabase_admin.table("comments").insert(comment_data).execute()

        return {
            "message": "Comentario creado correctamente",
            "comment": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=str(e))
    
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

        return {
            "message": "Voto registrado correctamente",
            "vote": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=str(e))
    
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
            detail=str(e)
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

        if not story_response.data or story_response.data[0]["status"] != "published":
            raise HTTPException(status_code=404, detail="Historia no encontrada")

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

        return {
            "message": "Historia agregada a favoritos",
            "favorite": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=str(e))

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
            # Para historias publicadas,
            # los lectores solamente pueden ver capítulos publicados.
            response = (
                supabase_admin
                .table("chapters")
                .select("*")
                .eq("story_id", story_id)
                .eq("status", "published")
                .order("chapter_number")
                .execute()
            )

        return response.data

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
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

        response = supabase_admin.table("chapters").insert(chapter_data).execute()

        return {
            "message": "Capítulo creado correctamente",
            "chapter": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=400, detail=str(e))
    
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
            .select("story_id")
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

        # 6. Actualizar el capítulo
        response = (
            supabase_admin
            .table("chapters")
            .update(chapter_data)
            .eq("id", chapter_id)
            .execute()
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
            detail=str(e)
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

        for field_name, value in [
            ("plot", rating.plot),
            ("spelling", rating.spelling)
        ]:
            if not (1 <= value <= 5):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field_name} debe estar entre 1 y 5"
                )

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

        return {
            "message": "Calificación guardada correctamente",
            "rating": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    
# ============================================================
# SEGUIDORES
# ============================================================

@app.post("/follow")
def follow_user(
    follow: FollowCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        if str(current_user.id) == follow.following_id:
            raise HTTPException(status_code=400, detail="No podés seguirte a vos mismo")

        follow_data = {
            "follower_id": str(current_user.id),
            "following_id": follow.following_id
        }

        response = supabase_admin.table("user_follows").insert(follow_data).execute()

        return {
            "message": "Ahora seguís a este usuario",
            "follow": response.data[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/follow/{following_id}")
def unfollow_user(
    following_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    access_token = credentials.credentials

    try:
        response_user = supabase_public.auth.get_user(access_token)

        if not response_user.user:
            raise HTTPException(status_code=401, detail="Token inválido")

        current_user = response_user.user

        supabase_admin.table("user_follows") \
            .delete() \
            .eq("follower_id", str(current_user.id)) \
            .eq("following_id", following_id) \
            .execute()

        return {"message": "Dejaste de seguir a este usuario"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/users/{user_id}/followers")
def get_followers(user_id: str):
    response = (
        supabase_public
        .table("user_follows")
        .select("follower_id")
        .eq("following_id", user_id)
        .execute()
    )
    return {"user_id": user_id, "followers": response.data}


@app.get("/users/{user_id}/following")
def get_following(user_id: str):
    response = (
        supabase_public
        .table("user_follows")
        .select("following_id")
        .eq("follower_id", user_id)
        .execute()
    )
    return {"user_id": user_id, "following": response.data} 
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
            detail=str(e)
        )
