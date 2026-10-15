# Pruebas de las notificaciones push.
#
# No envían avisos de verdad: el envío se reemplaza por una función que
# anota lo que se habría mandado. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import json
import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import push  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
READER_ID = str(uuid.uuid4())
STORY_ID = str(uuid.uuid4())

VAPID_ENV = {
    "VAPID_PUBLIC_KEY": "clave-publica",
    "VAPID_PRIVATE_KEY": "clave-privada",
    "VAPID_SUBJECT": "mailto:hola@fribuk.com",
}


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


def comment_on_story():
    # Un comentario: una notificación sin agrupar.
    main.create_notification(
        AUTHOR_ID, "story_comment", actor_user_id=READER_ID, story_id=STORY_ID,
        data={"story_title": "Luna"},
    )


def subscription(endpoint="https://push.example.com/abc"):
    return {"endpoint": endpoint, "keys": {"p256dh": "clave", "auth": "secreto"}}


class PushTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [
                {"id": AUTHOR_ID, "username": "autora", "role": "user"},
                {"id": READER_ID, "username": "lectora", "role": "user"},
            ],
            "notifications": [],
            "push_subscriptions": [],
        }
        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (AUTHOR_ID, READER_ID)
        }

        self.originals = (
            main.supabase_admin, main.supabase_public,
            push.run_in_background, push.send_webpush,
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))

        # Los envíos se hacen en el acto y solo se anotan.
        self.sent = []
        self.gone = set()

        def fake_send(device, payload, _settings):
            self.sent.append((device["endpoint"], json.loads(payload)))
            return 410 if device["endpoint"] in self.gone else None

        push.run_in_background = lambda task, *args: task(*args)
        push.send_webpush = fake_send

        self.env = mock.patch.dict(os.environ, VAPID_ENV)
        self.env.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.env.stop()
        (
            main.supabase_admin, main.supabase_public,
            push.run_in_background, push.send_webpush,
        ) = self.originals

    def subscribe(self, user_id=AUTHOR_ID, body=None):
        return self.client.post(
            "/push/subscriptions", json=body or subscription(), headers=auth_header(user_id)
        )

    # ---------- suscripciones ----------

    def test_public_key_is_shared_only_when_configured(self):
        self.assertEqual(self.client.get("/push/public-key").json(), {"public_key": "clave-publica"})

        with mock.patch.dict(os.environ, {"VAPID_PRIVATE_KEY": ""}):
            self.assertEqual(self.client.get("/push/public-key").json(), {"public_key": None})

    def test_subscribing_saves_the_device(self):
        self.assertEqual(self.subscribe().status_code, 200)

        rows = self.database.tables["push_subscriptions"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["user_id"], AUTHOR_ID)
        self.assertEqual(rows[0]["p256dh"], "clave")

    def test_the_same_browser_moves_to_the_account_that_logs_in(self):
        self.subscribe(AUTHOR_ID)
        self.subscribe(READER_ID)

        rows = self.database.tables["push_subscriptions"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["user_id"], READER_ID)

    def test_invalid_endpoints_are_rejected(self):
        for endpoint in ("http://push.example.com/abc", "no-es-una-url", "https://" + "a" * 2000):
            response = self.subscribe(body=subscription(endpoint))
            self.assertEqual(response.status_code, 400, endpoint)
        self.assertEqual(self.database.tables["push_subscriptions"], [])

    def test_subscribing_without_keys_configured_is_refused(self):
        with mock.patch.dict(os.environ, {"VAPID_PRIVATE_KEY": ""}):
            self.assertEqual(self.subscribe().status_code, 503)

    def test_only_the_owner_can_remove_a_device(self):
        self.subscribe(AUTHOR_ID)

        self.client.post(
            "/push/unsubscribe", json={"endpoint": subscription()["endpoint"]},
            headers=auth_header(READER_ID),
        )
        self.assertEqual(len(self.database.tables["push_subscriptions"]), 1)

        self.client.post(
            "/push/unsubscribe", json={"endpoint": subscription()["endpoint"]},
            headers=auth_header(AUTHOR_ID),
        )
        self.assertEqual(self.database.tables["push_subscriptions"], [])

    def test_old_devices_are_dropped_after_the_limit(self):
        for number in range(push.MAX_SUBSCRIPTIONS_PER_USER + 2):
            self.subscribe(body=subscription(f"https://push.example.com/{number}"))

        self.assertEqual(
            len(self.database.tables["push_subscriptions"]), push.MAX_SUBSCRIPTIONS_PER_USER
        )

    # ---------- envío ----------

    def test_a_new_notification_reaches_every_device_of_the_recipient(self):
        self.subscribe(AUTHOR_ID, subscription("https://push.example.com/telefono"))
        self.subscribe(AUTHOR_ID, subscription("https://push.example.com/computador"))
        self.subscribe(READER_ID, subscription("https://push.example.com/otra"))

        comment_on_story()

        endpoints = sorted(endpoint for endpoint, _ in self.sent)
        self.assertEqual(endpoints, [
            "https://push.example.com/computador", "https://push.example.com/telefono",
        ])
        payload = self.sent[0][1]
        self.assertEqual(payload["body"], "@lectora comentó tu historia «Luna».")
        self.assertEqual(payload["url"], f"/stories/{STORY_ID}")

    def test_nothing_is_sent_without_keys(self):
        self.subscribe(AUTHOR_ID)

        with mock.patch.dict(os.environ, {"VAPID_PRIVATE_KEY": ""}):
            comment_on_story()

        self.assertEqual(self.sent, [])
        self.assertEqual(len(self.database.tables["notifications"]), 1)

    def test_expired_devices_are_forgotten(self):
        self.subscribe(AUTHOR_ID)
        self.gone.add(subscription()["endpoint"])

        comment_on_story()

        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.database.tables["push_subscriptions"], [])

    def test_a_private_message_reaches_the_recipient(self):
        self.subscribe(AUTHOR_ID)

        push.send_private_message(AUTHOR_ID, READER_ID, "Hola,   me encantó\n tu historia " + "!" * 200)

        self.assertEqual(len(self.sent), 1)
        payload = self.sent[0][1]
        self.assertEqual(payload["title"], "Mensaje de @lectora")
        self.assertTrue(payload["body"].startswith("Hola, me encantó tu historia !"))
        self.assertEqual(len(payload["body"]), push.MESSAGE_PREVIEW_LENGTH)
        self.assertEqual(payload["url"], f"/mensajes/privados/{READER_ID}")
        self.assertEqual(payload["tag"], f"mensaje-{READER_ID}")

    def test_a_private_message_to_someone_without_devices_sends_nothing(self):
        push.send_private_message(AUTHOR_ID, READER_ID, "Hola")
        self.assertEqual(self.sent, [])

    # ---------- textos ----------

    def test_messages_match_the_activity_center(self):
        cases = [
            (
                {"type": "story_comment", "story_id": "s", "actor_user_id": "a",
                 "data": {"chapter_id": "c", "chapter_title": "Uno", "story_title": "Luna"}},
                "@may comentó «Uno» de tu historia «Luna».", "/stories/s/chapters/c",
            ),
            (
                {"type": "story_vote", "story_id": "s", "actor_user_id": "a", "actor_count": 3,
                 "data": {"story_title": "Luna"}},
                "@may y 2 personas más recomendaron tu historia «Luna».", "/stories/s",
            ),
            (
                {"type": "story_chapter", "story_id": "s", "chapter_id": "c",
                 "data": {"story_title": "Luna", "chapter_number": 4, "chapter_title": "Eclipse"}},
                "Nuevo capítulo de «Luna»: Capítulo 4 · Eclipse.", "/stories/s/chapters/c",
            ),
            (
                {"type": "forum_reply", "forum_topic_id": "t", "actor_user_id": "a",
                 "data": {"topic_title": "Ayuda", "mention": True}},
                "@may te mencionó en el tema «Ayuda».", "/forum/t",
            ),
            (
                {"type": "support_status", "data": {"status": "resolved"}},
                "Tu solicitud de soporte ahora está resuelta.", "/support",
            ),
        ]
        for row, body, url in cases:
            message = push.notification_message(row, "may")
            self.assertEqual(message, {"body": body, "url": url})


if __name__ == "__main__":
    unittest.main()
