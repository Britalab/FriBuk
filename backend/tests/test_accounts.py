# Pruebas de la eliminación de cuentas desde administración.
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
from test_chapter_comments import FakeAuth, FakeDatabase, auth_header  # noqa: E402
from test_moderation import SingleRowQuery  # noqa: E402

ADMIN_ID = str(uuid.uuid4())
OTHER_ADMIN_ID = str(uuid.uuid4())
PAULA_ID = str(uuid.uuid4())
BOB_ID = str(uuid.uuid4())

PAULA_STORY_ID = str(uuid.uuid4())
BOB_STORY_ID = str(uuid.uuid4())
PAULA_CHAPTER_ID = str(uuid.uuid4())
BOB_CHAPTER_ID = str(uuid.uuid4())
PAULA_LIST_ID = str(uuid.uuid4())
BOB_LIST_ID = str(uuid.uuid4())
CONVERSATION_ID = str(uuid.uuid4())
OTHER_CONVERSATION_ID = str(uuid.uuid4())


class AccountsDatabase(FakeDatabase):
    # La comprobación de administrador usa .single().
    def table(self, table_name):
        return SingleRowQuery(self, table_name)


class FakeAuthAdmin:
    def __init__(self):
        self.updates = []
        self.fail = False

    def update_user_by_id(self, user_id, attributes):
        if self.fail:
            raise RuntimeError("Supabase no responde")
        self.updates.append((user_id, attributes))


class FakeBucket:
    def __init__(self, files):
        self.files = files
        self.removed = []

    def list(self, folder):
        prefix = f"{folder}/"
        return [
            {"name": path[len(prefix):]} for path in self.files
            if path.startswith(prefix) and "/" not in path[len(prefix):]
        ]

    def remove(self, paths):
        self.removed.extend(paths)
        self.files = [path for path in self.files if path not in paths]


def row(**values):
    return {"id": str(uuid.uuid4()), **values}


class AccountDeletionTestCase(unittest.TestCase):
    def setUp(self):
        self.database = AccountsDatabase()
        self.database.tables = {
            "users": [
                {"id": ADMIN_ID, "username": "equipo", "role": "admin"},
                {"id": OTHER_ADMIN_ID, "username": "otra_admin", "role": "admin"},
                {"id": PAULA_ID, "username": "paula", "role": "user"},
                {"id": BOB_ID, "username": "bob", "role": "user"}
            ],
            "stories": [
                {"id": PAULA_STORY_ID, "author_id": PAULA_ID, "title": "De Paula"},
                {"id": BOB_STORY_ID, "author_id": BOB_ID, "title": "De Bob"}
            ],
            "chapters": [
                {"id": PAULA_CHAPTER_ID, "story_id": PAULA_STORY_ID},
                {"id": BOB_CHAPTER_ID, "story_id": BOB_STORY_ID}
            ],
            "story_tags": [row(story_id=PAULA_STORY_ID), row(story_id=BOB_STORY_ID)],
            # Comentarios en historias: los de la historia de Paula se van con
            # ella; el que Paula dejó en la historia de Bob se conserva.
            "comments": [
                row(story_id=PAULA_STORY_ID, user_id=BOB_ID),
                row(story_id=BOB_STORY_ID, user_id=PAULA_ID)
            ],
            "votes": [
                row(story_id=PAULA_STORY_ID, user_id=BOB_ID),
                row(story_id=BOB_STORY_ID, user_id=PAULA_ID),
                row(story_id=BOB_STORY_ID, user_id=ADMIN_ID)
            ],
            "ratings": [
                row(story_id=BOB_STORY_ID, user_id=PAULA_ID),
                row(story_id=BOB_STORY_ID, user_id=ADMIN_ID)
            ],
            "favorites": [
                row(story_id=PAULA_STORY_ID, user_id=BOB_ID),
                row(story_id=BOB_STORY_ID, user_id=PAULA_ID)
            ],
            "reading_progress": [
                row(story_id=PAULA_STORY_ID, user_id=BOB_ID),
                row(story_id=BOB_STORY_ID, user_id=PAULA_ID),
                row(story_id=BOB_STORY_ID, user_id=ADMIN_ID)
            ],
            "reading_lists": [
                {"id": PAULA_LIST_ID, "user_id": PAULA_ID},
                {"id": BOB_LIST_ID, "user_id": BOB_ID}
            ],
            "reading_list_stories": [
                row(list_id=PAULA_LIST_ID, story_id=BOB_STORY_ID),
                row(list_id=BOB_LIST_ID, story_id=PAULA_STORY_ID),
                row(list_id=BOB_LIST_ID, story_id=BOB_STORY_ID)
            ],
            "private_conversations": [
                {"id": CONVERSATION_ID, "user_low": BOB_ID, "user_high": PAULA_ID},
                {"id": OTHER_CONVERSATION_ID, "user_low": ADMIN_ID, "user_high": BOB_ID}
            ],
            "private_messages": [
                row(conversation_id=CONVERSATION_ID, sender_id=PAULA_ID),
                row(conversation_id=CONVERSATION_ID, sender_id=BOB_ID),
                row(conversation_id=OTHER_CONVERSATION_ID, sender_id=BOB_ID)
            ],
            "user_follows": [
                row(follower_id=PAULA_ID, following_id=BOB_ID),
                row(follower_id=BOB_ID, following_id=PAULA_ID),
                row(follower_id=ADMIN_ID, following_id=BOB_ID)
            ],
            "user_blocks": [
                row(blocker_id=PAULA_ID, blocked_id=BOB_ID),
                row(blocker_id=ADMIN_ID, blocked_id=BOB_ID)
            ],
            "notifications": [
                row(recipient_user_id=PAULA_ID, actor_user_id=BOB_ID, story_id=None),
                row(recipient_user_id=BOB_ID, actor_user_id=PAULA_ID, story_id=None),
                row(recipient_user_id=BOB_ID, actor_user_id=ADMIN_ID,
                    story_id=PAULA_STORY_ID),
                row(recipient_user_id=BOB_ID, actor_user_id=ADMIN_ID, story_id=None)
            ],
            "forum_interactions": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "chapter_comment_reactions": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "author_posts": [row(author_id=PAULA_ID), row(author_id=BOB_ID)],
            "author_post_replies": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "author_channel_reads": [
                row(user_id=PAULA_ID, author_id=BOB_ID),
                row(user_id=BOB_ID, author_id=PAULA_ID),
                row(user_id=ADMIN_ID, author_id=BOB_ID)
            ],
            "message_settings": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "profile_customizations": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "user_profiles": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "terms_acceptances": [
                row(user_id=PAULA_ID, email="paula@example.com"),
                row(user_id=BOB_ID, email="bob@example.com")
            ],
            # Lo que se conserva: participación en conversaciones de otros.
            "forum_topics": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "forum_replies": [row(user_id=PAULA_ID), row(user_id=BOB_ID)],
            "chapter_comments": [
                row(chapter_id=BOB_CHAPTER_ID, user_id=PAULA_ID),
                row(chapter_id=BOB_CHAPTER_ID, user_id=BOB_ID)
            ],
            "support_requests": [row(user_id=PAULA_ID)]
        }

        self.auth_admin = FakeAuthAdmin()
        self.bucket = FakeBucket([
            f"avatars/{PAULA_ID}/avatar",
            f"banners/{PAULA_ID}/banner",
            f"{PAULA_ID}/portada-1.jpg",
            f"{PAULA_ID}/portada-2.jpg",
            f"avatars/{BOB_ID}/avatar",
            f"{BOB_ID}/portada.jpg",
            "site/home-banner"
        ])
        self.database.auth = SimpleNamespace(admin=self.auth_admin)
        self.database.storage = SimpleNamespace(from_=lambda bucket: self.bucket)

        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@example.com",
                                     user_metadata={})
            for user_id in (ADMIN_ID, OTHER_ADMIN_ID, PAULA_ID, BOB_ID)
        }
        self.originals = (main.supabase_admin, main.supabase_public)
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public = self.originals

    # ---------- utilidades ----------

    def delete(self, user_id=PAULA_ID, confirm="paula", admin_id=ADMIN_ID):
        return self.client.post(
            f"/admin/accounts/{user_id}/delete",
            json={"confirm_username": confirm},
            headers=auth_header(admin_id)
        )

    def rows(self, table):
        return self.database.tables[table]

    def user(self, user_id):
        return next(item for item in self.rows("users") if item["id"] == user_id)

    def snapshot(self):
        return {
            table: [dict(item) for item in rows]
            for table, rows in self.database.tables.items()
        }

    # ---------- quién puede ----------

    def test_only_admins_can_delete_accounts(self):
        before = self.snapshot()

        self.assertEqual(self.delete(admin_id=BOB_ID).status_code, 403)
        self.assertEqual(self.delete(admin_id=PAULA_ID).status_code, 403)
        self.assertIn(
            self.client.post(
                f"/admin/accounts/{PAULA_ID}/delete", json={"confirm_username": "paula"}
            ).status_code,
            (401, 403)
        )
        self.assertIn(
            self.client.get(
                f"/admin/accounts/{PAULA_ID}", headers=auth_header(BOB_ID)
            ).status_code,
            (401, 403)
        )

        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.auth_admin.updates, [])

    def test_username_must_be_typed_to_confirm(self):
        before = self.snapshot()

        for wrong in ("", "bob", "Paula", "paul"):
            self.assertEqual(self.delete(confirm=wrong).status_code, 400, wrong)

        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.auth_admin.updates, [])

    def test_admin_accounts_cannot_be_deleted(self):
        before = self.snapshot()

        own = self.delete(user_id=ADMIN_ID, confirm="equipo")
        self.assertEqual(own.status_code, 400)
        other = self.delete(user_id=OTHER_ADMIN_ID, confirm="otra_admin")
        self.assertEqual(other.status_code, 400)

        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.auth_admin.updates, [])

    def test_unknown_accounts(self):
        for user_id in (str(uuid.uuid4()), "no-es-un-id"):
            self.assertEqual(self.delete(user_id=user_id).status_code, 404)

    # ---------- qué se borra y qué queda ----------

    def test_summary_before_deleting(self):
        response = self.client.get(
            f"/admin/accounts/{PAULA_ID}", headers=auth_header(ADMIN_ID)
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {
            "id": PAULA_ID, "username": "paula", "role": "user",
            "is_deleted": False, "is_self": False, "stories": 1
        })

    def test_account_loses_access_and_personal_data(self):
        response = self.delete()
        self.assertEqual(response.status_code, 200, response.text)

        body = response.json()
        self.assertEqual(body["previous_username"], "paula")
        self.assertEqual(body["stories_deleted"], 1)
        self.assertEqual(body["problems"], [])

        # Acceso: sin correo ni contraseña conocidos, y bloqueado.
        self.assertEqual(len(self.auth_admin.updates), 1)
        user_id, attributes = self.auth_admin.updates[0]
        self.assertEqual(user_id, PAULA_ID)
        self.assertTrue(attributes["email"].endswith("@eliminado.fribuk.com"))
        self.assertNotIn(PAULA_ID, attributes["email"])
        self.assertGreaterEqual(len(attributes["password"]), 32)
        self.assertEqual(attributes["user_metadata"], {})
        self.assertEqual(attributes["ban_duration"], "876000h")

        # La fila se conserva vacía, con un nombre que no la identifica.
        account = self.user(PAULA_ID)
        self.assertTrue(account["username"].startswith("eliminado_"))
        self.assertEqual(account["username"], body["deleted_username"])
        self.assertNotIn("paula", account["username"])

        # Sus imágenes, y solo las suyas.
        self.assertEqual(sorted(self.bucket.files), sorted([
            f"avatars/{BOB_ID}/avatar", f"{BOB_ID}/portada.jpg", "site/home-banner"
        ]))

    def test_own_content_is_deleted(self):
        self.assertEqual(self.delete().status_code, 200)

        self.assertEqual([s["id"] for s in self.rows("stories")], [BOB_STORY_ID])
        self.assertEqual([c["id"] for c in self.rows("chapters")], [BOB_CHAPTER_ID])
        self.assertEqual([l["id"] for l in self.rows("reading_lists")], [BOB_LIST_ID])
        self.assertEqual(
            [c["id"] for c in self.rows("private_conversations")],
            [OTHER_CONVERSATION_ID]
        )

        # Nada de las demás tablas sigue apuntando a Paula ni a su historia.
        for table in (
            "story_tags", "votes", "ratings", "favorites", "reading_progress",
            "reading_list_stories", "private_messages", "user_follows",
            "user_blocks", "notifications", "forum_interactions",
            "chapter_comment_reactions", "author_posts", "author_post_replies",
            "author_channel_reads", "message_settings", "profile_customizations",
            "user_profiles", "terms_acceptances"
        ):
            for item in self.rows(table):
                self.assertNotIn(PAULA_ID, item.values(), table)
                self.assertNotIn(PAULA_STORY_ID, item.values(), table)
                self.assertNotIn(PAULA_LIST_ID, item.values(), table)
                self.assertNotIn(CONVERSATION_ID, item.values(), table)

    def test_other_people_keep_everything(self):
        self.assertEqual(self.delete().status_code, 200)

        expected = {
            "story_tags": 1, "votes": 1, "ratings": 1, "favorites": 0,
            "reading_progress": 1, "reading_list_stories": 1,
            "private_messages": 1, "user_follows": 1, "user_blocks": 1,
            "notifications": 1, "forum_interactions": 1,
            "chapter_comment_reactions": 1, "author_posts": 1,
            "author_post_replies": 1, "author_channel_reads": 1,
            "message_settings": 1, "profile_customizations": 1,
            "user_profiles": 1, "terms_acceptances": 1
        }
        for table, count in expected.items():
            self.assertEqual(len(self.rows(table)), count, table)

        self.assertEqual(self.user(BOB_ID)["username"], "bob")
        self.assertEqual(self.user(ADMIN_ID)["role"], "admin")

    def test_participation_in_other_conversations_is_kept(self):
        self.assertEqual(self.delete().status_code, 200)

        # Temas y respuestas del foro, y comentarios en historias ajenas.
        self.assertEqual(len(self.rows("forum_topics")), 2)
        self.assertEqual(len(self.rows("forum_replies")), 2)
        self.assertEqual(len(self.rows("chapter_comments")), 2)
        self.assertEqual(
            [(c["story_id"], c["user_id"]) for c in self.rows("comments")],
            [(BOB_STORY_ID, PAULA_ID)]
        )
        # La solicitud de soporte queda como registro de administración.
        self.assertEqual(len(self.rows("support_requests")), 1)

    # ---------- fallos ----------

    def test_nothing_is_deleted_if_access_cannot_be_closed(self):
        before = self.snapshot()
        self.auth_admin.fail = True

        response = self.delete()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("Supabase", response.text)

        self.assertEqual(self.snapshot(), before)
        self.assertEqual(len(self.bucket.files), 7)

    def test_a_failed_step_is_reported_and_does_not_stop_the_rest(self):
        def broken_remove(_paths):
            raise RuntimeError("almacenamiento caído")

        self.bucket.remove = broken_remove

        response = self.delete()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["problems"], ["imágenes"])

        # El resto se completó igual.
        self.assertEqual([s["id"] for s in self.rows("stories")], [BOB_STORY_ID])
        self.assertTrue(self.user(PAULA_ID)["username"].startswith("eliminado_"))

    def test_deleted_account_cannot_be_deleted_twice(self):
        deleted_username = self.delete().json()["deleted_username"]

        again = self.delete(confirm=deleted_username)
        self.assertEqual(again.status_code, 400)
        self.assertEqual(len(self.auth_admin.updates), 1)

    def test_deleted_prefix_cannot_be_registered(self):
        from fastapi import HTTPException

        for username in ("eliminado_abc", "Eliminado_x1"):
            with self.assertRaises(HTTPException):
                main.clean_username(username)
        self.assertEqual(main.clean_username("paula_2"), "paula_2")


if __name__ == "__main__":
    unittest.main()
