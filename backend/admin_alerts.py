# Avisos por correo a la administración de FriBuk.
#
# Se envían cuando pasa algo que requiere revisión: un contenido reportado
# por la comunidad, un retiro automático por alto número de reportes o una
# solicitud de soporte. El detalle sigue estando en el panel de
# administración; el correo solo avisa y lleva al panel.
#
# También avisa a quien envió un reporte o una solicitud cuando el equipo
# ya la revisó. Ese correo no dice qué se decidió ni admite respuestas: sale
# de una dirección que no recibe correo, para que no se convierta en un chat.
#
# Los avisos salen en segundo plano y nunca hacen fallar ni retrasan la
# acción que los origina.

import os
import threading
import time
from collections import deque

from email_service import send_admin_alert, send_report_reviewed

ADMIN_PANEL_PATH = "/support/admin"

# Tope de avisos por hora, para que una ola de reportes no agote el envío
# de correos ni llene la bandeja. Lo que no se avisa sigue en el panel.
ALERT_RATE_LIMIT = (30, 3600)
# Los destinatarios se consultan cada tanto, no en cada aviso.
RECIPIENTS_TTL_SECONDS = 300
ALERT_TEXT_LENGTH = 400

HELP_CENTER_PATH = "/support"
# Tope de correos por hora a quienes reportaron.
REVIEWED_RATE_LIMIT = (60, 3600)
# Cómo se nombra cada tipo de contenido en el correo a quien lo reportó.
REPORTED_CONTENT_TEXT = {
    "forum_topic": "un tema del foro",
    "forum_reply": "una respuesta del foro",
    "avatar": "una foto de perfil",
    "profile_banner": "un banner de perfil",
    "story_cover": "la portada de una historia"
}

reviewed_timestamps: deque = deque()

alert_timestamps: deque = deque()
alert_lock = threading.Lock()
recipients_cache: tuple[float, list[str]] | None = None


def fribuk():
    # main.py importa este módulo, así que aquí se resuelve en cada llamada.
    import main
    return main


def excerpt(value) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= ALERT_TEXT_LENGTH:
        return text
    return text[:ALERT_TEXT_LENGTH - 1].rstrip() + "…"


def admin_panel_url() -> str:
    # Dirección pública del sitio: el primer origen permitido que no sea local.
    origins = fribuk().CORS_ALLOWED_ORIGINS
    base = next((item for item in origins if "localhost" not in item), origins[0])
    return base + ADMIN_PANEL_PATH


def alert_recipients() -> list[str]:
    # Por defecto, el correo de cada cuenta administradora. La variable
    # ADMIN_ALERT_EMAIL (una o varias direcciones separadas por comas) lo
    # reemplaza si se quiere avisar a otra dirección.
    global recipients_cache

    configured = [
        item.strip() for item in os.getenv("ADMIN_ALERT_EMAIL", "").split(",")
        if item.strip()
    ]
    if configured:
        return configured

    cached = recipients_cache
    if cached and cached[0] > time.monotonic():
        return cached[1]

    main = fribuk()
    admins = (
        main.supabase_admin
        .table("users")
        .select("id")
        .eq("role", "admin")
        .execute()
    ).data or []

    emails = []
    for admin in admins:
        try:
            auth_user = main.supabase_admin.auth.admin.get_user_by_id(
                str(admin["id"])
            ).user
            if auth_user and auth_user.email:
                emails.append(auth_user.email)
        except Exception as error:
            print("No se pudo leer el correo de una cuenta admin:", repr(error))

    recipients_cache = (time.monotonic() + RECIPIENTS_TTL_SECONDS, emails)
    return emails


def within_alert_limit() -> bool:
    limit, window = ALERT_RATE_LIMIT
    now = time.monotonic()

    with alert_lock:
        while alert_timestamps and now - alert_timestamps[0] > window:
            alert_timestamps.popleft()
        if len(alert_timestamps) >= limit:
            return False
        alert_timestamps.append(now)
        return True


def deliver_alert(subject: str, lines: list[str]) -> None:
    if not within_alert_limit():
        print("Aviso a la administración omitido por el tope por hora:", subject)
        return

    recipients = alert_recipients()
    if not recipients:
        print("No hay a quién avisar: ninguna cuenta admin con correo.")
        return

    send_admin_alert(recipients, subject, lines, admin_panel_url())


def schedule(task, *args) -> None:
    # El aviso se arma y se envía en segundo plano.
    try:
        fribuk().run_notification_task(task, *args)
    except Exception as error:
        print("No se pudo programar el aviso a la administración:", repr(error))


def owner_username(owner_id) -> str | None:
    if not owner_id:
        return None
    try:
        cards = fribuk().get_follow_user_cards([str(owner_id)])
        return cards[0].get("username") if cards else None
    except Exception:
        return None


# ============================================================
# AVISOS
# ============================================================

def content_lines(case: dict, target_label: str) -> list[str]:
    snapshot = case.get("snapshot") or {}
    lines = [f"Contenido: {target_label}"]

    username = owner_username(case.get("owner_id"))
    if username:
        lines.append(f"Publicado por: @{username}")
    if snapshot.get("title"):
        lines.append(f"Título: {excerpt(snapshot['title'])}")
    if snapshot.get("text"):
        lines.append(f"Texto: {excerpt(snapshot['text'])}")
    if snapshot.get("image_url") or snapshot.get("evidence_url"):
        lines.append("Incluye una imagen: mírala desde el panel.")

    return lines


def deliver_new_report(
    case: dict, target_label: str, reason_label: str, details: str | None
) -> None:
    lines = content_lines(case, target_label)
    lines.append(f"Motivo del reporte: {reason_label}")
    if details:
        lines.append(f"Explicación: {excerpt(details)}")
    lines.append(f"Reportes recibidos hasta ahora: {case.get('report_count') or 1}")
    lines.append("El contenido sigue visible hasta que lo revises.")

    deliver_alert(f"Nuevo reporte: {target_label}", lines)


def deliver_automatic_removal(case: dict, target_label: str) -> None:
    lines = content_lines(case, target_label)
    lines.append(f"Reportes recibidos: {case.get('report_count') or 0}")
    lines.append(
        "Se retiró automáticamente por alto número de reportes. Revísalo: "
        "si el retiro no corresponde, puedes restaurarlo desde el panel."
    )

    deliver_alert(f"Retiro automático: {target_label}", lines)


def deliver_support_request(category: str | None, message: str | None) -> None:
    lines = [f"Categoría: {excerpt(category) or 'Sin categoría'}"]
    if message:
        lines.append(f"Mensaje: {excerpt(message)}")

    deliver_alert("Nueva solicitud de soporte", lines)


def alert_new_report(
    case: dict, target_label: str, reason_label: str, details: str | None
) -> None:
    schedule(deliver_new_report, case, target_label, reason_label, details)


def alert_automatic_removal(case: dict, target_label: str) -> None:
    schedule(deliver_automatic_removal, case, target_label)


def alert_support_request(category: str | None, message: str | None) -> None:
    schedule(deliver_support_request, category, message)


# ============================================================
# AVISOS A QUIEN REPORTÓ
# ============================================================

def site_url(path: str) -> str:
    origins = fribuk().CORS_ALLOWED_ORIGINS
    base = next((item for item in origins if "localhost" not in item), origins[0])
    return base + path


def within_reviewed_limit() -> bool:
    limit, window = REVIEWED_RATE_LIMIT
    now = time.monotonic()

    with alert_lock:
        while reviewed_timestamps and now - reviewed_timestamps[0] > window:
            reviewed_timestamps.popleft()
        if len(reviewed_timestamps) >= limit:
            return False
        reviewed_timestamps.append(now)
        return True


def account_email(user_id) -> str | None:
    try:
        auth_user = fribuk().supabase_admin.auth.admin.get_user_by_id(
            str(user_id)
        ).user
        return auth_user.email if auth_user else None
    except Exception as error:
        print("No se pudo leer el correo de una cuenta:", repr(error))
        return None


def deliver_reviewed(user_ids, what: str) -> None:
    for user_id in dict.fromkeys(str(item) for item in user_ids if item):
        if not within_reviewed_limit():
            print("Aviso de reporte revisado omitido por el tope por hora.")
            return

        email = account_email(user_id)
        if email:
            send_report_reviewed(email, what, site_url(HELP_CENTER_PATH))


def deliver_content_reports_reviewed(case_id: str, target_type: str, since) -> None:
    # Avisa a quienes reportaron después de `since`: los anteriores ya
    # recibieron su aviso en una revisión previa.
    reports = (
        fribuk().supabase_admin
        .table("content_reports")
        .select("reporter_id, created_at")
        .eq("case_id", case_id)
        .execute()
    ).data or []

    reporters = [
        report["reporter_id"] for report in reports
        if not since or str(report.get("created_at") or "") > str(since)
    ]
    content = REPORTED_CONTENT_TEXT.get(target_type, "un contenido")
    deliver_reviewed(reporters, f"el reporte que enviaste sobre {content}")


def notify_content_reports_reviewed(case_id: str, target_type: str, since) -> None:
    schedule(deliver_content_reports_reviewed, case_id, target_type, since)


def deliver_support_reviewed(user_id, category: str | None) -> None:
    kind = excerpt(category)
    deliver_reviewed([user_id], f"tu solicitud «{kind}»" if kind else "tu solicitud")
