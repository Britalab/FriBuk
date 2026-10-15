# ============================================================
# NOTIFICACIONES PUSH
# ============================================================
#
# Avisos en el teléfono o el computador aunque FriBuk esté cerrada.
#
# - Cada dispositivo que acepta los avisos guarda su suscripción en
#   push_subscriptions (una fila por navegador; un usuario puede tener varias).
# - Cada vez que se crea una notificación, se envía también como push a
#   todos los dispositivos de quien la recibe, con el número de pendientes
#   para el ícono de la app.
# - Las suscripciones que el navegador da por terminadas (404 o 410) se
#   borran solas.
#
# Necesita las claves VAPID en las variables de entorno VAPID_PUBLIC_KEY,
# VAPID_PRIVATE_KEY y VAPID_SUBJECT. Sin ellas, todo lo demás funciona igual
# y simplemente no se envían avisos.

import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()

MAX_SUBSCRIPTIONS_PER_USER = 10
MAX_ENDPOINT_LENGTH = 1000
MAX_KEY_LENGTH = 200
# Si el dispositivo está apagado, el aviso espera como mucho un día.
PUSH_TTL_SECONDS = 86400
PUSH_TIMEOUT_SECONDS = 10
GONE_STATUSES = {404, 410}

SUPPORT_STATUS_LABELS = {
    "pending": "pendiente",
    "in_review": "en revisión",
    "resolved": "resuelta",
}

push_executor = ThreadPoolExecutor(max_workers=2)


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


def db():
    return fribuk().supabase_admin


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    return fribuk().get_current_user(credentials)


def vapid_settings() -> dict | None:
    public_key = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    subject = os.getenv("VAPID_SUBJECT", "").strip()

    if not (public_key and private_key and subject):
        return None
    return {"public_key": public_key, "private_key": private_key, "subject": subject}


# ------------------------------------------------------------
# Texto de cada aviso (el mismo que muestra el centro de actividad)
# ------------------------------------------------------------

def quoted(title: str | None, fallback: str) -> str:
    return f"«{title}»" if title else fallback


def others(actor_count: int) -> str:
    extra = actor_count - 1
    if extra <= 0:
        return ""
    return " y 1 persona más" if extra == 1 else f" y {extra} personas más"


def notification_message(row: dict, actor_username: str | None) -> dict:
    data = row.get("data") or {}
    actor_count = int(row.get("actor_count") or 1)
    many = actor_count > 1
    story = quoted(data.get("story_title"), "tu historia")
    story_id = row.get("story_id")
    actor = f"@{actor_username}" if actor_username else (
        "Alguien" if row.get("actor_user_id") else ""
    )
    notification_type = row.get("type")

    if notification_type == "follow":
        return {
            "body": f"{actor}{others(actor_count)} {'comenzaron' if many else 'comenzó'} a seguirte.",
            "url": f"/usuario/{row['actor_user_id']}" if row.get("actor_user_id") else "/perfil",
        }

    if notification_type == "story_comment":
        chapter_id = data.get("chapter_id")
        chapter_url = (
            f"/stories/{story_id}/chapters/{chapter_id}" if chapter_id
            else f"/stories/{story_id}"
        )
        if data.get("mention"):
            where = quoted(data.get("chapter_title"), "un capítulo")
            of_story = f", de {quoted(data.get('story_title'), '')}" if data.get("story_title") else ""
            return {
                "body": f"{actor} te mencionó en un comentario de {where}{of_story}.",
                "url": chapter_url,
            }
        if chapter_id:
            return {
                "body": f"{actor} comentó {quoted(data.get('chapter_title'), 'un capítulo')} de tu historia {story}.",
                "url": chapter_url,
            }
        return {"body": f"{actor} comentó tu historia {story}.", "url": f"/stories/{story_id}"}

    if notification_type == "story_vote":
        verb = "recomendaron" if many else "recomendó"
        return {
            "body": f"{actor}{others(actor_count)} {verb} tu historia {story}.",
            "url": f"/stories/{story_id}",
        }

    if notification_type == "story_favorite":
        verb = "guardaron" if many else "guardó"
        return {
            "body": f"{actor}{others(actor_count)} {verb} tu historia {story} en favoritos.",
            "url": f"/stories/{story_id}",
        }

    if notification_type == "story_rating":
        verb = "valoraron" if many else "valoró"
        return {
            "body": f"{actor}{others(actor_count)} {verb} tu historia {story}.",
            "url": f"/stories/{story_id}",
        }

    if notification_type == "story_chapter":
        chapter = " · ".join(
            part for part in (
                f"Capítulo {data['chapter_number']}" if data.get("chapter_number") is not None else "",
                data.get("chapter_title") or "",
            )
            if part
        )
        chapter_id = row.get("chapter_id")
        return {
            "body": (
                f"Nuevo capítulo de {quoted(data.get('story_title'), 'una historia de tus favoritos')}"
                f"{f': {chapter}' if chapter else ''}."
            ),
            "url": (
                f"/stories/{story_id}/chapters/{chapter_id}" if story_id and chapter_id
                else f"/stories/{story_id}"
            ),
        }

    if notification_type == "forum_reply":
        topic = quoted(data.get("topic_title"), "del foro")
        url = f"/forum/{row.get('forum_topic_id')}"
        if data.get("mention"):
            return {"body": f"{actor} te mencionó en el tema {topic}.", "url": url}
        return {"body": f"{actor} respondió tu tema {topic}.", "url": url}

    if notification_type == "support_status":
        category = f" ({data['category']})" if data.get("category") else ""
        status = SUPPORT_STATUS_LABELS.get(data.get("status"), "actualizada")
        return {"body": f"Tu solicitud de soporte{category} ahora está {status}.", "url": "/support"}

    return {"body": "Tienes una notificación nueva.", "url": "/actividad"}


# ------------------------------------------------------------
# Envío
# ------------------------------------------------------------

def send_webpush(subscription: dict, payload: str, settings: dict) -> int | None:
    # Devuelve el código HTTP del servicio de avisos cuando lo rechaza.
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=payload,
            vapid_private_key=settings["private_key"],
            # pywebpush modifica este diccionario: uno nuevo en cada envío.
            vapid_claims={"sub": settings["subject"]},
            ttl=PUSH_TTL_SECONDS,
            timeout=PUSH_TIMEOUT_SECONDS,
        )
        return None
    except WebPushException as error:
        response = getattr(error, "response", None)
        return getattr(response, "status_code", None) or 0


def actor_usernames(rows: list[dict]) -> dict[str, str]:
    actor_ids = list({str(row["actor_user_id"]) for row in rows if row.get("actor_user_id")})
    if not actor_ids:
        return {}
    users = db().table("users").select("id, username").in_("id", actor_ids).execute().data or []
    return {str(user["id"]): user.get("username") for user in users}


def send_notifications(rows: list[dict]) -> None:
    settings = vapid_settings()
    if not settings or not rows:
        return

    recipient_ids = list({str(row["recipient_user_id"]) for row in rows if row.get("recipient_user_id")})
    if not recipient_ids:
        return

    subscriptions = (
        db().table("push_subscriptions").select("*")
        .in_("user_id", recipient_ids).execute()
    ).data or []
    if not subscriptions:
        return

    by_user: dict[str, list[dict]] = {}
    for subscription in subscriptions:
        by_user.setdefault(str(subscription["user_id"]), []).append(subscription)

    usernames = actor_usernames(rows)

    for row in rows:
        recipient_id = str(row.get("recipient_user_id"))
        devices = by_user.get(recipient_id)
        if not devices:
            continue

        message = notification_message(
            row, usernames.get(str(row.get("actor_user_id")))
        )
        try:
            unread = fribuk().count_unread_notifications(recipient_id)
        except Exception:
            unread = None

        payload = json.dumps({
            "title": "FriBuk",
            "body": message["body"],
            "url": message["url"],
            # Misma etiqueta = el aviso agrupado reemplaza al anterior.
            "tag": f"notificacion-{row['id']}" if row.get("id") else None,
            "unread": unread,
        }, ensure_ascii=False)

        for device in devices:
            status = send_webpush(device, payload, settings)
            if status in GONE_STATUSES:
                # El navegador dio la suscripción por terminada.
                db().table("push_subscriptions").delete().eq(
                    "endpoint", device["endpoint"]
                ).execute()
            elif status is not None:
                print("No se pudo enviar el aviso push:", status)


def run_in_background(task, *args) -> None:
    def safe_task():
        try:
            task(*args)
        except Exception as error:
            print("No se pudieron enviar los avisos push:", repr(error))

    try:
        push_executor.submit(safe_task)
    except Exception as error:
        print("No se pudieron programar los avisos push:", repr(error))


def schedule_notifications(rows: list[dict] | None) -> None:
    # Se llama justo después de guardar notificaciones: el envío va aparte
    # para no demorar ni romper nada si un servicio de avisos tarda.
    if rows and vapid_settings():
        run_in_background(send_notifications, [dict(row) for row in rows])


# ------------------------------------------------------------
# Rutas
# ------------------------------------------------------------

class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionCreate(BaseModel):
    endpoint: str
    keys: SubscriptionKeys


class SubscriptionRemove(BaseModel):
    endpoint: str


def clean_endpoint(endpoint: str) -> str:
    endpoint = (endpoint or "").strip()
    parsed = urlparse(endpoint)
    if (
        len(endpoint) > MAX_ENDPOINT_LENGTH
        or parsed.scheme != "https"
        or not parsed.netloc
    ):
        raise HTTPException(status_code=400, detail="Suscripción no válida.")
    return endpoint


@router.get("/push/public-key")
def get_public_key():
    settings = vapid_settings()
    return {"public_key": settings["public_key"] if settings else None}


@router.post("/push/subscriptions")
def save_subscription(
    subscription: SubscriptionCreate,
    current_user=Depends(get_current_user),
):
    if not vapid_settings():
        raise HTTPException(status_code=503, detail="Los avisos no están disponibles por ahora.")

    user_id = str(current_user.id)
    endpoint = clean_endpoint(subscription.endpoint)
    p256dh = subscription.keys.p256dh.strip()
    auth = subscription.keys.auth.strip()
    if not p256dh or not auth or len(p256dh) > MAX_KEY_LENGTH or len(auth) > MAX_KEY_LENGTH:
        raise HTTPException(status_code=400, detail="Suscripción no válida.")

    now = datetime.now(timezone.utc).isoformat()
    # Si el navegador ya estaba suscrito con otra cuenta, pasa a esta.
    (
        db().table("push_subscriptions")
        .upsert(
            {
                "endpoint": endpoint,
                "user_id": user_id,
                "p256dh": p256dh,
                "auth": auth,
                "updated_at": now,
            },
            on_conflict="endpoint",
        )
        .execute()
    )

    # Como mucho unos pocos dispositivos por persona: se borran los más viejos.
    rows = (
        db().table("push_subscriptions").select("endpoint, updated_at")
        .eq("user_id", user_id).execute()
    ).data or []
    rows.sort(key=lambda row: row.get("updated_at") or "", reverse=True)
    for old in rows[MAX_SUBSCRIPTIONS_PER_USER:]:
        db().table("push_subscriptions").delete().eq("endpoint", old["endpoint"]).execute()

    return {"subscribed": True}


@router.post("/push/unsubscribe")
def remove_subscription(
    subscription: SubscriptionRemove,
    current_user=Depends(get_current_user),
):
    (
        db().table("push_subscriptions").delete()
        .eq("endpoint", (subscription.endpoint or "").strip())
        .eq("user_id", str(current_user.id))
        .execute()
    )
    return {"subscribed": False}
