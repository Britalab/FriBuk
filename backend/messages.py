# Mensajes de FriBuk: privados 1 a 1 y avisos de autores a sus seguidores.
#
# Reglas que este módulo hace cumplir siempre en el backend:
#   - nadie se escribe a sí mismo ni lee conversaciones ajenas: una
#     conversación privada se identifica por la otra persona, nunca por un
#     id que se pueda adivinar;
#   - un bloqueo, en cualquier dirección, impide escribir;
#   - la privacidad del destinatario (todos / solo personas que sigue /
#     nadie) se comprueba en cada envío;
#   - a los avisos de un autor solo responde quien lo sigue en ese momento,
#     y un seguidor nunca le responde a otro seguidor.
#
# Los mensajes son solo texto. Las tablas están en sql/messages.sql.

import re
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

import admin_alerts

router = APIRouter()
security = HTTPBearer()

ALLOW_FROM_VALUES = ("everyone", "following", "nobody")

PRIVATE_MESSAGE_MAX_LENGTH = 2000
AUTHOR_POST_MAX_LENGTH = 2000
AUTHOR_REPLY_MAX_LENGTH = 1000
REPORT_REASON_MAX_LENGTH = 500

MESSAGE_PREVIEW_LENGTH = 120
PRIVATE_THREAD_LIMIT = 200
INBOX_LIMIT = 100
AUTHOR_CHANNEL_POST_LIMIT = 30
AUTHOR_INBOX_POST_LIMIT = 300
# Sin marca de lectura, solo cuentan como no leídos los avisos recientes.
UNREAD_LOOKBACK_DAYS = 7

REPORT_CATEGORY = "Reporte de mensaje privado"

# Límites en memoria por usuario: (acciones permitidas, ventana en segundos).
# Una acción debe caber en todas las ventanas de su grupo.
MESSAGE_RATE_LIMITS = {
    "private": ((20, 60), (200, 3600)),
    "new_conversation": ((15, 3600),),
    "author_post": ((5, 3600), (20, 86400)),
    "reply": ((10, 60), (100, 3600)),
    "report": ((5, 3600),)
}
MESSAGE_RATE_MAX_TRACKED_KEYS = 20000

message_requests: dict[tuple[str, int, str], deque] = {}
message_requests_lock = threading.Lock()


class PrivateMessageCreate(BaseModel):
    content: str


class MessageReportCreate(BaseModel):
    reason: str
    message_id: str | None = None


class MessageSettingsUpdate(BaseModel):
    allow_from: str


class AuthorPostCreate(BaseModel):
    content: str
    replies_open: bool = True


class AuthorPostUpdate(BaseModel):
    replies_open: bool


class AuthorReplyCreate(BaseModel):
    content: str
    reply_to_id: str | None = None


# ============================================================
# ACCESO AL RESTO DE FRIBUK
# ============================================================

def fribuk():
    # main.py importa este módulo, así que aquí se resuelve en cada llamada.
    import main
    return main


def db():
    return fribuk().supabase_admin


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    return fribuk().get_current_user(credentials)


def normalize_id(value: str, detail: str) -> str:
    return fribuk().normalize_uuid_or_404(value, detail)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_timestamp(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# ============================================================
# TEXTO Y ANTISPAM
# ============================================================

INVISIBLE_CHARACTERS = "\u200b\u200c\u200d\u2060\ufeff"


def clean_message_text(value: str | None, max_length: int, label: str) -> str:
    # Solo texto: se quitan los caracteres de control. El contenido se
    # guarda tal cual y el frontend lo muestra como texto, nunca como HTML.
    text = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(
        character for character in text
        if character in "\n\t" or (ord(character) >= 32 and ord(character) != 127)
    )
    text = re.sub(r"\n{4,}", "\n\n\n", text).strip()

    if not text.strip(INVISIBLE_CHARACTERS + " \n\t\u00a0"):
        raise HTTPException(
            status_code=400,
            detail=f"{label} no puede estar vacío"
        )
    if len(text) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"{label} no puede superar los {max_length} caracteres"
        )

    return text


def preview_text(content: str) -> str:
    flat = " ".join(content.split())
    if len(flat) <= MESSAGE_PREVIEW_LENGTH:
        return flat
    return flat[:MESSAGE_PREVIEW_LENGTH - 1].rstrip() + "…"


def limit_message_requests(*buckets: str, user_id: str) -> None:
    # Primero se comprueban todas las ventanas y solo después se anota la
    # acción, para que un intento rechazado no consuma cupo.
    now = time.monotonic()

    with message_requests_lock:
        if len(message_requests) > MESSAGE_RATE_MAX_TRACKED_KEYS:
            message_requests.clear()

        tracked = []
        for bucket in buckets:
            for limit, window in MESSAGE_RATE_LIMITS[bucket]:
                timestamps = message_requests.setdefault(
                    (bucket, window, user_id), deque()
                )
                while timestamps and now - timestamps[0] > window:
                    timestamps.popleft()
                if len(timestamps) >= limit:
                    raise HTTPException(
                        status_code=429,
                        detail=(
                            "Estás enviando demasiados mensajes. "
                            "Espera un momento e inténtalo nuevamente."
                        )
                    )
                tracked.append(timestamps)

        for timestamps in tracked:
            timestamps.append(now)


# ============================================================
# USUARIOS, BLOQUEOS, PRIVACIDAD Y SEGUIMIENTO
# ============================================================

def ensure_other_user(user_id: str, current_user_id: str, self_detail: str) -> str:
    target_id = normalize_id(user_id, "Usuario no encontrado")

    if target_id == current_user_id:
        raise HTTPException(status_code=400, detail=self_detail)

    response = (
        db()
        .table("users")
        .select("id")
        .eq("id", target_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return target_id


def user_cards(user_ids) -> dict[str, dict]:
    # Solo datos públicos: id, nombre de usuario y avatar.
    unique_ids = list(dict.fromkeys(str(user_id) for user_id in user_ids if user_id))
    cards = {}

    if unique_ids:
        try:
            for card in fribuk().get_follow_user_cards(unique_ids):
                cards[str(card["id"])] = {
                    "id": str(card["id"]),
                    "username": card.get("username") or "Usuario",
                    "avatar_url": card.get("avatar_url")
                }
        except Exception as error:
            print("No se pudieron cargar los usuarios de Mensajes:", repr(error))

    for user_id in unique_ids:
        cards.setdefault(
            user_id, {"id": user_id, "username": "Usuario", "avatar_url": None}
        )

    return cards


def block_state(user_id: str, other_id: str) -> tuple[bool, bool]:
    # (yo lo bloqueé, me bloqueó)
    response = (
        db()
        .table("user_blocks")
        .select("blocker_id, blocked_id")
        .in_("blocker_id", [user_id, other_id])
        .in_("blocked_id", [user_id, other_id])
        .execute()
    )
    pairs = {
        (str(row["blocker_id"]), str(row["blocked_id"]))
        for row in response.data or []
    }

    return (user_id, other_id) in pairs, (other_id, user_id) in pairs


def get_allow_from(user_id: str) -> str:
    response = (
        db()
        .table("message_settings")
        .select("allow_from")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    value = response.data[0].get("allow_from") if response.data else None

    return value if value in ALLOW_FROM_VALUES else "everyone"


def is_following(follower_id: str, following_id: str) -> bool:
    # Siempre el estado actual, nunca uno guardado.
    return fribuk().is_following_user(follower_id, following_id)


def private_send_block_reason(sender_id: str, recipient_id: str) -> str | None:
    # Motivo por el que sender no puede escribirle a recipient, o None.
    blocked_by_sender, sender_is_blocked = block_state(sender_id, recipient_id)

    if blocked_by_sender:
        return "Bloqueaste a esta persona. Desbloquéala para poder escribirle."

    # A quien fue bloqueado se le responde igual que si el destinatario no
    # recibiera mensajes: no se revela el bloqueo.
    allow_from = get_allow_from(recipient_id)
    if sender_is_blocked or allow_from == "nobody":
        return "Esta persona no recibe mensajes privados."
    if allow_from == "following" and not is_following(recipient_id, sender_id):
        return "Esta persona solo recibe mensajes de las personas que sigue."

    return None


# ============================================================
# PRIVADOS
# ============================================================

def conversation_pair(user_id: str, other_id: str) -> tuple[str, str]:
    low, high = sorted([user_id, other_id])
    return low, high


def find_conversation(user_id: str, other_id: str) -> dict | None:
    low, high = conversation_pair(user_id, other_id)
    response = (
        db()
        .table("private_conversations")
        .select("*")
        .eq("user_low", low)
        .eq("user_high", high)
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def my_conversations(user_id: str) -> list[dict]:
    rows = []
    for column in ("user_low", "user_high"):
        response = (
            db()
            .table("private_conversations")
            .select("*")
            .eq(column, user_id)
            .order("last_message_at", desc=True)
            .limit(INBOX_LIMIT)
            .execute()
        )
        rows.extend(response.data or [])

    rows.sort(key=lambda row: str(row.get("last_message_at")), reverse=True)
    return rows[:INBOX_LIMIT]


def other_participant(conversation: dict, user_id: str) -> str:
    low, high = str(conversation["user_low"]), str(conversation["user_high"])
    return high if low == user_id else low


def unread_private_counts(user_id: str, conversations: list[dict]) -> dict[str, int]:
    conversation_ids = [str(row["id"]) for row in conversations]
    if not conversation_ids:
        return {}

    response = (
        db()
        .table("private_messages")
        .select("conversation_id, sender_id")
        .in_("conversation_id", conversation_ids)
        .is_("read_at", "null")
        .execute()
    )
    counts: dict[str, int] = {}
    for row in response.data or []:
        if str(row["sender_id"]) != user_id:
            key = str(row["conversation_id"])
            counts[key] = counts.get(key, 0) + 1

    return counts


def serialize_private_message(row: dict, user_id: str) -> dict:
    return {
        "id": str(row["id"]),
        "sender_id": str(row["sender_id"]),
        "is_mine": str(row["sender_id"]) == user_id,
        "content": row["content"],
        "created_at": row.get("created_at"),
        "read_at": row.get("read_at")
    }


@router.get("/messages/conversations")
def list_private_conversations(current_user=Depends(get_current_user)):
    user_id = str(current_user.id)

    try:
        conversations = my_conversations(user_id)
        unread = unread_private_counts(user_id, conversations)
        others = [other_participant(row, user_id) for row in conversations]
        cards = user_cards(others)

        blocked_response = (
            db()
            .table("user_blocks")
            .select("blocked_id")
            .eq("blocker_id", user_id)
            .execute()
        )
        blocked_ids = {str(row["blocked_id"]) for row in blocked_response.data or []}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar tus mensajes"
        ) from error

    return {
        "conversations": [
            {
                "user": cards[other_id],
                "last_message_preview": row.get("last_message_preview") or "",
                "last_message_is_mine": str(row.get("last_sender_id")) == user_id,
                "last_message_at": row.get("last_message_at"),
                "unread_count": unread.get(str(row["id"]), 0),
                "blocked_by_me": other_id in blocked_ids
            }
            for row, other_id in zip(conversations, others)
        ]
    }


@router.get("/messages/private/{other_user_id}")
def get_private_thread(other_user_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    other_id = ensure_other_user(
        other_user_id, user_id, "No puedes enviarte mensajes a ti mismo"
    )

    try:
        conversation = find_conversation(user_id, other_id)
        messages = []

        if conversation:
            response = (
                db()
                .table("private_messages")
                .select("*")
                .eq("conversation_id", str(conversation["id"]))
                .order("created_at", desc=True)
                .limit(PRIVATE_THREAD_LIMIT)
                .execute()
            )
            messages = list(reversed(response.data or []))

        blocked_by_me, _blocked_me = block_state(user_id, other_id)
        cannot_send_reason = private_send_block_reason(user_id, other_id)
        # Aviso para quien escribe: su propia privacidad impediría la respuesta.
        my_allow_from = get_allow_from(user_id)
        replies_blocked = my_allow_from == "nobody" or (
            my_allow_from == "following" and not is_following(user_id, other_id)
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudo cargar la conversación"
        ) from error

    return {
        "user": user_cards([other_id])[other_id],
        "has_conversation": bool(conversation),
        "messages": [serialize_private_message(row, user_id) for row in messages],
        "can_send": cannot_send_reason is None,
        "cannot_send_reason": cannot_send_reason,
        "blocked_by_me": blocked_by_me,
        "replies_blocked_by_my_privacy": replies_blocked and not blocked_by_me
    }


@router.post("/messages/private/{other_user_id}")
def send_private_message(
    other_user_id: str,
    message: PrivateMessageCreate,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    other_id = ensure_other_user(
        other_user_id, user_id, "No puedes enviarte mensajes a ti mismo"
    )
    content = clean_message_text(
        message.content, PRIVATE_MESSAGE_MAX_LENGTH, "El mensaje"
    )

    try:
        reason = private_send_block_reason(user_id, other_id)
        if reason:
            raise HTTPException(status_code=403, detail=reason)

        conversation = find_conversation(user_id, other_id)
        if conversation:
            limit_message_requests("private", user_id=user_id)
        else:
            limit_message_requests("private", "new_conversation", user_id=user_id)

        timestamp = now_iso()

        if not conversation:
            low, high = conversation_pair(user_id, other_id)
            try:
                created = (
                    db()
                    .table("private_conversations")
                    .insert({
                        "id": str(uuid.uuid4()),
                        "user_low": low,
                        "user_high": high,
                        "created_at": timestamp,
                        "last_message_at": timestamp
                    })
                    .execute()
                )
                conversation = created.data[0]
            except Exception:
                # Dos primeros mensajes a la vez: la conversación ya existe.
                conversation = find_conversation(user_id, other_id)
                if not conversation:
                    raise

        created_message = (
            db()
            .table("private_messages")
            .insert({
                "id": str(uuid.uuid4()),
                "conversation_id": str(conversation["id"]),
                "sender_id": user_id,
                "content": content,
                "created_at": timestamp,
                "read_at": None
            })
            .execute()
        ).data[0]

        (
            db()
            .table("private_conversations")
            .update({
                "last_message_at": timestamp,
                "last_message_preview": preview_text(content),
                "last_sender_id": user_id
            })
            .eq("id", str(conversation["id"]))
            .execute()
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": serialize_private_message(created_message, user_id)}


@router.delete("/messages/private/{other_user_id}/{message_id}")
def delete_private_message(
    other_user_id: str, message_id: str, current_user=Depends(get_current_user)
):
    # Cada quien borra solo lo que escribió; desaparece para las dos personas.
    user_id = str(current_user.id)
    other_id = normalize_id(other_user_id, "Usuario no encontrado")
    normalized_message_id = normalize_id(message_id, "Mensaje no encontrado")

    try:
        conversation = find_conversation(user_id, other_id) if other_id != user_id else None
        deleted = []
        if conversation:
            deleted = (
                db()
                .table("private_messages")
                .delete()
                .eq("id", normalized_message_id)
                .eq("conversation_id", str(conversation["id"]))
                .eq("sender_id", user_id)
                .execute()
            ).data or []

        # Un mensaje ajeno o de otra conversación responde igual que uno inexistente.
        if not deleted:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")

        # La bandeja muestra el último mensaje que queda.
        latest = (
            db()
            .table("private_messages")
            .select("content, sender_id, created_at")
            .eq("conversation_id", str(conversation["id"]))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        (
            db()
            .table("private_conversations")
            .update({
                "last_message_preview": (
                    preview_text(latest[0]["content"]) if latest else None
                ),
                "last_sender_id": str(latest[0]["sender_id"]) if latest else None,
                "last_message_at": (
                    latest[0]["created_at"] if latest
                    else conversation.get("last_message_at")
                )
            })
            .eq("id", str(conversation["id"]))
            .execute()
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Mensaje eliminado"}


@router.post("/messages/private/{other_user_id}/read")
def mark_private_thread_read(
    other_user_id: str, current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    other_id = ensure_other_user(
        other_user_id, user_id, "No puedes enviarte mensajes a ti mismo"
    )

    try:
        conversation = find_conversation(user_id, other_id)
        if not conversation:
            return {"read": 0}

        # Solo los mensajes que me enviaron: los míos los marca la otra persona.
        response = (
            db()
            .table("private_messages")
            .update({"read_at": now_iso()})
            .eq("conversation_id", str(conversation["id"]))
            .eq("sender_id", other_id)
            .is_("read_at", "null")
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"read": len(response.data or [])}


@router.post("/messages/private/{other_user_id}/report")
def report_private_conversation(
    other_user_id: str,
    report: MessageReportCreate,
    current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    other_id = ensure_other_user(
        other_user_id, user_id, "No puedes reportarte a ti mismo"
    )
    reason = clean_message_text(
        report.reason, REPORT_REASON_MAX_LENGTH, "El motivo del reporte"
    )

    try:
        conversation = find_conversation(user_id, other_id)
        if not conversation:
            raise HTTPException(
                status_code=404, detail="No hay una conversación que reportar"
            )

        reported_message = None
        if report.message_id:
            message_id = normalize_id(report.message_id, "Mensaje no encontrado")
            response = (
                db()
                .table("private_messages")
                .select("id, content, sender_id, conversation_id")
                .eq("id", message_id)
                .eq("conversation_id", str(conversation["id"]))
                .eq("sender_id", other_id)
                .limit(1)
                .execute()
            )
            # Un mensaje de otra conversación responde igual que uno inexistente.
            if not response.data:
                raise HTTPException(status_code=404, detail="Mensaje no encontrado")
            reported_message = response.data[0]

        limit_message_requests("report", user_id=user_id)

        # Se reutiliza el sistema de soporte: el reporte llega al mismo panel
        # de administración que el resto de las solicitudes.
        username = user_cards([other_id])[other_id]["username"]
        details = [
            f"Motivo: {reason}",
            f"Usuario reportado: @{username} ({other_id})",
            f"Conversación: {conversation['id']}"
        ]
        if reported_message:
            details.append(
                f"Mensaje: {reported_message['id']} — "
                f"«{preview_text(reported_message['content'])}»"
            )

        (
            db()
            .table("support_requests")
            .insert({
                "user_id": user_id,
                "category": REPORT_CATEGORY,
                "message": "\n".join(details)[:1000],
                "story_title": None,
                "fribuk_url": None,
                "external_url": None,
                "reported_url": None,
                "status": "pending"
            })
            .execute()
        )
        # Aviso por correo a la administración.
        admin_alerts.alert_support_request(REPORT_CATEGORY, " · ".join(details))
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Reporte enviado. El equipo de FriBuk lo revisará."}


# ============================================================
# BLOQUEOS
# ============================================================

@router.get("/me/blocks")
def list_my_blocks(current_user=Depends(get_current_user)):
    user_id = str(current_user.id)

    try:
        response = (
            db()
            .table("user_blocks")
            .select("blocked_id, created_at")
            .eq("blocker_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        blocked_ids = [str(row["blocked_id"]) for row in response.data or []]
        cards = user_cards(blocked_ids)
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar tus bloqueos"
        ) from error

    return {"blocked": [cards[blocked_id] for blocked_id in blocked_ids]}


@router.post("/users/{other_user_id}/block")
def block_user(other_user_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    other_id = ensure_other_user(
        other_user_id, user_id, "No puedes bloquearte a ti mismo"
    )

    try:
        (
            db()
            .table("user_blocks")
            .upsert(
                {
                    "blocker_id": user_id,
                    "blocked_id": other_id,
                    "created_at": now_iso()
                },
                on_conflict="blocker_id,blocked_id"
            )
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Usuario bloqueado", "blocked": True}


@router.delete("/users/{other_user_id}/block")
def unblock_user(other_user_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    other_id = normalize_id(other_user_id, "Usuario no encontrado")

    try:
        (
            db()
            .table("user_blocks")
            .delete()
            .eq("blocker_id", user_id)
            .eq("blocked_id", other_id)
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Usuario desbloqueado", "blocked": False}


# ============================================================
# PRIVACIDAD
# ============================================================

@router.get("/me/message-settings")
def get_my_message_settings(current_user=Depends(get_current_user)):
    try:
        allow_from = get_allow_from(str(current_user.id))
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="No se pudo cargar tu privacidad de mensajes"
        ) from error

    return {"allow_from": allow_from}


@router.put("/me/message-settings")
def update_my_message_settings(
    settings: MessageSettingsUpdate, current_user=Depends(get_current_user)
):
    if settings.allow_from not in ALLOW_FROM_VALUES:
        raise HTTPException(status_code=400, detail="Opción de privacidad no válida")

    try:
        (
            db()
            .table("message_settings")
            .upsert(
                {
                    "user_id": str(current_user.id),
                    "allow_from": settings.allow_from,
                    "updated_at": now_iso()
                },
                on_conflict="user_id"
            )
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Privacidad actualizada", "allow_from": settings.allow_from}


# ============================================================
# AVISOS DE AUTORES A SUS SEGUIDORES
# ============================================================

def followed_author_ids(user_id: str) -> list[str]:
    response = (
        db()
        .table("user_follows")
        .select("following_id")
        .eq("follower_id", user_id)
        .execute()
    )
    return [str(row["following_id"]) for row in response.data or []]


def channel_read_marks(user_id: str) -> dict[str, datetime]:
    response = (
        db()
        .table("author_channel_reads")
        .select("author_id, last_read_at")
        .eq("user_id", user_id)
        .execute()
    )
    marks = {}
    for row in response.data or []:
        parsed = parse_timestamp(row.get("last_read_at"))
        if parsed:
            marks[str(row["author_id"])] = parsed
    return marks


def is_unread(created_at, mark: datetime | None) -> bool:
    created = parse_timestamp(created_at)
    if not created:
        return False
    if mark is None:
        mark = datetime.now(timezone.utc) - timedelta(days=UNREAD_LOOKBACK_DAYS)
    return created > mark


def own_channel_summary(user_id: str, mark: datetime | None) -> dict:
    posts = (
        db()
        .table("author_posts")
        .select("id, content, created_at")
        .eq("author_id", user_id)
        .order("created_at", desc=True)
        .limit(AUTHOR_CHANNEL_POST_LIMIT)
        .execute()
    ).data or []

    unread = 0
    if posts:
        replies = (
            db()
            .table("author_post_replies")
            .select("user_id, created_at")
            .in_("post_id", [str(post["id"]) for post in posts])
            .execute()
        ).data or []
        unread = sum(
            1 for reply in replies
            if str(reply["user_id"]) != user_id
            and is_unread(reply.get("created_at"), mark)
        )

    return {
        "post_count": len(posts),
        "last_post_preview": preview_text(posts[0]["content"]) if posts else "",
        "last_post_at": posts[0].get("created_at") if posts else None,
        "unread_count": unread
    }


def author_channels(user_id: str) -> dict:
    marks = channel_read_marks(user_id)
    author_ids = [
        author_id for author_id in followed_author_ids(user_id)
        if author_id != user_id
    ]
    channels = []

    if author_ids:
        posts = (
            db()
            .table("author_posts")
            .select("author_id, content, created_at")
            .in_("author_id", author_ids)
            .order("created_at", desc=True)
            .limit(AUTHOR_INBOX_POST_LIMIT)
            .execute()
        ).data or []

        by_author: dict[str, dict] = {}
        for post in posts:
            author_id = str(post["author_id"])
            entry = by_author.setdefault(author_id, {
                "author_id": author_id,
                "last_post_preview": preview_text(post["content"]),
                "last_post_at": post.get("created_at"),
                "unread_count": 0
            })
            if is_unread(post.get("created_at"), marks.get(author_id)):
                entry["unread_count"] += 1

        cards = user_cards(by_author)
        channels = [
            {
                "author": cards[author_id],
                "last_post_preview": entry["last_post_preview"],
                "last_post_at": entry["last_post_at"],
                "unread_count": entry["unread_count"]
            }
            for author_id, entry in by_author.items()
        ]
        channels.sort(key=lambda item: str(item["last_post_at"]), reverse=True)

    return {
        "channels": channels,
        "own": own_channel_summary(user_id, marks.get(user_id))
    }


@router.get("/messages/authors")
def list_author_channels(current_user=Depends(get_current_user)):
    try:
        return author_channels(str(current_user.id))
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar los mensajes de autores"
        ) from error


@router.get("/messages/summary")
def get_messages_summary(current_user=Depends(get_current_user)):
    # Contadores para la barra de navegación. Si fallan, se muestran en cero.
    user_id = str(current_user.id)

    try:
        private_unread = sum(
            unread_private_counts(user_id, my_conversations(user_id)).values()
        )
        channels = author_channels(user_id)
        authors_unread = (
            sum(channel["unread_count"] for channel in channels["channels"])
            + channels["own"]["unread_count"]
        )
    except Exception as error:
        print("No se pudo calcular el resumen de Mensajes:", repr(error))
        return {"private_unread": 0, "authors_unread": 0, "total_unread": 0}

    return {
        "private_unread": private_unread,
        "authors_unread": authors_unread,
        "total_unread": private_unread + authors_unread
    }


def ensure_channel_access(author_user_id: str, user_id: str) -> tuple[str, bool]:
    # Los avisos de un autor los lee él mismo y quien lo sigue ahora.
    author_id = normalize_id(author_user_id, "Autor no encontrado")

    if author_id == user_id:
        return author_id, True

    response = (
        db()
        .table("users")
        .select("id")
        .eq("id", author_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Autor no encontrado")

    if not is_following(user_id, author_id):
        raise HTTPException(
            status_code=403,
            detail="Sigue a este autor para ver los mensajes que envía a sus seguidores."
        )

    return author_id, False


@router.get("/messages/authors/{author_user_id}")
def get_author_channel(author_user_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    author_id, is_own = ensure_channel_access(author_user_id, user_id)

    try:
        posts = (
            db()
            .table("author_posts")
            .select("*")
            .eq("author_id", author_id)
            .order("created_at", desc=True)
            .limit(AUTHOR_CHANNEL_POST_LIMIT)
            .execute()
        ).data or []

        replies = []
        if posts:
            replies = (
                db()
                .table("author_post_replies")
                .select("*")
                .in_("post_id", [str(post["id"]) for post in posts])
                .order("created_at")
                .execute()
            ).data or []

        cards = user_cards([author_id] + [reply["user_id"] for reply in replies])

        can_reply = is_own
        if not is_own:
            blocked_by_me, blocked_me = block_state(user_id, author_id)
            can_reply = not blocked_by_me and not blocked_me
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar los mensajes del autor"
        ) from error

    replies_by_post: dict[str, list[dict]] = {}
    for reply in replies:
        replies_by_post.setdefault(str(reply["post_id"]), []).append({
            "id": str(reply["id"]),
            "user": cards[str(reply["user_id"])],
            "is_author": str(reply["user_id"]) == author_id,
            "is_mine": str(reply["user_id"]) == user_id,
            "reply_to_id": str(reply["reply_to_id"]) if reply.get("reply_to_id") else None,
            "content": reply["content"],
            "created_at": reply.get("created_at")
        })

    return {
        "author": cards[author_id],
        "is_own": is_own,
        "can_reply": can_reply,
        "posts": [
            {
                "id": str(post["id"]),
                "content": post["content"],
                "created_at": post.get("created_at"),
                "replies_open": bool(post.get("replies_open", True)),
                "replies": replies_by_post.get(str(post["id"]), [])
            }
            for post in posts
        ]
    }


@router.post("/messages/authors/{author_user_id}/read")
def mark_author_channel_read(
    author_user_id: str, current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    author_id, _is_own = ensure_channel_access(author_user_id, user_id)

    try:
        (
            db()
            .table("author_channel_reads")
            .upsert(
                {
                    "user_id": user_id,
                    "author_id": author_id,
                    "last_read_at": now_iso()
                },
                on_conflict="user_id,author_id"
            )
            .execute()
        )
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"read": True}


def serialize_author_post(post: dict) -> dict:
    return {
        "id": str(post["id"]),
        "content": post["content"],
        "created_at": post.get("created_at"),
        "replies_open": bool(post.get("replies_open", True)),
        "replies": []
    }


@router.post("/messages/author-posts")
def create_author_post(post: AuthorPostCreate, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    content = clean_message_text(post.content, AUTHOR_POST_MAX_LENGTH, "El mensaje")
    limit_message_requests("author_post", user_id=user_id)

    try:
        created = (
            db()
            .table("author_posts")
            .insert({
                "id": str(uuid.uuid4()),
                "author_id": user_id,
                "content": content,
                "replies_open": bool(post.replies_open),
                "created_at": now_iso()
            })
            .execute()
        ).data[0]
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"post": serialize_author_post(created)}


def get_own_author_post(post_id: str, user_id: str) -> dict:
    normalized_id = normalize_id(post_id, "Mensaje no encontrado")
    response = (
        db()
        .table("author_posts")
        .select("*")
        .eq("id", normalized_id)
        .eq("author_id", user_id)
        .limit(1)
        .execute()
    )
    # El mensaje de otro autor responde igual que uno inexistente.
    if not response.data:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")

    return response.data[0]


@router.patch("/messages/author-posts/{post_id}")
def update_author_post(
    post_id: str, changes: AuthorPostUpdate, current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)

    try:
        post = get_own_author_post(post_id, user_id)
        (
            db()
            .table("author_posts")
            .update({"replies_open": bool(changes.replies_open)})
            .eq("id", str(post["id"]))
            .eq("author_id", user_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"id": str(post["id"]), "replies_open": bool(changes.replies_open)}


@router.delete("/messages/author-posts/{post_id}")
def delete_author_post(post_id: str, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)

    try:
        post = get_own_author_post(post_id, user_id)
        (
            db()
            .table("author_post_replies")
            .delete()
            .eq("post_id", str(post["id"]))
            .execute()
        )
        (
            db()
            .table("author_posts")
            .delete()
            .eq("id", str(post["id"]))
            .eq("author_id", user_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Mensaje eliminado"}


@router.delete("/messages/author-replies/{reply_id}")
def delete_author_reply(reply_id: str, current_user=Depends(get_current_user)):
    # Borra una respuesta quien la escribió o el autor del mensaje, que así
    # puede ordenar su propio hilo.
    user_id = str(current_user.id)
    normalized_reply_id = normalize_id(reply_id, "Respuesta no encontrada")

    try:
        reply_response = (
            db()
            .table("author_post_replies")
            .select("id, user_id, post_id")
            .eq("id", normalized_reply_id)
            .limit(1)
            .execute()
        )
        reply = reply_response.data[0] if reply_response.data else None

        allowed = bool(reply) and str(reply["user_id"]) == user_id
        if reply and not allowed:
            post_response = (
                db()
                .table("author_posts")
                .select("author_id")
                .eq("id", str(reply["post_id"]))
                .limit(1)
                .execute()
            )
            allowed = bool(post_response.data) and (
                str(post_response.data[0]["author_id"]) == user_id
            )

        # Una respuesta que no se puede borrar responde igual que una inexistente.
        if not allowed:
            raise HTTPException(status_code=404, detail="Respuesta no encontrada")

        (
            db()
            .table("author_post_replies")
            .delete()
            .eq("id", normalized_reply_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {"message": "Respuesta eliminada"}


@router.post("/messages/author-posts/{post_id}/replies")
def reply_to_author_post(
    post_id: str, reply: AuthorReplyCreate, current_user=Depends(get_current_user)
):
    user_id = str(current_user.id)
    normalized_post_id = normalize_id(post_id, "Mensaje no encontrado")
    content = clean_message_text(reply.content, AUTHOR_REPLY_MAX_LENGTH, "La respuesta")

    try:
        post_response = (
            db()
            .table("author_posts")
            .select("*")
            .eq("id", normalized_post_id)
            .limit(1)
            .execute()
        )
        if not post_response.data:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")

        post = post_response.data[0]
        author_id = str(post["author_id"])
        is_author = author_id == user_id

        if not is_author:
            # Se comprueba el seguimiento de este momento, no uno anterior.
            if not is_following(user_id, author_id):
                raise HTTPException(
                    status_code=403,
                    detail="Solo quienes siguen a este autor pueden responder."
                )
            blocked_by_me, blocked_me = block_state(user_id, author_id)
            if blocked_by_me or blocked_me:
                raise HTTPException(
                    status_code=403,
                    detail="No puedes responder a los mensajes de este autor."
                )
            if not post.get("replies_open", True):
                raise HTTPException(
                    status_code=403,
                    detail="El autor cerró las respuestas de este mensaje."
                )

        reply_to_id = None
        if reply.reply_to_id:
            reply_to_id = normalize_id(reply.reply_to_id, "Respuesta no encontrada")
            target_response = (
                db()
                .table("author_post_replies")
                .select("id, user_id, post_id")
                .eq("id", reply_to_id)
                .eq("post_id", normalized_post_id)
                .limit(1)
                .execute()
            )
            if not target_response.data:
                raise HTTPException(status_code=404, detail="Respuesta no encontrada")
            # La conversación es autor ↔ seguidores: un seguidor solo puede
            # contestarle al autor, nunca a otro seguidor.
            if not is_author and str(target_response.data[0]["user_id"]) != author_id:
                raise HTTPException(
                    status_code=403,
                    detail="Solo puedes responderle al autor."
                )

        limit_message_requests("reply", user_id=user_id)

        created = (
            db()
            .table("author_post_replies")
            .insert({
                "id": str(uuid.uuid4()),
                "post_id": normalized_post_id,
                "user_id": user_id,
                "reply_to_id": reply_to_id,
                "content": content,
                "created_at": now_iso()
            })
            .execute()
        ).data[0]
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    return {
        "reply": {
            "id": str(created["id"]),
            "user": user_cards([user_id])[user_id],
            "is_author": is_author,
            "is_mine": True,
            "reply_to_id": reply_to_id,
            "content": created["content"],
            "created_at": created.get("created_at")
        }
    }
