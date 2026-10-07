# Pruebas de los avisos por correo a la administración.
#
# No envían correos reales: reemplazan el envío y ejecutan en el momento
# las tareas que normalmente corren en segundo plano. Ejecutar desde la
# carpeta backend:
#
#     python -m unittest discover -s tests

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import admin_alerts  # noqa: E402
import email_service  # noqa: E402
import main  # noqa: E402
import messages  # noqa: E402
import moderation  # noqa: E402
from test_chapter_comments import FakeAuth  # noqa: E402
from test_moderation import ModerationDatabase  # noqa: E402

OWNER_ID = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())
REPORTER_IDS = [str(uuid.uuid4()) for _ in range(6)]
TOPIC_ID = str(uuid.uuid4())
XSS_TEXT = '<script>alert("x")</script><a href="https://malo.example">clic</a>'


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


class AdminAlertsTestCase(unittest.TestCase):
    def setUp(self):
        old = datetime.now(timezone.utc) - timedelta(days=30)

        def user(user_id, username, email):
            return SimpleNamespace(
                id=user_id, email=email,
                user_metadata={"username": username}, created_at=old
            )

        self.users = {
            OWNER_ID: user(OWNER_ID, "autora", "autora@example.com"),
            ADMIN_ID: user(ADMIN_ID, "equipo_fribuk", "admin@example.com")
        }
        for index, user_id in enumerate(REPORTER_IDS):
            self.users[user_id] = user(user_id, f"lector{index}", f"l{index}@example.com")

        self.database = ModerationDatabase(self.users)
        self.database.tables = {
            "users": [
                {
                    "id": user_id,
                    "username": account.user_metadata["username"],
                    "role": "admin" if user_id == ADMIN_ID else "user"
                }
                for user_id, account in self.users.items()
            ],
            "forum_topics": [{
                "id": TOPIC_ID, "user_id": OWNER_ID, "title": "Mi tema",
                "content": "Contenido del tema", "image_url": None,
                "created_at": "2026-01-01T10:00:00+00:00"
            }],
            "forum_replies": [],
            "user_follows": [],
            "user_blocks": [],
            "message_settings": [],
            "private_conversations": [],
            "private_messages": [],
            "moderation_cases": [],
            "content_reports": [],
            "moderation_actions": [],
            "support_requests": []
        }

        self.sent = []
        self.originals = (
            main.supabase_admin, main.supabase_public, main.run_notification_task,
            admin_alerts.send_admin_alert, list(main.CORS_ALLOWED_ORIGINS),
            os.environ.pop("ADMIN_ALERT_EMAIL", None)
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(self.users))
        # Las tareas en segundo plano se ejecutan en el momento.
        main.run_notification_task = lambda task, *args: task(*args)
        main.CORS_ALLOWED_ORIGINS[:] = [
            "http://localhost:5173", "https://www.fribuk.com"
        ]
        admin_alerts.send_admin_alert = (
            lambda recipients, subject, lines, panel_url: self.sent.append({
                "to": recipients, "subject": subject,
                "lines": lines, "panel_url": panel_url
            })
        )
        admin_alerts.alert_timestamps.clear()
        admin_alerts.recipients_cache = None
        moderation.report_requests.clear()
        messages.message_requests.clear()

        self.client = TestClient(main.app)

    def tearDown(self):
        (
            main.supabase_admin, main.supabase_public, main.run_notification_task,
            admin_alerts.send_admin_alert, origins, alert_email
        ) = self.originals
        main.CORS_ALLOWED_ORIGINS[:] = origins
        os.environ.pop("ADMIN_ALERT_EMAIL", None)
        if alert_email is not None:
            os.environ["ADMIN_ALERT_EMAIL"] = alert_email
        admin_alerts.recipients_cache = None

    def report(self, user_id, reason="sexual", details=None):
        return self.client.post(
            "/moderation/reports",
            json={
                "target_type": "forum_topic", "target_id": TOPIC_ID,
                "reason": reason, "details": details
            },
            headers=auth_header(user_id)
        )

    # ---------- reportes ----------

    def test_new_report_alerts_the_admin_account(self):
        response = self.report(REPORTER_IDS[0], reason="other", details="Mira la imagen")
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(len(self.sent), 1)
        alert = self.sent[0]
        self.assertEqual(alert["to"], ["admin@example.com"])
        self.assertEqual(alert["subject"], "Nuevo reporte: Tema del foro")
        self.assertEqual(alert["panel_url"], "https://www.fribuk.com/support/admin")

        text = "\n".join(alert["lines"])
        self.assertIn("Publicado por: @autora", text)
        self.assertIn("Título: Mi tema", text)
        self.assertIn("Motivo del reporte: Otro", text)
        self.assertIn("Explicación: Mira la imagen", text)
        # El aviso no dice quién reportó.
        self.assertNotIn(REPORTER_IDS[0], text)
        self.assertNotIn("lector0", text)

    def test_rejected_reports_do_not_alert(self):
        self.report(REPORTER_IDS[0])
        self.assertEqual(self.report(REPORTER_IDS[0]).status_code, 409)
        self.assertEqual(self.report(OWNER_ID).status_code, 400)
        self.assertEqual(self.report(REPORTER_IDS[1], reason="aburrido").status_code, 400)

        self.assertEqual(len(self.sent), 1)

    def test_automatic_removal_sends_its_own_alert(self):
        for user_id in REPORTER_IDS[:5]:
            self.assertEqual(self.report(user_id).status_code, 200)

        subjects = [alert["subject"] for alert in self.sent]
        self.assertEqual(
            subjects,
            ["Nuevo reporte: Tema del foro"] * 4 + ["Retiro automático: Tema del foro"]
        )

        text = "\n".join(self.sent[-1]["lines"])
        self.assertIn("Reportes recibidos: 5", text)
        self.assertIn("puedes restaurarlo desde el panel", text)

    # ---------- soporte ----------

    def test_support_request_alerts_the_admin(self):
        response = self.client.post(
            "/support",
            json={"category": "Problema técnico", "message": "No puedo subir mi portada"},
            headers=auth_header(OWNER_ID)
        )
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]["subject"], "Nueva solicitud de soporte")
        text = "\n".join(self.sent[0]["lines"])
        self.assertIn("Categoría: Problema técnico", text)
        self.assertIn("Mensaje: No puedo subir mi portada", text)

    def test_private_message_report_alerts_the_admin(self):
        self.client.post(
            f"/messages/private/{OWNER_ID}", json={"content": "Mensaje molesto"},
            headers=auth_header(REPORTER_IDS[0])
        )
        response = self.client.post(
            f"/messages/private/{REPORTER_IDS[0]}/report",
            json={"reason": "Me está insultando"},
            headers=auth_header(OWNER_ID)
        )
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]["subject"], "Nueva solicitud de soporte")
        text = "\n".join(self.sent[0]["lines"])
        self.assertIn("Reporte de mensaje privado", text)
        self.assertIn("Me está insultando", text)

    # ---------- aviso a quien reportó ----------

    def use_reviewed_spy(self):
        self.reviewed = []
        self.original_reviewed = admin_alerts.send_report_reviewed
        admin_alerts.send_report_reviewed = (
            lambda email, what, help_url: self.reviewed.append((email, what, help_url))
        )
        admin_alerts.reviewed_timestamps.clear()
        self.addCleanup(
            setattr, admin_alerts, "send_report_reviewed", self.original_reviewed
        )

    def admin_post(self, path, body=None):
        return self.client.post(path, json=body or {}, headers=auth_header(ADMIN_ID))

    def case_id(self):
        return self.database.tables["moderation_cases"][0]["id"]

    def test_reporters_get_an_email_when_the_admin_removes_the_content(self):
        self.use_reviewed_spy()
        self.report(REPORTER_IDS[0])
        self.report(REPORTER_IDS[1])
        self.assertEqual(self.reviewed, [])

        removed = self.admin_post("/moderation/remove", {
            "target_type": "forum_topic", "target_id": TOPIC_ID, "reason": "sexual"
        })
        self.assertEqual(removed.status_code, 200, removed.text)

        self.assertEqual(
            sorted(email for email, _what, _url in self.reviewed),
            ["l0@example.com", "l1@example.com"]
        )
        _email, what, help_url = self.reviewed[0]
        self.assertEqual(what, "el reporte que enviaste sobre un tema del foro")
        self.assertEqual(help_url, "https://www.fribuk.com/support")

        # Restaurar después no les repite el aviso.
        self.admin_post(f"/moderation/cases/{self.case_id()}/restore")
        self.assertEqual(len(self.reviewed), 2)

    def test_reporters_get_an_email_when_reports_are_marked_reviewed(self):
        self.use_reviewed_spy()
        self.report(REPORTER_IDS[0])
        self.admin_post(f"/moderation/cases/{self.case_id()}/review")
        self.assertEqual([email for email, *_ in self.reviewed], ["l0@example.com"])

        # Un reporte posterior avisa solo a quien lo envió.
        self.report(REPORTER_IDS[1])
        self.admin_post(f"/moderation/cases/{self.case_id()}/review")
        self.assertEqual(
            [email for email, *_ in self.reviewed],
            ["l0@example.com", "l1@example.com"]
        )

    def test_automatic_removal_waits_for_the_admin_review(self):
        self.use_reviewed_spy()
        for user_id in REPORTER_IDS[:5]:
            self.report(user_id)

        # El retiro automático todavía no es una revisión.
        self.assertEqual(self.reviewed, [])

        self.admin_post(f"/moderation/cases/{self.case_id()}/restore")
        self.assertEqual(len(self.reviewed), 5)

    def test_owner_and_strangers_are_not_emailed(self):
        self.use_reviewed_spy()
        self.report(REPORTER_IDS[0])
        self.admin_post(f"/moderation/cases/{self.case_id()}/review")

        emails = [email for email, *_ in self.reviewed]
        self.assertNotIn("autora@example.com", emails)
        self.assertNotIn("admin@example.com", emails)

    def test_resolving_a_support_request_emails_the_requester_once(self):
        self.use_reviewed_spy()
        ticket_id = str(uuid.uuid4())
        self.database.tables["support_requests"].append({
            "id": ticket_id, "user_id": OWNER_ID, "category": "Problema técnico",
            "message": "No puedo subir mi portada", "status": "pending"
        })
        self.database.tables["notifications"] = []

        # La base de datos real fecha cada notificación al crearla.
        original_new_row = self.database.new_row

        def new_row(table_name, payload):
            row = original_new_row(table_name, payload)
            if table_name == "notifications":
                row.setdefault("created_at", self.database.clock.isoformat())
            return row

        self.database.new_row = new_row

        def set_status(status):
            return self.client.patch(
                f"/support/admin/{ticket_id}/status",
                json={"status": status}, headers=auth_header(ADMIN_ID)
            )

        self.assertEqual(set_status("in_review").status_code, 200)
        self.assertEqual(self.reviewed, [])

        self.assertEqual(set_status("resolved").status_code, 200)
        self.assertEqual(
            self.reviewed,
            [(
                "autora@example.com", "tu solicitud «Problema técnico»",
                "https://www.fribuk.com/support"
            )]
        )

        # Guardar otra vez el mismo estado no repite el correo.
        set_status("resolved")
        self.assertEqual(len(self.reviewed), 1)

    def test_reviewed_email_does_not_invite_replies_and_escapes_text(self):
        captured = {}
        original_send = email_service.resend.Emails.send
        email_service.resend.Emails.send = lambda payload: captured.update(payload)

        try:
            sent = email_service.send_report_reviewed(
                "lectora@example.com", f"tu solicitud «{XSS_TEXT}»",
                "https://www.fribuk.com/support"
            )
        finally:
            email_service.resend.Emails.send = original_send

        self.assertTrue(sent)
        self.assertEqual(captured["to"], ["lectora@example.com"])
        self.assertEqual(captured["subject"], "Revisamos tu reporte en FriBuk")
        self.assertIn("no recibe mensajes", captured["html"])
        self.assertIn("https://www.fribuk.com/support", captured["html"])
        self.assertNotIn("<script>", captured["html"])
        # No se indica una dirección a la que responder.
        self.assertNotIn("reply_to", captured)

    # ---------- destinatarios y límites ----------

    def test_alert_address_can_be_overridden(self):
        os.environ["ADMIN_ALERT_EMAIL"] = "avisos@example.com, otra@example.com"

        self.report(REPORTER_IDS[0])

        self.assertEqual(self.sent[0]["to"], ["avisos@example.com", "otra@example.com"])

    def test_without_admins_nothing_is_sent_and_the_report_still_works(self):
        for row in self.database.tables["users"]:
            row["role"] = "user"

        self.assertEqual(self.report(REPORTER_IDS[0]).status_code, 200)
        self.assertEqual(self.sent, [])
        self.assertEqual(len(self.database.tables["content_reports"]), 1)

    def test_email_failure_never_breaks_the_report(self):
        def failing(*_args):
            raise RuntimeError("Resend no responde")

        admin_alerts.send_admin_alert = failing
        # Con la ejecución real en segundo plano, el fallo queda contenido.
        main.run_notification_task = self.originals[2]

        response = self.report(REPORTER_IDS[0])

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(self.database.tables["content_reports"]), 1)

    def test_alerts_are_capped_per_hour(self):
        limit = admin_alerts.ALERT_RATE_LIMIT[0]

        for index in range(limit + 5):
            admin_alerts.deliver_support_request("Prueba", f"Mensaje {index}")

        self.assertEqual(len(self.sent), limit)

    def test_alert_email_escapes_user_text(self):
        captured = {}
        original_send = email_service.resend.Emails.send
        email_service.resend.Emails.send = lambda payload: captured.update(payload)

        try:
            sent = email_service.send_admin_alert(
                ["admin@example.com"], "Nuevo reporte",
                [f"Texto: {XSS_TEXT}"], "https://www.fribuk.com/support/admin"
            )
        finally:
            email_service.resend.Emails.send = original_send

        self.assertTrue(sent)
        self.assertEqual(captured["to"], ["admin@example.com"])
        self.assertEqual(captured["subject"], "[FriBuk] Nuevo reporte")
        self.assertNotIn("<script>", captured["html"])
        self.assertNotIn('href="https://malo.example"', captured["html"])
        self.assertIn("&lt;script&gt;", captured["html"])


if __name__ == "__main__":
    unittest.main()
