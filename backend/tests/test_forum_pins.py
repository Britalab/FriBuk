# Pruebas de los temas fijados del foro (anuncios).
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase  # noqa: E402
from test_moderation import SingleRowQuery  # noqa: E402

ADMIN_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
OLD_TOPIC = str(uuid.uuid4())
MIDDLE_TOPIC = str(uuid.uuid4())
NEW_TOPIC = str(uuid.uuid4())


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


class PinsDatabase(FakeDatabase):
    # La comprobación de administrador usa .single().
    def table(self, table_name):
        return SingleRowQuery(self, table_name)


class ForumPinsTestCase(unittest.TestCase):
    def setUp(self):
        self.database = PinsDatabase()

        def topic(topic_id, title, created_at):
            return {
                "id": topic_id, "user_id": USER_ID, "title": title,
                "content": "Texto", "image_url": None,
                "created_at": created_at, "pinned_at": None
            }

        self.database.tables = {
            "users": [
                {"id": ADMIN_ID, "username": "admin", "role": "admin"},
                {"id": USER_ID, "username": "lectora", "role": "user"}
            ],
            "forum_topics": [
                topic(OLD_TOPIC, "Antiguo", "2026-01-01T00:00:00+00:00"),
                topic(MIDDLE_TOPIC, "Intermedio", "2026-02-01T00:00:00+00:00"),
                topic(NEW_TOPIC, "Nuevo", "2026-03-01T00:00:00+00:00")
            ],
            "moderation_cases": []
        }

        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (ADMIN_ID, USER_ID)
        }

        self.originals = (
            main.supabase_admin, main.supabase_public, main.add_forum_user_data
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(
            auth=FakeAuth(users), table=self.database.table
        )
        # Los nombres y fotos de quien publica no son parte de estas pruebas.
        main.add_forum_user_data = lambda items: items
        self.client = TestClient(main.app)

    def tearDown(self):
        (
            main.supabase_admin, main.supabase_public, main.add_forum_user_data
        ) = self.originals

    def titles(self):
        response = self.client.get("/forum/topics")
        self.assertEqual(response.status_code, 200)
        return [topic["title"] for topic in response.json()]

    def pin(self, topic_id, user_id=ADMIN_ID):
        return self.client.put(
            f"/forum/topics/{topic_id}/pin", headers=auth_header(user_id)
        )

    def unpin(self, topic_id, user_id=ADMIN_ID):
        return self.client.delete(
            f"/forum/topics/{topic_id}/pin", headers=auth_header(user_id)
        )

    def test_without_pins_the_newest_topic_goes_first(self):
        self.assertEqual(self.titles(), ["Nuevo", "Intermedio", "Antiguo"])

    def test_pinned_topic_goes_first(self):
        response = self.pin(OLD_TOPIC)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["pinned_at"])
        self.assertEqual(self.titles(), ["Antiguo", "Nuevo", "Intermedio"])

    def test_latest_pin_goes_above_earlier_pins(self):
        self.pin(OLD_TOPIC)
        # Fijado después: queda arriba del anterior.
        self.database.tables["forum_topics"][1]["pinned_at"] = "2999-01-01T00:00:00+00:00"

        self.assertEqual(self.titles(), ["Intermedio", "Antiguo", "Nuevo"])

    def test_unpinning_returns_the_topic_to_its_place(self):
        self.pin(OLD_TOPIC)

        response = self.unpin(OLD_TOPIC)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["pinned_at"])
        self.assertEqual(self.titles(), ["Nuevo", "Intermedio", "Antiguo"])

    def test_only_admins_can_pin_or_unpin(self):
        self.assertEqual(self.pin(OLD_TOPIC, user_id=USER_ID).status_code, 403)
        self.assertEqual(self.titles(), ["Nuevo", "Intermedio", "Antiguo"])

        self.pin(OLD_TOPIC)
        self.assertEqual(self.unpin(OLD_TOPIC, user_id=USER_ID).status_code, 403)
        self.assertEqual(self.titles()[0], "Antiguo")

    def test_anonymous_cannot_pin(self):
        response = self.client.put(f"/forum/topics/{OLD_TOPIC}/pin")

        self.assertIn(response.status_code, (401, 403))

    def test_missing_topic_is_not_found(self):
        self.assertEqual(self.pin(str(uuid.uuid4())).status_code, 404)


if __name__ == "__main__":
    unittest.main()
