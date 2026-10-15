# ============================================================
# MENCIONES CON @
# ============================================================
#
# En un comentario de capítulo o en el foro se puede nombrar a alguien
# escribiendo @ y su nombre de usuario. La persona nombrada recibe una
# notificación. El comentario se guarda tal cual: la mención es solo texto.
#
# Las notificaciones reutilizan los tipos que ya existen ("story_comment" y
# "forum_reply") con data["mention"] = True, que es lo que cambia el mensaje.

import re

from fastapi import APIRouter, HTTPException

router = APIRouter()

# Los mismos caracteres que admite un nombre de usuario (ver USERNAME_PATTERN).
# El @ no puede venir pegado a otra palabra: así un correo no cuenta.
MENTION_PATTERN = re.compile(r"(?<![\w.@\-])@([\w.\-]{3,30})")
# Una persona no puede avisar a medio sitio con un solo comentario.
MAX_MENTIONS_PER_TEXT = 5
DELETED_USERNAME_PREFIX = "eliminado_"
USER_NOT_FOUND_DETAIL = "Usuario no encontrado"


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def username_candidates(name: str) -> list[str]:
    # "@ana." al final de una frase: el punto puede ser del nombre o de la
    # frase. Se prueba primero el nombre completo y luego sin la puntuación.
    trimmed = name.rstrip(".-")
    return [name] if trimmed == name or len(trimmed) < 3 else [name, trimmed]


def mentioned_names(text: str | None) -> list[str]:
    names = []
    for match in MENTION_PATTERN.finditer(text or ""):
        if match.group(1) not in names:
            names.append(match.group(1))
    return names[:MAX_MENTIONS_PER_TEXT]


def find_users(names: list[str]) -> dict:
    # Nombre escrito -> fila de la cuenta, solo para cuentas que existen.
    candidates = [
        candidate for name in names for candidate in username_candidates(name)
    ]
    if not candidates:
        return {}

    response = (
        fribuk().supabase_admin
        .table("users")
        .select("id, username")
        .in_("username", list(dict.fromkeys(candidates)))
        .execute()
    )
    by_username = {
        row["username"]: row for row in response.data or []
        if not (row.get("username") or "").startswith(DELETED_USERNAME_PREFIX)
    }

    found = {}
    for name in names:
        for candidate in username_candidates(name):
            if candidate in by_username:
                found[name] = by_username[candidate]
                break
    return found


def blocked_between(user_id: str, other_id: str) -> bool:
    # Si alguna de las dos personas bloqueó a la otra, no hay aviso.
    try:
        import messages
        i_blocked, blocked_me = messages.block_state(user_id, other_id)
        return i_blocked or blocked_me
    except Exception as error:
        print("No se pudo comprobar el bloqueo para una mención:", repr(error))
        return False


def notify_mentions(
    text: str | None,
    actor_user_id: str,
    notification_type: str,
    story_id: str | None = None,
    forum_topic_id: str | None = None,
    data: dict | None = None,
    skip_user_ids: tuple = ()
) -> None:
    main = fribuk()
    actor_user_id = str(actor_user_id)
    skipped = {str(user_id) for user_id in skip_user_ids if user_id}
    notified = set()

    for account in find_users(mentioned_names(text)).values():
        user_id = str(account["id"])

        # Nadie se avisa a sí mismo, ni dos veces por el mismo comentario.
        if user_id == actor_user_id or user_id in skipped or user_id in notified:
            continue
        if blocked_between(actor_user_id, user_id):
            continue

        notified.add(user_id)
        main.create_notification(
            user_id,
            notification_type,
            actor_user_id=actor_user_id,
            story_id=story_id,
            forum_topic_id=forum_topic_id,
            data={**(data or {}), "mention": True}
        )


def notify_chapter_comment_mentions(
    chapter_id: str,
    actor_user_id: str,
    content: str | None,
    comment_id: str | None = None
) -> None:
    main = fribuk()
    chapter_response = (
        main.supabase_admin
        .table("chapters")
        .select("id, story_id, title")
        .eq("id", chapter_id)
        .limit(1)
        .execute()
    )

    if not chapter_response.data:
        return

    chapter = chapter_response.data[0]
    story_response = (
        main.supabase_admin
        .table("stories")
        .select("id, author_id, title")
        .eq("id", str(chapter["story_id"]))
        .limit(1)
        .execute()
    )

    if not story_response.data:
        return

    story = story_response.data[0]
    notify_mentions(
        content,
        actor_user_id,
        "story_comment",
        story_id=str(story["id"]),
        data={
            "story_title": story.get("title"),
            "chapter_id": str(chapter["id"]),
            "chapter_title": chapter.get("title"),
            **({"comment_id": str(comment_id)} if comment_id else {})
        },
        # Quien escribe la historia ya recibe el aviso del comentario.
        skip_user_ids=(story.get("author_id"),)
    )


def notify_forum_mentions(topic_id: str, actor_user_id: str, content: str | None) -> None:
    main = fribuk()
    topic_response = (
        main.supabase_admin
        .table("forum_topics")
        .select("id, user_id, title")
        .eq("id", topic_id)
        .limit(1)
        .execute()
    )

    if not topic_response.data:
        return

    topic = topic_response.data[0]
    notify_mentions(
        content,
        actor_user_id,
        "forum_reply",
        forum_topic_id=str(topic["id"]),
        data={"topic_title": topic.get("title")},
        # Quien abrió el tema ya recibe el aviso de la respuesta.
        skip_user_ids=(topic.get("user_id"),)
    )


@router.get("/users/by-username/{username}")
def get_user_by_username(username: str):
    # Lleva de una mención (@nombre) al perfil público de esa persona.
    name = (username or "").strip().lstrip("@")

    if not re.fullmatch(r"[\w.\-]{3,30}", name):
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    account = find_users([name]).get(name)

    if not account:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    return {"id": str(account["id"]), "username": account["username"]}
