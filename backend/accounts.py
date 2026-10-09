# ============================================================
# ELIMINACIÓN DE CUENTAS (solo administración)
# ============================================================
#
# Cuando alguien pide que su cuenta sea eliminada, administración lo hace
# desde el panel de soporte. Eliminar una cuenta significa:
#
#   - Se borra lo que es de esa persona: sus historias y capítulos (con los
#     comentarios, votos y valoraciones que recibieron), sus listas,
#     favoritos, progreso de lectura, seguidores y seguidos, bloqueos,
#     mensajes, notificaciones, datos de perfil e imágenes.
#   - Se conserva lo que forma parte de conversaciones de otras personas:
#     sus temas y respuestas del foro y sus comentarios en historias ajenas.
#     Quedan firmados por un usuario eliminado, sin datos personales.
#   - La cuenta deja de existir como tal: se le quitan el correo, la
#     contraseña, el nombre y las imágenes, y no puede volver a iniciar
#     sesión. El correo queda libre para registrarse de nuevo.
#
# La fila de la cuenta no se borra, se vacía: así lo conservado sigue
# teniendo a quién apuntar y ningún borrado en cadena de la base de datos
# puede llevarse contenido de otras personas.
#
# No se puede deshacer.

import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()

DELETED_USERNAME_PREFIX = "eliminado_"
ACCOUNT_NOT_FOUND_DETAIL = "Cuenta no encontrada"
PROFILE_IMAGE_BUCKET = "story-covers"
ID_CHUNK = 100
# Un siglo: el acceso queda bloqueado de forma permanente.
PERMANENT_BAN = "876000h"


class AccountDeletion(BaseModel):
    confirm_username: str


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def db():
    return fribuk().supabase_admin


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    return fribuk().get_current_admin(credentials)


def is_deleted_username(username: str | None) -> bool:
    return (username or "").startswith(DELETED_USERNAME_PREFIX)


def get_account(user_id: str) -> dict:
    main = fribuk()
    normalized_id = main.normalize_uuid_or_404(user_id, ACCOUNT_NOT_FOUND_DETAIL)

    response = (
        db().table("users").select("*").eq("id", normalized_id).limit(1).execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail=ACCOUNT_NOT_FOUND_DETAIL)

    return response.data[0]


def ensure_can_be_deleted(account: dict, admin_user: dict) -> None:
    if is_deleted_username(account.get("username")):
        raise HTTPException(status_code=400, detail="Esta cuenta ya fue eliminada")

    if str(account["id"]) == str(admin_user.get("id")):
        raise HTTPException(
            status_code=400, detail="No puedes eliminar tu propia cuenta desde aquí"
        )

    if account.get("role") == "admin":
        raise HTTPException(
            status_code=400, detail="No se puede eliminar una cuenta de administración"
        )


def ids_of(table: str, column: str, value: str) -> list[str]:
    rows = db().table(table).select("id").eq(column, value).execute().data or []
    return [str(row["id"]) for row in rows]


def count_rows(table: str, column: str, value: str) -> int:
    return len(ids_of(table, column, value))


def delete_where(table: str, column: str, value: str) -> None:
    db().table(table).delete().eq(column, value).execute()


def delete_in(table: str, column: str, values: list[str]) -> None:
    for start in range(0, len(values), ID_CHUNK):
        (
            db().table(table).delete()
            .in_(column, values[start:start + ID_CHUNK])
            .execute()
        )


def delete_account_data(user_id: str) -> dict:
    # Devuelve qué se borró y qué pasos fallaron. Un paso que falla no
    # detiene los demás: la cuenta siempre termina sin acceso ni datos
    # personales, y lo que quedó pendiente se informa a administración.
    problems = []

    def step(label: str, action) -> None:
        try:
            action()
        except Exception as error:
            print(f"Eliminación de cuenta: falló «{label}»:", repr(error))
            problems.append(label)

    story_ids = []
    list_ids = []
    conversation_ids = []

    def find_owned() -> None:
        story_ids.extend(ids_of("stories", "author_id", user_id))
        list_ids.extend(ids_of("reading_lists", "user_id", user_id))
        for column in ("user_low", "user_high"):
            conversation_ids.extend(ids_of("private_conversations", column, user_id))

    step("buscar el contenido de la cuenta", find_owned)

    # 1. Sus historias, con todo lo que cuelga de ellas.
    for table in (
        "story_tags", "reading_list_stories", "reading_progress", "notifications",
        "comments", "votes", "ratings", "favorites", "chapters"
    ):
        step(
            f"historias: {table}",
            lambda table=table: delete_in(table, "story_id", story_ids)
        )
    step("historias", lambda: delete_in("stories", "id", story_ids))

    # 2. Sus listas de lectura y sus conversaciones privadas.
    step("listas: historias", lambda: delete_in("reading_list_stories", "list_id", list_ids))
    step("listas de lectura", lambda: delete_in("reading_lists", "id", list_ids))
    step(
        "mensajes privados",
        lambda: delete_in("private_messages", "conversation_id", conversation_ids)
    )
    step(
        "conversaciones privadas",
        lambda: delete_in("private_conversations", "id", conversation_ids)
    )

    # 3. Su actividad y sus datos de perfil.
    for table, column in (
        ("votes", "user_id"),
        ("ratings", "user_id"),
        ("favorites", "user_id"),
        ("reading_progress", "user_id"),
        ("forum_interactions", "user_id"),
        ("chapter_comment_reactions", "user_id"),
        ("author_post_replies", "user_id"),
        ("author_channel_reads", "user_id"),
        ("author_channel_reads", "author_id"),
        ("author_posts", "author_id"),
        ("user_follows", "follower_id"),
        ("user_follows", "following_id"),
        ("user_blocks", "blocker_id"),
        ("user_blocks", "blocked_id"),
        ("notifications", "recipient_user_id"),
        ("notifications", "actor_user_id"),
        ("message_settings", "user_id"),
        ("profile_customizations", "user_id"),
        ("user_profiles", "user_id"),
        ("terms_acceptances", "user_id")
    ):
        step(
            f"{table} ({column})",
            lambda table=table, column=column: delete_where(table, column, user_id)
        )

    # 4. Sus imágenes: foto, banner y portadas.
    def remove_images() -> None:
        storage = db().storage.from_(PROFILE_IMAGE_BUCKET)
        paths = [f"avatars/{user_id}/avatar", f"banners/{user_id}/banner"]
        # Las portadas se guardan en una carpeta con el id de la cuenta.
        for item in storage.list(user_id) or []:
            if item.get("name"):
                paths.append(f"{user_id}/{item['name']}")
        storage.remove(paths)

    step("imágenes", remove_images)

    return {"stories": len(story_ids), "problems": problems}


def placeholder_email() -> str:
    # Dirección que no existe: reemplaza al correo real de la cuenta.
    return f"cuenta-eliminada-{secrets.token_hex(8)}@eliminado.fribuk.com"


def close_access(user_id: str) -> None:
    # Quita el correo, la contraseña y las imágenes del perfil, y bloquea el
    # inicio de sesión. El correo real queda libre para registrarse otra vez.
    db().auth.admin.update_user_by_id(user_id, {
        "email": placeholder_email(),
        "email_confirm": True,
        "password": secrets.token_urlsafe(32),
        "user_metadata": {},
        "ban_duration": PERMANENT_BAN
    })


def rename_account(account: dict) -> str:
    # Devuelve el nombre con el que queda firmado lo que se conserva.
    deleted_username = f"{DELETED_USERNAME_PREFIX}{secrets.token_hex(4)}"
    values = {"username": deleted_username}

    if account.get("email"):
        values["email"] = placeholder_email()

    db().table("users").update(values).eq("id", str(account["id"])).execute()

    return deleted_username


@router.get("/admin/accounts/{user_id}")
def get_account_summary(user_id: str, admin_user=Depends(get_current_admin)):
    # Lo que administración ve antes de confirmar el borrado.
    account = get_account(user_id)
    normalized_id = str(account["id"])

    return {
        "id": normalized_id,
        "username": account.get("username"),
        "role": account.get("role"),
        "is_deleted": is_deleted_username(account.get("username")),
        "is_self": normalized_id == str(admin_user.get("id")),
        "stories": count_rows("stories", "author_id", normalized_id)
    }

@router.post("/admin/accounts/{user_id}/delete")
def delete_account(
    user_id: str,
    deletion: AccountDeletion,
    admin_user=Depends(get_current_admin)
):
    account = get_account(user_id)
    ensure_can_be_deleted(account, admin_user)

    # Escribir el nombre de la cuenta evita borrar la equivocada.
    confirmation = (deletion.confirm_username or "").strip().lstrip("@")
    if confirmation != (account.get("username") or ""):
        raise HTTPException(
            status_code=400,
            detail="El nombre de usuario escrito no coincide con el de la cuenta"
        )

    normalized_id = str(account["id"])

    # Primero se cierra el acceso: si esto falla, no se borra nada.
    try:
        close_access(normalized_id)
    except Exception as error:
        print("No se pudo cerrar la cuenta:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="No se pudo eliminar la cuenta. No se borró nada; intenta de nuevo."
        )

    result = delete_account_data(normalized_id)

    deleted_username = None
    try:
        deleted_username = rename_account(account)
    except Exception as error:
        print("Eliminación de cuenta: no se pudo cambiar el nombre:", repr(error))
        result["problems"].append("nombre de usuario")

    print(
        f"Cuenta {normalized_id} eliminada por {admin_user.get('id')}. "
        f"Pasos con problemas: {result['problems'] or 'ninguno'}"
    )

    return {
        "message": "Cuenta eliminada",
        "previous_username": account.get("username"),
        "deleted_username": deleted_username,
        "stories_deleted": result["stories"],
        "problems": result["problems"]
    }
