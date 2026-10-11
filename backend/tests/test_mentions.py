# Pruebas de las menciones con @ en comentarios y en el foro.
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import mentions  # noqa: E402
from test_chapter_comments import FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
ALICE_ID = str(uuid.uuid4())
BOB_ID = str(uuid.uuid4())
CARLA_ID = str(uuid.uuid4())
GONE_ID = str(uuid.uuid4())
STORY_ID = str(uuid.uuid4())
CHAPTER_ID = str(uuid.uuid4())
TOPIC_ID = str(uuid.uuid4())


class MentionsTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [
                {"id": AUTHOR_ID, "username": "autora"},
                {"id": ALICE_ID, "username": "alice"},
                {"id": BOB_ID, "username": "bob.lee"},
                {"id": CARLA_ID, "username": "carla"},
                {"id": GONE_ID, "username": "eliminado_ab12cd34"}
            ],
            "stories": [{"id": STORY_ID, "author_id": AUTHOR_ID, "title": "La historia"}],
            "chapters": [{"id": CHAPTER_ID, "story_id": STORY_ID, "title": "Uno"}],
            "forum_topics": [{"id": TOPIC_ID, "user_id": AUTHOR_ID, "title": "Un tema"}],
            "user_blocks": [],
            "notifications": []
        }
        self.original = main.supabase_admin
        main.supabase_admin = self.database
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin = self.original

    def notified(self):
        return [
            (row["recipient_user_id"], row["type"], row["data"])
            for row in self.database.tables["notifications"]
        ]

    # ---------- reconocer menciones ----------

    def test_names_are_read_from_the_text(self):
        self.assertEqual(
            mentions.mentioned_names("Hola @alice, mira esto @bob.lee. ¿Y @carla?"),
            ["alice", "bob.lee.", "carla"]
        )
        # Sin repetir, y un correo no es una mención.
        self.assertEqual(mentions.mentioned_names("@alice @alice"), ["alice"])
        self.assertEqual(mentions.mentioned_names("escribe a ana@correo.com"), [])
        self.assertEqual(mentions.mentioned_names("@ sola, @ab muy corta"), [])
        self.assertEqual(mentions.mentioned_names(None), [])

    def test_only_a_few_mentions_count_per_text(self):
        text = " ".join(f"@usuario{number}" for number in range(12))
        self.assertEqual(len(mentions.mentioned_names(text)), 5)

    def test_names_are_matched_to_real_accounts(self):
        found = mentions.find_users(["alice", "bob.lee.", "nadie", "eliminado_ab12cd34"])

        # El punto final de la frase no impide encontrar a bob.lee.
        self.assertEqual(
            {name: row["id"] for name, row in found.items()},
            {"alice": ALICE_ID, "bob.lee.": BOB_ID}
        )

    # ---------- avisos ----------

    def test_chapter_comment_mention_notifies_who_is_named(self):
        mentions.notify_chapter_comment_mentions(
            CHAPTER_ID, ALICE_ID, "Mira esto @bob.lee. y @nadie"
        )

        self.assertEqual(self.notified(), [(BOB_ID, "story_comment", {
            "story_title": "La historia",
            "chapter_id": CHAPTER_ID,
            "chapter_title": "Uno",
            "mention": True
        })])
        row = self.database.tables["notifications"][0]
        self.assertEqual(row["actor_user_id"], ALICE_ID)
        self.assertEqual(row["story_id"], STORY_ID)

    def test_nobody_is_notified_twice_or_by_themselves(self):
        mentions.notify_chapter_comment_mentions(
            CHAPTER_ID, ALICE_ID, "@alice @carla @carla @autora"
        )

        # Alice se nombra a sí misma; la autora ya recibe el aviso del
        # comentario; Carla aparece dos veces.
        self.assertEqual([item[0] for item in self.notified()], [CARLA_ID])

    def test_forum_mention_notifies_who_is_named(self):
        mentions.notify_forum_mentions(TOPIC_ID, ALICE_ID, "¿Qué opinas, @carla?")

        self.assertEqual(self.notified(), [(CARLA_ID, "forum_reply", {
            "topic_title": "Un tema", "mention": True
        })])
        self.assertEqual(
            self.database.tables["notifications"][0]["forum_topic_id"], TOPIC_ID
        )

    def test_blocked_people_are_not_notified(self):
        for blocker, blocked in ((CARLA_ID, ALICE_ID), (ALICE_ID, BOB_ID)):
            self.database.tables["user_blocks"].append(
                {"blocker_id": blocker, "blocked_id": blocked}
            )

        mentions.notify_forum_mentions(TOPIC_ID, ALICE_ID, "@carla @bob.lee")
        self.assertEqual(self.notified(), [])

    def test_text_without_mentions_does_nothing(self):
        mentions.notify_forum_mentions(TOPIC_ID, ALICE_ID, "Sin nombrar a nadie.")
        mentions.notify_chapter_comment_mentions(CHAPTER_ID, ALICE_ID, None)
        self.assertEqual(self.notified(), [])

    # ---------- enlace al perfil ----------

    def test_profile_lookup_by_username(self):
        response = self.client.get("/users/by-username/bob.lee")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"id": BOB_ID, "username": "bob.lee"})

        # Con el punto final de la frase incluido.
        self.assertEqual(
            self.client.get("/users/by-username/alice.").json()["id"], ALICE_ID
        )

    def test_profile_lookup_hides_unknown_and_deleted_accounts(self):
        for username in ("nadie", "eliminado_ab12cd34", "x", "a b c", "%25"):
            response = self.client.get(f"/users/by-username/{username}")
            self.assertEqual(response.status_code, 404, username)


if __name__ == "__main__":
    unittest.main()
