# Moderación de contenido de FriBuk: reportes de la comunidad, retiro y
# restauración de publicaciones del foro e imágenes subidas por usuarios
# (foto de perfil, banner de perfil y portada de historia).
#
# El banner del inicio queda fuera: lo sube la administración, no los usuarios.
#
# Reglas que este módulo hace cumplir siempre en el backend:
#   - una persona reporta un mismo contenido una sola vez;
#   - nadie ve quién reportó ni cuántos reportes tiene una publicación;
#   - solo un administrador retira o restaura;
#   - cinco reportes de cinco personas distintas retiran el contenido de
#     forma automática, a la espera de revisión;
#   - retirar nunca borra: el contenido y su imagen se conservan para la
#     revisión y se pueden restaurar.
#
# Las tablas están en sql/moderation.sql.

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

REPORT_REASONS = {
    "prohibited": "Contenido prohibido",
    "sexual": "Contenido sexual",
    "graphic_violence": "Violencia gráfica",
    "harassment": "Acoso",
    "spam": "Spam",
    "copyright": "Copyright",
    "other": "Otro"
}
AUTOMATIC_REMOVAL_REASON = "many_reports"
REMOVAL_REASONS = {
    **REPORT_REASONS,
    AUTOMATIC_REMOVAL_REASON: "Alto número de reportes"
}

# Texto que ve la persona afectada: el motivo general, nunca quién reportó.
REMOVAL_PHRASES = {
    "prohibited": "contenido prohibido",
    "sexual": "contenido sexual",
    "graphic_violence": "violencia gráfica",
    "harassment": "acoso",
    "spam": "spam",
    "copyright": "infracción de derechos de autor",
    "other": "incumplir las normas de la comunidad",
    AUTOMATIC_REMOVAL_REASON: "alto número de reportes"
}

TARGET_LABELS = {
    "forum_topic": "Tema del foro",
    "forum_reply": "Respuesta del foro",
    "avatar": "Foto de perfil",
    "profile_banner": "Banner de perfil",
    "story_cover": "Portada de historia"
}
TARGET_REMOVED_TEXT = {
    "forum_topic": "Tu tema del foro fue retirado",
    "forum_reply": "Tu respuesta en el foro fue retirada",
    "avatar": "Tu foto de perfil fue retirada",
    "profile_banner": "Tu banner de perfil fue retirado",
    "story_cover": "La portada de tu historia fue retirada"
}
PROFILE_IMAGE_KEYS = {"avatar": "avatar_url", "profile_banner": "banner_url"}
PROFILE_IMAGE_PATHS = {
    "avatar": "avatars/{user_id}/avatar",
    "profile_banner": "banners/{user_id}/banner"
}
PROFILE_IMAGE_BUCKET = "story-covers"
STORY_COVER_BUCKET = "story-covers"
EVIDENCE_FOLDER = "moderation"

# Reportes de personas distintas que retiran un contenido automáticamente.
AUTO_REMOVE_THRESHOLD = 5
# Los reportes de cuentas más nuevas que esto llegan al panel, pero no
# suman para el retiro automático: así no basta con crear cuentas.
MIN_REPORTER_ACCOUNT_AGE_HOURS = 24

REPORT_DETAILS_MAX_LENGTH = 300
MODERATION_NOTE_MAX_LENGTH = 500
SNAPSHOT_TEXT_LENGTH = 600
CASE_LIST_LIMIT = 100

# Límites en memoria por usuario: (reportes permitidos, ventana en segundos).
REPORT_RATE_LIMITS = ((10, 3600), (30, 86400))
REPORT_RATE_MAX_TRACKED_KEYS = 20000

report_requests: dict[tuple[int, str], deque] = {}
report_requests_lock = threading.Lock()


class ContentReportCreate(BaseModel):
    target_type: str
    target_id: str
    reason: str
    details: str | None = None


class ContentRemoval(BaseModel):
    target_type: str
    target_id: str
    reason: str
    note: str | None = None


class ModerationNote(BaseModel):
    note: str | None = None


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


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    # Misma comprobación de administrador que el panel de soporte.
    return fribuk().get_current_admin(credentials)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_timestamp(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def clean_note(value: str | None, max_length: int, label: str) -> str | None:
    text = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(
        character for character in text
        if character == "\n" or (ord(character) >= 32 and ord(character) != 127)
    ).strip()

    if not text:
        return None
    if len(text) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"{label} no puede superar los {max_length} caracteres"
        )
    return text


def limit_report_requests(user_id: str) -> None:
    now = time.monotonic()

    with report_requests_lock:
        if len(report_requests) > REPORT_RATE_MAX_TRACKED_KEYS:
            report_requests.clear()

        tracked = []
        for limit, window in REPORT_RATE_LIMITS:
            timestamps = report_requests.setdefault((window, user_id), deque())
            while timestamps and now - timestamps[0] > window:
                timestamps.popleft()
            if len(timestamps) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Enviaste muchos reportes en poco tiempo. "
                        "Espera un momento e inténtalo nuevamente."
                    )
                )
            tracked.append(timestamps)

        for timestamps in tracked:
            timestamps.append(now)


def user_cards(user_ids) -> dict[str, dict]:
    unique_ids = list(dict.fromkeys(str(user_id) for user_id in user_ids if user_id))
    cards = {}

    if unique_ids:
        try:
            for card in fribuk().get_follow_user_cards(unique_ids):
                cards[str(card["id"])] = {
                    "id": str(card["id"]),
                    "username": card.get("username") or "Usuario"
                }
        except Exception as error:
            print("No se pudieron cargar los usuarios de moderación:", repr(error))

    for user_id in unique_ids:
        cards.setdefault(user_id, {"id": user_id, "username": "Usuario"})

    return cards


# ============================================================
# CONTENIDO MODERABLE
# ============================================================

def normalize_target(target_type: str, target_id: str) -> str:
    if target_type not in TARGET_LABELS:
        raise HTTPException(status_code=400, detail="Tipo de contenido no válido")

    return fribuk().normalize_uuid_or_404(target_id, "Contenido no encontrado")


def excerpt(value) -> str:
    text = str(value or "")
    if len(text) <= SNAPSHOT_TEXT_LENGTH:
        return text
    return text[:SNAPSHOT_TEXT_LENGTH - 1].rstrip() + "…"


def load_target(target_type: str, target_id: str) -> dict:
    # Dueño y copia del contenido tal como está publicado ahora. Si el
    # contenido no existe (o esa imagen no está puesta), responde 404.
    not_found = HTTPException(status_code=404, detail="Contenido no encontrado")

    if target_type in ("forum_topic", "forum_reply"):
        table = "forum_topics" if target_type == "forum_topic" else "forum_replies"
        response = db().table(table).select("*").eq("id", target_id).limit(1).execute()
        if not response.data:
            raise not_found
        row = response.data[0]
        snapshot = {
            "text": excerpt(row.get("content")),
            "image_url": row.get("image_url"),
            "topic_id": str(row.get("topic_id") or row["id"])
        }
        if target_type == "forum_topic":
            snapshot["title"] = row.get("title")
        return {"owner_id": str(row["user_id"]), "snapshot": snapshot}

    if target_type in PROFILE_IMAGE_KEYS:
        auth_user = fribuk().get_public_auth_user(target_id)
        metadata = auth_user.user_metadata or {}
        image_url = metadata.get(PROFILE_IMAGE_KEYS[target_type])
        if not image_url:
            raise not_found
        return {
            "owner_id": target_id,
            "snapshot": {"image_url": image_url, "title": metadata.get("username")}
        }

    response = (
        db()
        .table("stories")
        .select("id, author_id, title, cover_url")
        .eq("id", target_id)
        .limit(1)
        .execute()
    )
    if not response.data or not response.data[0].get("cover_url"):
        raise not_found
    row = response.data[0]
    return {
        "owner_id": str(row["author_id"]),
        "snapshot": {"image_url": row["cover_url"], "title": row.get("title")}
    }


def get_case(target_type: str, target_id: str) -> dict | None:
    response = (
        db()
        .table("moderation_cases")
        .select("*")
        .eq("target_type", target_type)
        .eq("target_id", target_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def create_case(target_type: str, target_id: str, target: dict) -> dict:
    timestamp = now_iso()
    return (
        db()
        .table("moderation_cases")
        .insert({
            "id": str(uuid.uuid4()),
            "target_type": target_type,
            "target_id": target_id,
            "owner_id": target["owner_id"],
            "status": "open",
            "snapshot": target["snapshot"],
            "report_count": 0,
            "last_report_at": None,
            "counting_since": None,
            "removal_reason": None,
            "removal_automatic": False,
            "removed_at": None,
            "removed_by": None,
            "restored_at": None,
            "restored_by": None,
            "created_at": timestamp,
            "updated_at": timestamp
        })
        .execute()
    ).data[0]


def update_case(case: dict, changes: dict) -> dict:
    changes = {**changes, "updated_at": now_iso()}
    db().table("moderation_cases").update(changes).eq("id", str(case["id"])).execute()
    return {**case, **changes}


def record_action(case_id: str, action: str, actor_id, reason=None, note=None) -> None:
    (
        db()
        .table("moderation_actions")
        .insert({
            "id": str(uuid.uuid4()),
            "case_id": case_id,
            "action": action,
            "actor_id": actor_id,
            "reason": reason,
            "note": note,
            "created_at": now_iso()
        })
        .execute()
    )


# ============================================================
# IMÁGENES: CONSERVAR SIN MOSTRAR
# ============================================================

def storage_path_from_url(url: str | None, bucket: str) -> str | None:
    marker = f"/object/public/{bucket}/"
    if not url or marker not in url:
        return None
    return url.split(marker, 1)[1].split("?", 1)[0] or None


def quarantine_image(bucket: str, path: str | None, case_id: str) -> dict:
    # La imagen se mueve a una carpeta de moderación con nombre imposible de
    # adivinar: la dirección anterior deja de funcionar y el archivo se
    # conserva para la revisión. Si no se puede mover, igual deja de
    # mostrarse porque el sitio ya no la enlaza.
    if not path:
        return {}

    evidence_path = f"{EVIDENCE_FOLDER}/{case_id}/{uuid.uuid4().hex}-{path.rsplit('/', 1)[-1]}"
    try:
        storage = db().storage.from_(bucket)
        storage.move(path, evidence_path)
        return {
            "bucket": bucket,
            "original_path": path,
            "evidence_path": evidence_path,
            "evidence_url": storage.get_public_url(evidence_path)
        }
    except Exception as error:
        print("No se pudo apartar la imagen retirada:", repr(error))
        return {"bucket": bucket, "original_path": path}


def release_image(snapshot: dict) -> bool:
    bucket = snapshot.get("bucket")
    evidence_path = snapshot.get("evidence_path")
    original_path = snapshot.get("original_path")

    if not (bucket and evidence_path and original_path):
        # Nunca se movió: sigue en su lugar.
        return bool(bucket and original_path)

    try:
        db().storage.from_(bucket).move(evidence_path, original_path)
        return True
    except Exception as error:
        print("No se pudo devolver la imagen restaurada:", repr(error))
        return False


def without_evidence(snapshot: dict) -> dict:
    return {
        key: value for key, value in snapshot.items()
        if key not in ("evidence_path", "evidence_url")
    }


def set_profile_image(user_id: str, key: str, value: str | None) -> None:
    main = fribuk()
    auth_user = main.get_public_auth_user(user_id)
    metadata = dict(auth_user.user_metadata or {})
    metadata[key] = value
    main.supabase_admin.auth.admin.update_user_by_id(
        user_id, {"user_metadata": metadata}
    )

    # El buscador guarda los avatares un rato: se olvida el de esta persona.
    try:
        with main.user_search_avatars_lock:
            main.user_search_avatars.pop(user_id, None)
    except Exception:
        pass


def hide_content(case: dict, snapshot: dict) -> dict:
    # Deja de mostrar el contenido y devuelve la copia actualizada, con el
    # lugar donde quedó guardada la imagen.
    target_type = case["target_type"]
    target_id = str(case["target_id"])
    case_id = str(case["id"])
    main = fribuk()

    if target_type in ("forum_topic", "forum_reply"):
        # El texto no se toca: el foro consulta el caso para ocultarlo.
        bucket = main.FORUM_IMAGE_BUCKET
        path = storage_path_from_url(snapshot.get("image_url"), bucket)
        return {**snapshot, **quarantine_image(bucket, path, case_id)}

    if target_type in PROFILE_IMAGE_KEYS:
        path = PROFILE_IMAGE_PATHS[target_type].format(user_id=target_id)
        moved = quarantine_image(PROFILE_IMAGE_BUCKET, path, case_id)
        set_profile_image(target_id, PROFILE_IMAGE_KEYS[target_type], None)
        return {**snapshot, **moved}

    path = storage_path_from_url(snapshot.get("image_url"), STORY_COVER_BUCKET)
    moved = quarantine_image(STORY_COVER_BUCKET, path, case_id)
    (
        db()
        .table("stories")
        .update({"cover_url": None})
        .eq("id", target_id)
        .execute()
    )
    return {**snapshot, **moved}


def show_content(case: dict) -> dict:
    # Vuelve a mostrar el contenido. Si la persona ya subió otra imagen en
    # ese lugar, la nueva se respeta y la retirada queda solo en el historial.
    target_type = case["target_type"]
    target_id = str(case["target_id"])
    snapshot = dict(case.get("snapshot") or {})
    main = fribuk()

    if target_type in ("forum_topic", "forum_reply"):
        if release_image(snapshot):
            return without_evidence(snapshot)
        return snapshot

    if target_type in PROFILE_IMAGE_KEYS:
        key = PROFILE_IMAGE_KEYS[target_type]
        current = (main.get_public_auth_user(target_id).user_metadata or {}).get(key)
        if current or not release_image(snapshot):
            return snapshot
        storage = db().storage.from_(snapshot["bucket"])
        url = f"{storage.get_public_url(snapshot['original_path'])}?v={int(time.time())}"
        set_profile_image(target_id, key, url)
        return without_evidence(snapshot)

    response = (
        db()
        .table("stories")
        .select("id, cover_url")
        .eq("id", target_id)
        .limit(1)
        .execute()
    )
    if not response.data or response.data[0].get("cover_url"):
        return snapshot
    if not release_image(snapshot):
        return snapshot
    (
        db()
        .table("stories")
        .update({"cover_url": snapshot.get("image_url")})
        .eq("id", target_id)
        .execute()
    )
    return without_evidence(snapshot)


def remove_content(
    case: dict, reason: str, actor_id: str | None, automatic: bool, note=None
) -> dict:
    snapshot = hide_content(case, dict(case.get("snapshot") or {}))
    updated = update_case(case, {
        "status": "removed",
        "snapshot": snapshot,
        "removal_reason": reason,
        "removal_automatic": automatic,
        "removed_at": now_iso(),
        "removed_by": actor_id
    })
    record_action(
        str(case["id"]),
        "auto_removed" if automatic else "removed",
        actor_id,
        reason,
        note
    )
    return updated


def removal_message(case: dict) -> str:
    phrase = REMOVAL_PHRASES.get(case.get("removal_reason"), REMOVAL_PHRASES["other"])
    text = TARGET_REMOVED_TEXT.get(case["target_type"], "Tu contenido fue retirado")
    return f"{text} por {phrase}."


# ============================================================
# FORO: QUÉ VE CADA PERSONA
# ============================================================

def removed_cases(target_type: str, target_ids) -> dict[str, dict]:
    ids = [str(target_id) for target_id in target_ids if target_id]
    if not ids:
        return {}

    # Si la consulta falla (por ejemplo, las tablas aún no existen), el foro
    # se muestra igual que antes de existir la moderación.
    try:
        response = (
            db()
            .table("moderation_cases")
            .select("*")
            .eq("target_type", target_type)
            .eq("status", "removed")
            .in_("target_id", ids)
            .execute()
        )
    except Exception as error:
        print("No se pudo consultar la moderación:", repr(error))
        return {}

    return {str(row["target_id"]): row for row in response.data or []}


def cases_in_review(target_type: str, target_ids) -> bool:
    # Verdadero si alguno de esos contenidos tiene reportes pendientes o
    # está retirado: su autor no puede borrarlo hasta que se revise.
    ids = [str(target_id) for target_id in target_ids if target_id]
    if not ids:
        return False

    try:
        response = (
            db()
            .table("moderation_cases")
            .select("id, status")
            .eq("target_type", target_type)
            .in_("target_id", ids)
            .execute()
        )
    except Exception as error:
        print("No se pudo consultar la moderación:", repr(error))
        return False

    return any(row.get("status") in ("open", "removed") for row in response.data or [])


def viewer_is_admin(viewer) -> bool:
    return bool(viewer) and fribuk().is_admin_user(str(viewer.id))


def moderation_view(item: dict, case: dict, is_admin: bool) -> dict:
    # Para quien publicó el contenido o para un administrador: el contenido
    # completo, con el aviso de retiro y la imagen conservada.
    snapshot = case.get("snapshot") or {}
    view = dict(item)
    if snapshot.get("evidence_url"):
        view["image_url"] = snapshot["evidence_url"]

    view["moderation"] = {
        "removed": True,
        "reason": case.get("removal_reason"),
        "reason_label": REMOVAL_REASONS.get(case.get("removal_reason")),
        "automatic": bool(case.get("removal_automatic")),
        "message": removal_message(case)
    }
    if is_admin:
        view["moderation"]["case_id"] = str(case["id"])
    return view


def visible_forum_topics(topics: list[dict]) -> list[dict]:
    # La lista del foro no muestra temas retirados.
    removed = removed_cases("forum_topic", [topic.get("id") for topic in topics])
    return [topic for topic in topics if str(topic.get("id")) not in removed]


def present_forum_topic(topic: dict, viewer) -> dict:
    case = removed_cases("forum_topic", [topic.get("id")]).get(str(topic.get("id")))
    if not case:
        return topic

    is_admin = viewer_is_admin(viewer)
    is_owner = bool(viewer) and str(viewer.id) == str(topic.get("user_id"))
    if not (is_admin or is_owner):
        raise HTTPException(status_code=404, detail="Tema no encontrado")

    return moderation_view(topic, case, is_admin)


def present_forum_replies(replies: list[dict], viewer) -> list[dict]:
    removed = removed_cases("forum_reply", [reply.get("id") for reply in replies])
    if not removed:
        return replies

    is_admin = viewer_is_admin(viewer)
    viewer_id = str(viewer.id) if viewer else None
    presented = []

    for reply in replies:
        case = removed.get(str(reply.get("id")))
        if not case:
            presented.append(reply)
        elif is_admin or viewer_id == str(reply.get("user_id")):
            presented.append(moderation_view(reply, case, is_admin))
        else:
            # El resto ve que hubo una respuesta, sin su contenido ni su imagen.
            presented.append({
                "id": reply.get("id"),
                "topic_id": reply.get("topic_id"),
                "created_at": reply.get("created_at"),
                "user_id": None,
                "username": "Usuario",
                "content": "",
                "image_url": None,
                "moderation": {"removed": True}
            })

    return presented


def ensure_forum_topic_open(topic_id: str) -> None:
    if removed_cases("forum_topic", [topic_id]):
        raise HTTPException(status_code=404, detail="Tema no encontrado")


# ============================================================
# REPORTAR
# ============================================================

def reporter_counts_for_auto(current_user) -> bool:
    created_at = parse_timestamp(getattr(current_user, "created_at", None))
    if not created_at:
        return False
    return datetime.now(timezone.utc) - created_at >= timedelta(
        hours=MIN_REPORTER_ACCOUNT_AGE_HOURS
    )


def case_reports(case_id: str) -> list[dict]:
    return (
        db()
        .table("content_reports")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at")
        .execute()
    ).data or []


def countable_reporters(case: dict, reports: list[dict]) -> int:
    since = parse_timestamp(case.get("counting_since"))
    reporters = set()

    for report in reports:
        if not report.get("counts_for_auto"):
            continue
        created = parse_timestamp(report.get("created_at"))
        if since and (not created or created <= since):
            continue
        reporters.add(str(report["reporter_id"]))

    return len(reporters)


@router.post("/moderation/reports")
def report_content(report: ContentReportCreate, current_user=Depends(get_current_user)):
    user_id = str(current_user.id)
    target_type = report.target_type
    target_id = normalize_target(target_type, report.target_id)

    if report.reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Motivo de reporte no válido")

    # La explicación solo acompaña al motivo "Otro".
    details = None
    if report.reason == "other":
        details = clean_note(report.details, REPORT_DETAILS_MAX_LENGTH, "La explicación")

    try:
        case = get_case(target_type, target_id)
        if case and case["status"] == "removed":
            raise HTTPException(
                status_code=400, detail="Este contenido ya fue retirado."
            )

        target = load_target(target_type, target_id)
        if target["owner_id"] == user_id:
            raise HTTPException(
                status_code=400, detail="No puedes reportar tu propio contenido."
            )

        duplicate = (
            db()
            .table("content_reports")
            .select("id")
            .eq("target_type", target_type)
            .eq("target_id", target_id)
            .eq("reporter_id", user_id)
            .limit(1)
            .execute()
        )
        if duplicate.data:
            raise HTTPException(
                status_code=409, detail="Ya reportaste este contenido."
            )

        limit_report_requests(user_id)

        if not case:
            case = create_case(target_type, target_id, target)

        try:
            (
                db()
                .table("content_reports")
                .insert({
                    "id": str(uuid.uuid4()),
                    "case_id": str(case["id"]),
                    "target_type": target_type,
                    "target_id": target_id,
                    "reporter_id": user_id,
                    "reason": report.reason,
                    "details": details,
                    "counts_for_auto": reporter_counts_for_auto(current_user),
                    "created_at": now_iso()
                })
                .execute()
            )
        except Exception as error:
            # Dos envíos a la vez: la base de datos rechaza el segundo.
            if str(getattr(error, "code", "")) == "23505":
                raise HTTPException(
                    status_code=409, detail="Ya reportaste este contenido."
                )
            raise

        reports = case_reports(str(case["id"]))
        case = update_case(case, {
            "report_count": len({str(item["reporter_id"]) for item in reports}),
            "last_report_at": now_iso(),
            # Un caso ya revisado o restaurado vuelve a quedar pendiente.
            "status": "open"
        })

        # Aviso por correo a la administración: el retiro automático o, si
        # no lo hubo, el reporte nuevo.
        if countable_reporters(case, reports) >= AUTO_REMOVE_THRESHOLD:
            case = remove_content(
                case, AUTOMATIC_REMOVAL_REASON, actor_id=None, automatic=True
            )
            admin_alerts.alert_automatic_removal(case, TARGET_LABELS[target_type])
        else:
            admin_alerts.alert_new_report(
                case, TARGET_LABELS[target_type],
                REPORT_REASONS[report.reason], details
            )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )

    # No se devuelve cuántos reportes hay ni qué pasó con el contenido.
    return {
        "message": "Gracias. Recibimos tu reporte y el equipo de FriBuk lo revisará."
    }


# ============================================================
# AVISOS PARA QUIEN PUBLICÓ
# ============================================================

@router.get("/me/moderation")
def get_my_moderation_notices(current_user=Depends(get_current_user)):
    # Contenido propio retirado, con el motivo general. Si falla, el perfil
    # se muestra sin avisos.
    try:
        response = (
            db()
            .table("moderation_cases")
            .select("*")
            .eq("owner_id", str(current_user.id))
            .eq("status", "removed")
            .order("removed_at", desc=True)
            .limit(20)
            .execute()
        )
    except Exception as error:
        print("No se pudieron cargar los avisos de moderación:", repr(error))
        return {"notices": []}

    return {
        "notices": [
            {
                "id": str(case["id"]),
                "target_type": case["target_type"],
                "target_label": TARGET_LABELS.get(case["target_type"]),
                "title": (case.get("snapshot") or {}).get("title"),
                "message": removal_message(case),
                "removed_at": case.get("removed_at")
            }
            for case in response.data or []
        ]
    }


# ============================================================
# ADMINISTRACIÓN
# ============================================================

def target_link(case: dict) -> str:
    target_type = case["target_type"]
    target_id = case["target_id"]
    snapshot = case.get("snapshot") or {}

    if target_type == "forum_topic":
        return f"/forum/{target_id}"
    if target_type == "forum_reply":
        return f"/forum/{snapshot.get('topic_id')}"
    if target_type in PROFILE_IMAGE_KEYS:
        return f"/usuario/{target_id}"
    return f"/stories/{target_id}"


def serialize_cases(cases: list[dict]) -> list[dict]:
    case_ids = [str(case["id"]) for case in cases]
    reports_by_case: dict[str, list[dict]] = {}
    actions_by_case: dict[str, list[dict]] = {}

    if case_ids:
        reports = (
            db()
            .table("content_reports")
            .select("case_id, reason, details, created_at")
            .in_("case_id", case_ids)
            .order("created_at")
            .execute()
        ).data or []
        for report in reports:
            reports_by_case.setdefault(str(report["case_id"]), []).append(report)

        actions = (
            db()
            .table("moderation_actions")
            .select("*")
            .in_("case_id", case_ids)
            .order("created_at")
            .execute()
        ).data or []
        for action in actions:
            actions_by_case.setdefault(str(action["case_id"]), []).append(action)

    cards = user_cards(
        [case.get("owner_id") for case in cases]
        + [
            action.get("actor_id")
            for actions in actions_by_case.values()
            for action in actions
        ]
    )

    serialized = []
    for case in cases:
        case_id = str(case["id"])
        snapshot = case.get("snapshot") or {}
        reports = reports_by_case.get(case_id, [])

        reason_counts: dict[str, int] = {}
        for report in reports:
            reason_counts[report["reason"]] = reason_counts.get(report["reason"], 0) + 1

        serialized.append({
            "id": case_id,
            "target_type": case["target_type"],
            "target_label": TARGET_LABELS.get(case["target_type"]),
            "target_id": str(case["target_id"]),
            "link": target_link(case),
            "status": case["status"],
            "owner": cards.get(str(case["owner_id"])) if case.get("owner_id") else None,
            "content": {
                "title": snapshot.get("title"),
                "text": snapshot.get("text"),
                # La imagen retirada se muestra desde donde quedó guardada.
                "image_url": snapshot.get("evidence_url") or snapshot.get("image_url")
            },
            "report_count": case.get("report_count") or 0,
            # Motivos recibidos, sin identificar a quienes reportaron.
            "reasons": [
                {"reason": reason, "label": REPORT_REASONS.get(reason, reason), "count": count}
                for reason, count in reason_counts.items()
            ],
            "explanations": [
                report["details"] for report in reports if report.get("details")
            ],
            "last_report_at": case.get("last_report_at"),
            "created_at": case.get("created_at"),
            "removal": (
                {
                    "reason": case.get("removal_reason"),
                    "reason_label": REMOVAL_REASONS.get(case.get("removal_reason")),
                    "automatic": bool(case.get("removal_automatic")),
                    "removed_at": case.get("removed_at")
                }
                if case["status"] == "removed" else None
            ),
            "history": [
                {
                    "action": action["action"],
                    "reason_label": REMOVAL_REASONS.get(action.get("reason")),
                    "note": action.get("note"),
                    "actor": (
                        cards.get(str(action["actor_id"]), {}).get("username")
                        if action.get("actor_id") else None
                    ),
                    "created_at": action.get("created_at")
                }
                for action in actions_by_case.get(case_id, [])
            ]
        })

    return serialized


@router.get("/moderation/cases")
def list_moderation_cases(status: str = "all", admin_user=Depends(get_current_admin)):
    if status not in ("all", "open", "removed", "restored", "reviewed"):
        raise HTTPException(status_code=400, detail="Estado no válido")

    try:
        query = db().table("moderation_cases").select("*")
        if status != "all":
            query = query.eq("status", status)
        cases = (
            query.order("updated_at", desc=True).limit(CASE_LIST_LIMIT).execute()
        ).data or []
        return {
            "cases": serialize_cases(cases),
            "auto_remove_threshold": AUTO_REMOVE_THRESHOLD
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=500, detail="No se pudieron cargar los casos de moderación"
        ) from error


def get_case_by_id(case_id: str) -> dict:
    normalized_id = fribuk().normalize_uuid_or_404(case_id, "Caso no encontrado")
    response = (
        db()
        .table("moderation_cases")
        .select("*")
        .eq("id", normalized_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return response.data[0]


@router.post("/moderation/remove")
def remove_reported_content(
    removal: ContentRemoval, admin_user=Depends(get_current_admin)
):
    target_type = removal.target_type
    target_id = normalize_target(target_type, removal.target_id)

    if removal.reason not in REMOVAL_REASONS:
        raise HTTPException(status_code=400, detail="Motivo de retiro no válido")
    note = clean_note(removal.note, MODERATION_NOTE_MAX_LENGTH, "La nota")

    try:
        case = get_case(target_type, target_id)
        if case and case["status"] == "removed":
            raise HTTPException(
                status_code=400, detail="Este contenido ya está retirado."
            )

        target = load_target(target_type, target_id)
        if case:
            # Se guarda el contenido tal como está al momento de retirarlo.
            case = {**case, "snapshot": target["snapshot"]}
        else:
            case = create_case(target_type, target_id, target)

        case = remove_content(
            case, removal.reason, str(admin_user["id"]), automatic=False, note=note
        )
        return {"message": "Contenido retirado", "case": serialize_cases([case])[0]}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )


@router.post("/moderation/cases/{case_id}/restore")
def restore_removed_content(
    case_id: str, body: ModerationNote, admin_user=Depends(get_current_admin)
):
    note = clean_note(body.note, MODERATION_NOTE_MAX_LENGTH, "La nota")

    try:
        case = get_case_by_id(case_id)
        if case["status"] != "removed":
            raise HTTPException(
                status_code=400, detail="Este contenido no está retirado."
            )

        timestamp = now_iso()
        case = update_case(case, {
            "status": "restored",
            "snapshot": show_content(case),
            "restored_at": timestamp,
            "restored_by": str(admin_user["id"]),
            # Los reportes anteriores quedan en el historial, pero ya no
            # cuentan: solo reportes nuevos pueden volver a retirarlo.
            "counting_since": timestamp
        })
        record_action(str(case["id"]), "restored", str(admin_user["id"]), note=note)
        return {"message": "Contenido restaurado", "case": serialize_cases([case])[0]}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )


@router.post("/moderation/cases/{case_id}/review")
def mark_case_reviewed(
    case_id: str, body: ModerationNote, admin_user=Depends(get_current_admin)
):
    # Reportes revisados sin retirar el contenido.
    note = clean_note(body.note, MODERATION_NOTE_MAX_LENGTH, "La nota")

    try:
        case = get_case_by_id(case_id)
        if case["status"] != "open":
            raise HTTPException(
                status_code=400, detail="Este caso no tiene reportes pendientes."
            )

        case = update_case(case, {
            "status": "reviewed",
            "counting_since": now_iso()
        })
        record_action(str(case["id"]), "reviewed", str(admin_user["id"]), note=note)
        return {"message": "Caso revisado", "case": serialize_cases([case])[0]}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400, detail=fribuk().public_error_detail(error)
        )
