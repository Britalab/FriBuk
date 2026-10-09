# Pruebas de los comentarios anclados al texto de los capítulos.
#
# No usan la base de datos real: reemplazan los clientes de Supabase por
# una versión en memoria. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import copy
import sys
import typing
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from chapter_anchors import (  # noqa: E402
    ANCHOR_CONTEXT_LENGTH,
    build_anchor,
    locate_anchor,
)


# ============================================================
# SUPABASE EN MEMORIA
# ============================================================

class FakeQuery:
    def __init__(self, database, table_name):
        self.database = database
        self.table_name = table_name
        self.action = "select"
        self.payload = None
        self.on_conflict = None
        self.filters = []
        self.orders = []
        self.row_range = None
        self.row_limit = None

    def select(self, *_columns):
        return self

    def insert(self, payload):
        self.action, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.action, self.payload = "update", payload
        return self

    def upsert(self, payload, on_conflict=None, **_options):
        self.action, self.payload, self.on_conflict = "upsert", payload, on_conflict
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, column, value):
        self.filters.append(lambda row: str(row.get(column)) == str(value))
        return self

    def in_(self, column, values):
        allowed = {str(value) for value in values}
        self.filters.append(lambda row: str(row.get(column)) in allowed)
        return self

    def is_(self, column, _value):
        self.filters.append(lambda row: row.get(column) is None)
        return self

    def order(self, column, desc=False):
        self.orders.append((column, desc))
        return self

    def range(self, start, end):
        self.row_range = (start, end)
        return self

    def limit(self, count):
        self.row_limit = count
        return self

    def single(self):
        return self

    def execute(self):
        self.database.executed.append((self.table_name, self.action))
        rows = self.database.tables.setdefault(self.table_name, [])

        if self.action == "insert":
            row = self.database.new_row(self.table_name, self.payload)
            rows.append(row)
            return SimpleNamespace(data=[copy.deepcopy(row)])

        if self.action == "upsert":
            keys = [key.strip() for key in self.on_conflict.split(",")]
            for row in rows:
                if all(str(row.get(key)) == str(self.payload[key]) for key in keys):
                    row.update(self.payload)
                    return SimpleNamespace(data=[copy.deepcopy(row)])
            row = self.database.new_row(self.table_name, self.payload)
            rows.append(row)
            return SimpleNamespace(data=[copy.deepcopy(row)])

        matched = [row for row in rows if all(check(row) for check in self.filters)]

        if self.action == "update":
            for row in matched:
                row.update(self.payload)
            return SimpleNamespace(data=copy.deepcopy(matched))

        if self.action == "delete":
            for row in matched:
                self.database.delete_row(self.table_name, row)
            return SimpleNamespace(data=copy.deepcopy(matched))

        for column, desc in reversed(self.orders):
            matched.sort(key=lambda row: str(row.get(column)), reverse=desc)
        if self.row_range:
            matched = matched[self.row_range[0]:self.row_range[1] + 1]
        if self.row_limit is not None:
            matched = matched[:self.row_limit]

        return SimpleNamespace(data=copy.deepcopy(matched))


class FakeDatabase:
    def __init__(self):
        self.tables = {}
        self.executed = []
        self.clock = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def table(self, table_name):
        return FakeQuery(self, table_name)

    def new_row(self, table_name, payload):
        row = dict(payload)
        self.clock += timedelta(seconds=1)

        if table_name == "chapter_comments":
            row.setdefault("id", str(uuid.uuid4()))
            row.setdefault("parent_id", None)
            row.setdefault("is_orphaned", False)
            row.setdefault("status", "visible")
            row.setdefault("edited_at", None)
            row.setdefault("created_at", self.clock.isoformat())

        return row

    def delete_row(self, table_name, row):
        # Igual que ON DELETE CASCADE en la base de datos real.
        self.tables[table_name].remove(row)

        if table_name == "chapter_comments":
            for reply in [
                item for item in self.tables.get("chapter_comments", [])
                if item.get("parent_id") == row["id"]
            ]:
                self.delete_row("chapter_comments", reply)
            self.tables["chapter_comment_reactions"] = [
                item for item in self.tables.get("chapter_comment_reactions", [])
                if item.get("comment_id") != row["id"]
            ]


class FakeAuth:
    def __init__(self, users):
        self.users = users

    def get_user(self, token):
        return SimpleNamespace(user=self.users.get(token))


# ============================================================
# DATOS DE PRUEBA
# ============================================================

AUTHOR_ID = str(uuid.uuid4())
ALICE_ID = str(uuid.uuid4())
BOB_ID = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())

STORY_ID = str(uuid.uuid4())
DRAFT_STORY_ID = str(uuid.uuid4())
CHAPTER_ID = str(uuid.uuid4())
OTHER_CHAPTER_ID = str(uuid.uuid4())
DRAFT_CHAPTER_ID = str(uuid.uuid4())
HIDDEN_CHAPTER_ID = str(uuid.uuid4())

CONTENT = "\n".join([
    "Era una tarde tranquila en el pueblo de San Rafael.",
    "",
    "Juanito le dijo que sí.",
    "María no supo qué responder y miró hacia la ventana abierta.",
    "—Sí.",
    "El perro ladró dos veces 🐶 antes de salir corriendo.",
    "—Sí."
])

QUOTE = "Juanito le dijo que sí."
# Los comentarios se hacen sobre el párrafo completo.
MARIA = "María no supo qué responder y miró hacia la ventana abierta."


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


def anchor_payload(paragraph_index, quote, content=CONTENT, text="Buen fragmento"):
    paragraph = content.split("\n")[paragraph_index]
    start = paragraph.index(quote)
    return {
        "content": text,
        "paragraph_index": paragraph_index,
        "start_offset": start,
        "end_offset": start + len(quote),
        "quote": quote
    }


class ChapterCommentsTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [
                {"id": AUTHOR_ID, "username": "autora", "role": "user"},
                {"id": ALICE_ID, "username": "alice", "role": "user"},
                {"id": BOB_ID, "username": "bob", "role": "user"},
                {"id": ADMIN_ID, "username": "moderadora", "role": "admin"}
            ],
            "stories": [
                {"id": STORY_ID, "author_id": AUTHOR_ID, "status": "published"},
                {"id": DRAFT_STORY_ID, "author_id": AUTHOR_ID, "status": "draft"}
            ],
            "chapters": [
                {
                    "id": CHAPTER_ID, "story_id": STORY_ID, "chapter_number": 1,
                    "title": "Uno", "content": CONTENT, "status": "published"
                },
                {
                    "id": OTHER_CHAPTER_ID, "story_id": STORY_ID, "chapter_number": 2,
                    "title": "Dos", "content": CONTENT, "status": "published"
                },
                {
                    "id": DRAFT_CHAPTER_ID, "story_id": STORY_ID, "chapter_number": 3,
                    "title": "Tres", "content": CONTENT, "status": "draft"
                },
                {
                    "id": HIDDEN_CHAPTER_ID, "story_id": DRAFT_STORY_ID,
                    "chapter_number": 1, "title": "Oculto", "content": CONTENT,
                    "status": "published"
                }
            ],
            "chapter_comments": [],
            "chapter_comment_reactions": [],
            "forum_interactions": [
                {"id": "f1", "user_id": ALICE_ID, "kind": "reaction", "value": "blush"}
            ]
        }

        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (AUTHOR_ID, ALICE_ID, BOB_ID, ADMIN_ID)
        }

        self.originals = (
            main.supabase_admin, main.supabase_public, main.run_notification_task
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        main.run_notification_task = lambda *args, **kwargs: None
        main.chapter_comment_requests.clear()

        self.client = TestClient(main.app)

    def tearDown(self):
        (
            main.supabase_admin, main.supabase_public, main.run_notification_task
        ) = self.originals

    # ---------- utilidades ----------

    def create_comment(self, user_id=ALICE_ID, chapter_id=CHAPTER_ID, **payload):
        body = payload or anchor_payload(2, QUOTE)
        return self.client.post(
            f"/chapters/{chapter_id}/comments", json=body, headers=auth_header(user_id)
        )

    def create_comment_id(self, *args, **kwargs):
        response = self.create_comment(*args, **kwargs)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["comment"]["id"]

    def get_comments(self, user_id=None, chapter_id=CHAPTER_ID):
        headers = auth_header(user_id) if user_id else {}
        return self.client.get(f"/chapters/{chapter_id}/comments", headers=headers)

    def stored(self, comment_id):
        return next(
            row for row in self.database.tables["chapter_comments"]
            if row["id"] == comment_id
        )

    def edit_chapter(self, content, user_id=AUTHOR_ID):
        return self.client.put(
            f"/chapters/{CHAPTER_ID}",
            json={"chapter_number": 1, "title": "Uno", "content": content},
            headers=auth_header(user_id)
        )

    # ---------- comentarios generales del capítulo ----------

    def test_general_comment_needs_no_fragment(self):
        response = self.create_comment(content="Me encantó el capítulo", general=True)
        self.assertEqual(response.status_code, 200, response.text)

        comment = response.json()["comment"]
        self.assertTrue(comment["is_general"])
        self.assertIsNone(comment["paragraph_index"])
        self.assertIsNone(comment["quote"])

        row = self.stored(comment["id"])
        for field in ("paragraph_index", "start_offset", "end_offset", "quote"):
            self.assertIsNone(row[field])

    def test_general_and_paragraph_comments_are_told_apart(self):
        general_id = self.create_comment_id(content="En general, bien", general=True)
        paragraph_id = self.create_comment_id()

        listed = {
            comment["id"]: comment
            for comment in self.get_comments().json()["comments"]
        }
        self.assertTrue(listed[general_id]["is_general"])
        self.assertFalse(listed[paragraph_id]["is_general"])

    def test_general_comment_accepts_replies(self):
        general_id = self.create_comment_id(content="Qué final", general=True)
        reply = self.create_comment(
            user_id=BOB_ID, content="Totalmente", parent_id=general_id
        )
        self.assertEqual(reply.status_code, 200, reply.text)
        # Una respuesta no es un comentario general por sí misma.
        self.assertFalse(reply.json()["comment"]["is_general"])

    def test_general_comment_survives_chapter_edits(self):
        general_id = self.create_comment_id(content="Gran capítulo", general=True)

        response = self.edit_chapter("Un texto completamente nuevo.")
        self.assertEqual(response.status_code, 200, response.text)

        self.assertFalse(self.stored(general_id).get("is_orphaned"))
        listed = self.get_comments().json()["comments"]
        self.assertEqual([comment["id"] for comment in listed], [general_id])
        self.assertFalse(listed[0]["is_orphaned"])

    def test_general_comment_follows_the_usual_rules(self):
        # Sin sesión, sin texto o en un capítulo no publicado: no se acepta.
        anonymous = self.client.post(
            f"/chapters/{CHAPTER_ID}/comments",
            json={"content": "Hola", "general": True}
        )
        self.assertIn(anonymous.status_code, (401, 403))
        self.assertEqual(
            self.create_comment(content="   ", general=True).status_code, 400
        )
        self.assertEqual(
            self.create_comment(
                chapter_id=DRAFT_CHAPTER_ID, content="Hola", general=True
            ).status_code,
            404
        )
        # Sin marcarlo como general, sigue haciendo falta el párrafo.
        self.assertEqual(self.create_comment(content="Hola").status_code, 400)

    # ---------- crear ----------

    def test_authenticated_user_can_comment(self):
        response = self.create_comment()
        self.assertEqual(response.status_code, 200, response.text)

        comment = response.json()["comment"]
        self.assertEqual(comment["username"], "alice")
        self.assertEqual(comment["quote"], QUOTE)
        self.assertEqual(comment["paragraph_index"], 2)
        self.assertTrue(comment["can_edit"])
        self.assertTrue(comment["can_delete"])

    def test_anonymous_user_cannot_comment(self):
        response = self.client.post(
            f"/chapters/{CHAPTER_ID}/comments", json=anchor_payload(2, QUOTE)
        )
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.database.tables["chapter_comments"], [])

    def test_invalid_token_cannot_comment(self):
        response = self.client.post(
            f"/chapters/{CHAPTER_ID}/comments",
            json=anchor_payload(2, QUOTE),
            headers=auth_header("token-falso")
        )
        self.assertEqual(response.status_code, 401)

    def test_anchor_is_built_from_the_stored_text(self):
        comment_id = self.create_comment_id(**anchor_payload(3, MARIA))
        row = self.stored(comment_id)
        paragraph = CONTENT.split("\n")[3]

        self.assertEqual(paragraph[row["start_offset"]:row["end_offset"]], MARIA)
        self.assertEqual(row["quote"], MARIA)
        self.assertTrue(row["prefix"].endswith("que sí.\n"))
        self.assertTrue(row["suffix"].startswith("\n—Sí."))
        self.assertEqual(row["user_id"], ALICE_ID)

    def test_only_whole_paragraphs_can_be_commented(self):
        # Una palabra o una frase suelta no se acepta, aunque exista.
        for fragment in ("María", "miró hacia la ventana"):
            response = self.create_comment(**anchor_payload(3, fragment))
            self.assertEqual(response.status_code, 409, response.text)

        self.assertEqual(self.database.tables["chapter_comments"], [])

    def test_positions_sent_by_the_browser_are_ignored(self):
        response = self.create_comment(
            content="Hola", paragraph_index=3, start_offset=0, end_offset=5,
            quote=MARIA
        )
        self.assertEqual(response.status_code, 200, response.text)

        comment = response.json()["comment"]
        self.assertEqual(comment["quote"], MARIA)
        self.assertEqual(
            (comment["start_offset"], comment["end_offset"]), (0, len(MARIA))
        )

    def test_empty_paragraph_cannot_be_commented(self):
        response = self.create_comment(content="Hola", paragraph_index=1, quote="x")
        self.assertEqual(response.status_code, 409)

    def test_paragraph_is_quoted_without_surrounding_spaces(self):
        self.database.tables["chapters"][0]["content"] = "   Hola, mundo.  "
        response = self.create_comment(
            content="Hola", paragraph_index=0, quote="  Hola, mundo. "
        )
        self.assertEqual(response.status_code, 200, response.text)

        comment = response.json()["comment"]
        self.assertEqual(comment["quote"], "Hola, mundo.")
        self.assertEqual((comment["start_offset"], comment["end_offset"]), (3, 15))

    def test_offsets_count_unicode_characters(self):
        paragraph = CONTENT.split("\n")[5]
        comment_id = self.create_comment_id(**anchor_payload(5, paragraph))
        row = self.stored(comment_id)
        self.assertEqual((row["start_offset"], row["end_offset"]), (0, len(paragraph)))

    def test_stale_selection_is_rejected(self):
        payload = anchor_payload(2, QUOTE)
        payload["quote"] = "Juanito le dijo que no."
        self.assertEqual(self.create_comment(**payload).status_code, 409)

        payload = anchor_payload(2, QUOTE)
        payload["paragraph_index"] = 99
        self.assertEqual(self.create_comment(**payload).status_code, 409)

    def test_comment_requires_fragment_and_text(self):
        self.assertEqual(self.create_comment(content="Sin fragmento").status_code, 400)

        payload = anchor_payload(2, QUOTE, text="   ")
        self.assertEqual(self.create_comment(**payload).status_code, 400)

        payload = anchor_payload(2, QUOTE, text="x" * 1001)
        self.assertEqual(self.create_comment(**payload).status_code, 400)

    def test_long_paragraph_is_quoted_from_its_start(self):
        # La cita guardada tiene un máximo: de un párrafo más largo se
        # cita el comienzo, sin partir una palabra.
        long_paragraph = " ".join(["palabra"] * 120)
        self.database.tables["chapters"][0]["content"] = long_paragraph
        expected = " ".join(["palabra"] * 75)

        response = self.create_comment(
            content="Muy largo", paragraph_index=0, quote=expected
        )
        self.assertEqual(response.status_code, 200, response.text)

        comment = response.json()["comment"]
        self.assertEqual(comment["quote"], expected)
        self.assertLessEqual(len(comment["quote"]), 600)

        # El párrafo completo supera el máximo: no es la cita válida.
        response = self.create_comment(
            content="Muy largo", paragraph_index=0, quote=long_paragraph
        )
        self.assertEqual(response.status_code, 409)

    def test_only_published_visible_chapters_accept_comments(self):
        for chapter_id in (DRAFT_CHAPTER_ID, HIDDEN_CHAPTER_ID, str(uuid.uuid4()), "abc"):
            response = self.create_comment(chapter_id=chapter_id)
            self.assertEqual(response.status_code, 404, chapter_id)

        # Ni siquiera la autora puede comentar un capítulo no visible.
        response = self.create_comment(user_id=AUTHOR_ID, chapter_id=DRAFT_CHAPTER_ID)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.database.tables["chapter_comments"], [])

    # ---------- leer ----------

    def test_comments_in_several_paragraphs(self):
        self.create_comment_id()
        self.create_comment_id(user_id=BOB_ID)
        self.create_comment_id(**anchor_payload(3, MARIA))

        response = self.get_comments()
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertFalse(data["can_comment"])
        self.assertFalse(data["can_moderate"])

        by_paragraph = {}
        for comment in data["comments"]:
            by_paragraph.setdefault(comment["paragraph_index"], []).append(comment)

        self.assertEqual(len(by_paragraph[2]), 2)
        self.assertEqual(len(by_paragraph[3]), 1)
        self.assertEqual({c["username"] for c in by_paragraph[2]}, {"alice", "bob"})
        self.assertTrue(all(not c["can_edit"] for c in data["comments"]))

    def test_reader_flags(self):
        comment_id = self.create_comment_id()

        alice = self.get_comments(ALICE_ID).json()
        self.assertTrue(alice["can_comment"])
        self.assertTrue(alice["comments"][0]["can_edit"])

        bob = self.get_comments(BOB_ID).json()
        self.assertFalse(bob["comments"][0]["can_edit"])
        self.assertFalse(bob["comments"][0]["can_delete"])

        admin = self.get_comments(ADMIN_ID).json()
        self.assertTrue(admin["can_moderate"])
        self.assertFalse(admin["comments"][0]["can_edit"])
        self.assertTrue(admin["comments"][0]["can_delete"])
        self.assertEqual(admin["comments"][0]["id"], comment_id)

    def test_hidden_chapters_do_not_expose_comments(self):
        self.assertEqual(self.get_comments(chapter_id=DRAFT_CHAPTER_ID).status_code, 404)
        self.assertEqual(self.get_comments(chapter_id=HIDDEN_CHAPTER_ID).status_code, 404)
        self.assertEqual(
            self.get_comments(ALICE_ID, HIDDEN_CHAPTER_ID).status_code, 404
        )
        self.assertEqual(self.get_comments(chapter_id="no-es-un-id").status_code, 404)

        author = self.get_comments(AUTHOR_ID, HIDDEN_CHAPTER_ID)
        self.assertEqual(author.status_code, 200)
        self.assertEqual(author.json()["comments"], [])
        self.assertFalse(author.json()["can_comment"])

    def test_loading_comments_does_not_query_per_comment(self):
        for index in range(12):
            user_id = ALICE_ID if index % 2 else BOB_ID
            comment_id = self.create_comment_id(user_id=user_id)
            self.react(comment_id, "heart", ALICE_ID)

        self.database.executed.clear()
        response = self.get_comments(ALICE_ID)
        self.assertEqual(len(response.json()["comments"]), 12)
        # capítulo, historia, comentarios, rol, reacciones y usuarios.
        self.assertLessEqual(len(self.database.executed), 6)

    # ---------- respuestas ----------

    def test_replies(self):
        parent_id = self.create_comment_id()
        response = self.create_comment(
            user_id=BOB_ID, content="De acuerdo", parent_id=parent_id
        )
        self.assertEqual(response.status_code, 200, response.text)

        reply = response.json()["comment"]
        self.assertEqual(reply["parent_id"], parent_id)
        self.assertIsNone(reply["quote"])
        self.assertIsNone(reply["paragraph_index"])

        comments = self.get_comments().json()["comments"]
        self.assertEqual([c["parent_id"] for c in comments], [None, parent_id])

    def test_replies_stay_one_level_deep_and_in_their_chapter(self):
        parent_id = self.create_comment_id()
        reply_id = self.create_comment_id(
            user_id=BOB_ID, content="Respuesta", parent_id=parent_id
        )

        nested = self.create_comment(content="Anidada", parent_id=reply_id)
        self.assertEqual(nested.status_code, 404)

        other_chapter = self.create_comment(
            chapter_id=OTHER_CHAPTER_ID, content="Otro capítulo", parent_id=parent_id
        )
        self.assertEqual(other_chapter.status_code, 404)

        missing = self.create_comment(content="Nada", parent_id=str(uuid.uuid4()))
        self.assertEqual(missing.status_code, 404)

    # ---------- editar y eliminar ----------

    def test_author_can_edit_own_comment(self):
        comment_id = self.create_comment_id()
        response = self.client.put(
            f"/chapter-comments/{comment_id}",
            json={"content": "Texto corregido"}, headers=auth_header(ALICE_ID)
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["comment"]["content"], "Texto corregido")
        self.assertIsNotNone(response.json()["comment"]["edited_at"])
        # Editar el texto no mueve el fragmento.
        self.assertEqual(self.stored(comment_id)["quote"], QUOTE)

    def test_others_cannot_edit_or_delete(self):
        comment_id = self.create_comment_id()

        for user_id in (BOB_ID, AUTHOR_ID, ADMIN_ID):
            response = self.client.put(
                f"/chapter-comments/{comment_id}",
                json={"content": "Suplantado"}, headers=auth_header(user_id)
            )
            self.assertEqual(response.status_code, 403, user_id)

        for user_id in (BOB_ID, AUTHOR_ID):
            response = self.client.delete(
                f"/chapter-comments/{comment_id}", headers=auth_header(user_id)
            )
            self.assertEqual(response.status_code, 403, user_id)

        self.assertIn(
            self.client.delete(f"/chapter-comments/{comment_id}").status_code,
            (401, 403)
        )
        self.assertEqual(self.stored(comment_id)["content"], "Buen fragmento")
        self.assertEqual(self.stored(comment_id)["status"], "visible")

    def test_author_delete_removes_replies_and_reactions(self):
        comment_id = self.create_comment_id()
        self.create_comment_id(user_id=BOB_ID, content="Respuesta", parent_id=comment_id)
        self.client.post(
            f"/chapter-comments/{comment_id}/reactions",
            json={"value": "fire"}, headers=auth_header(BOB_ID)
        )

        response = self.client.delete(
            f"/chapter-comments/{comment_id}", headers=auth_header(ALICE_ID)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.database.tables["chapter_comments"], [])
        self.assertEqual(self.database.tables["chapter_comment_reactions"], [])

    def test_moderation_hides_comment_and_replies(self):
        comment_id = self.create_comment_id()
        reply_id = self.create_comment_id(
            user_id=BOB_ID, content="Respuesta", parent_id=comment_id
        )

        response = self.client.delete(
            f"/chapter-comments/{comment_id}", headers=auth_header(ADMIN_ID)
        )
        self.assertEqual(response.status_code, 200)

        row = self.stored(comment_id)
        self.assertEqual(row["status"], "removed")
        self.assertEqual(row["removed_by"], ADMIN_ID)
        self.assertEqual(self.get_comments(ALICE_ID).json()["comments"], [])

        # Un comentario retirado ya no admite ninguna acción.
        for method, url, body in (
            ("put", f"/chapter-comments/{comment_id}", {"content": "x"}),
            ("post", f"/chapter-comments/{comment_id}/reactions", {"value": "heart"}),
            ("post", f"/chapter-comments/{reply_id}/reactions", {"value": "heart"}),
            ("put", f"/chapter-comments/{reply_id}", {"content": "x"})
        ):
            response = getattr(self.client, method)(
                url, json=body, headers=auth_header(BOB_ID)
            )
            self.assertEqual(response.status_code, 404, url)

    def test_unknown_comment_ids(self):
        for comment_id in (str(uuid.uuid4()), "1 or 1=1"):
            response = self.client.put(
                f"/chapter-comments/{comment_id}",
                json={"content": "x"}, headers=auth_header(ALICE_ID)
            )
            self.assertEqual(response.status_code, 404)

    # ---------- reacciones ----------

    def react(self, comment_id, reaction, user_id=BOB_ID):
        return self.client.post(
            f"/chapter-comments/{comment_id}/reactions",
            json={"value": reaction}, headers=auth_header(user_id)
        )

    def unreact(self, comment_id, reaction, user_id=BOB_ID):
        return self.client.delete(
            f"/chapter-comments/{comment_id}/reactions/{reaction}",
            headers=auth_header(user_id)
        )

    def test_all_eighteen_reactions(self):
        comment_id = self.create_comment_id()
        reactions = typing.get_args(main.ChapterCommentReactionValue)

        self.assertEqual(len(reactions), 18)
        self.assertEqual(reactions, main.CHAPTER_COMMENT_REACTIONS)

        for reaction in reactions:
            response = self.react(comment_id, reaction)
            self.assertEqual(response.status_code, 200, reaction)
            # Una reacción por usuario: la nueva reemplaza la anterior.
            self.assertEqual(response.json()["reactions"], {reaction: 1})
            self.assertEqual(response.json()["my_reaction"], reaction)

        self.assertEqual(len(self.database.tables["chapter_comment_reactions"]), 1)

    def test_one_reaction_per_user_and_comment(self):
        comment_id = self.create_comment_id()

        # Repetir la misma reacción no la duplica.
        for _ in range(3):
            response = self.react(comment_id, "laugh")
        self.assertEqual(response.json()["reactions"], {"laugh": 1})

        # Cambiar de reacción reemplaza la anterior.
        response = self.react(comment_id, "heart")
        self.assertEqual(response.json()["reactions"], {"heart": 1})
        self.assertEqual(response.json()["my_reaction"], "heart")
        self.assertEqual(len(self.database.tables["chapter_comment_reactions"]), 1)

        # El usuario puede reaccionar por separado en otro comentario.
        other_id = self.create_comment_id(**anchor_payload(3, MARIA))
        self.assertEqual(self.react(other_id, "fire").json()["reactions"], {"fire": 1})
        self.assertEqual(len(self.database.tables["chapter_comment_reactions"]), 2)

    def test_reaction_counts_and_removal(self):
        comment_id = self.create_comment_id()

        for user_id, reaction in ((ALICE_ID, "fire"), (BOB_ID, "fire"), (ADMIN_ID, "skull")):
            self.react(comment_id, reaction, user_id)

        comment = self.get_comments(BOB_ID).json()["comments"][0]
        self.assertEqual(comment["reactions"], {"fire": 2, "skull": 1})
        self.assertEqual(comment["my_reaction"], "fire")
        self.assertIsNone(self.get_comments().json()["comments"][0]["my_reaction"])

        # Quitar una reacción que no es la propia no cambia nada.
        response = self.unreact(comment_id, "skull")
        self.assertEqual(response.json()["reactions"], {"fire": 2, "skull": 1})

        response = self.unreact(comment_id, "fire")
        self.assertEqual(response.json()["reactions"], {"fire": 1, "skull": 1})
        self.assertIsNone(response.json()["my_reaction"])

        # Tras quitarla puede elegir otra.
        response = self.react(comment_id, "eyes")
        self.assertEqual(response.json()["my_reaction"], "eyes")

    def test_schema_allows_one_reaction_per_user_and_comment(self):
        sql = (
            Path(__file__).resolve().parent.parent / "sql" / "chapter_comments.sql"
        ).read_text(encoding="utf-8")
        table = sql[sql.index("create table public.chapter_comment_reactions"):]
        table = table[:table.index(");")]

        self.assertIn("primary key (comment_id, user_id)", table)
        self.assertNotIn("slot", sql)

    # ---------- emojis dentro del texto ----------

    def test_comment_text_accepts_up_to_twelve_emojis(self):
        for content in (
            "NO PUEDO " + "😂" * 12,
            "Me muero 😭😭😭😭😭",
            "QUÉEEEE 😱😱😱😱😱🔥🔥",
            "😂😂❤️🔥👀 mezcla ❤️❤️❤️ y más 😱😱😱😱",
            "Sin emojis, solo texto: ¡qué capítulo! :) <3"
        ):
            response = self.create_comment(**anchor_payload(2, QUOTE, text=content))
            self.assertEqual(response.status_code, 200, content)
            self.assertEqual(response.json()["comment"]["content"], content)
            main.chapter_comment_requests.clear()

    def test_comment_text_rejects_thirteen_emojis(self):
        for content in ("NO PUEDO " + "😂" * 13, "😱" * 7 + " ay " + "🔥" * 6):
            response = self.create_comment(**anchor_payload(2, QUOTE, text=content))
            self.assertEqual(response.status_code, 400, content)
            self.assertIn("12 emojis", response.json()["detail"])

        self.assertEqual(self.database.tables["chapter_comments"], [])

    def test_emoji_limit_applies_to_replies_and_edits(self):
        comment_id = self.create_comment_id()

        reply = self.create_comment(content="🔥" * 13, parent_id=comment_id)
        self.assertEqual(reply.status_code, 400)
        reply = self.create_comment(content="🔥" * 12, parent_id=comment_id)
        self.assertEqual(reply.status_code, 200)

        for content, status in (("😭" * 13, 400), ("😭" * 12, 200)):
            response = self.client.put(
                f"/chapter-comments/{comment_id}",
                json={"content": content}, headers=auth_header(ALICE_ID)
            )
            self.assertEqual(response.status_code, status, content)

        self.assertEqual(self.stored(comment_id)["content"], "😭" * 12)

    def test_reactions_do_not_count_as_text_emojis(self):
        comment_id = self.create_comment_id(
            **anchor_payload(2, QUOTE, text="Tremendo " + "😂" * 12)
        )

        # Con 12 emojis en el texto, cualquiera puede seguir reaccionando.
        for user_id in (ALICE_ID, BOB_ID, ADMIN_ID, AUTHOR_ID):
            self.assertEqual(self.react(comment_id, "laugh", user_id).status_code, 200)

        comment = self.get_comments().json()["comments"][0]
        self.assertEqual(comment["reactions"], {"laugh": 4})
        self.assertEqual(main.count_emojis(comment["content"]), 12)

    def test_emoji_counting(self):
        cases = {
            "": 0,
            "hola": 0,
            "¡Qué final! ¿En serio? —Sí. :) <3 100%": 0,
            "10 años, 3 gatos y 2 perros #1 *": 0,
            "→ ← © ® ™": 0,
            "😂": 1,
            "😂😂😂": 3,
            "a😂b😭c": 2,
            "❤️": 1,
            "❤": 1,
            "👁️": 1,
            "🫦👄": 2,
            "👍🏽": 1,
            "👩‍👧‍👦": 1,
            "🏳️‍🌈": 1,
            "🇨🇱": 1,
            "🇨🇱🇦🇷": 2,
            "1️⃣": 1,
            "©️": 1,
            "✨⭐☀️": 3,
            "😂" * 12: 12,
            "😂" * 13: 13
        }

        for text, expected in cases.items():
            self.assertEqual(main.count_emojis(text), expected, repr(text))

        self.assertEqual(main.count_emojis(None), 0)

    def test_invalid_reactions_are_rejected(self):
        comment_id = self.create_comment_id()

        # "blush" solo existe en el foro.
        for value in ("blush", "up", "<script>", ""):
            response = self.client.post(
                f"/chapter-comments/{comment_id}/reactions",
                json={"value": value}, headers=auth_header(BOB_ID)
            )
            self.assertEqual(response.status_code, 422, value)

        response = self.client.delete(
            f"/chapter-comments/{comment_id}/reactions/blush",
            headers=auth_header(BOB_ID)
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.post(
            f"/chapter-comments/{comment_id}/reactions", json={"value": "heart"}
        )
        self.assertIn(response.status_code, (401, 403))

    def test_forum_reactions_are_untouched(self):
        self.assertEqual(
            typing.get_args(main.ForumReactionValue),
            ("heart", "laugh", "surprised", "clap", "sad", "angry", "blush")
        )
        self.assertEqual(typing.get_args(main.ForumReactionValue), main.FORUM_REACTION_VALUES)

        forum_before = copy.deepcopy(self.database.tables["forum_interactions"])
        comment_id = self.create_comment_id()
        self.client.post(
            f"/chapter-comments/{comment_id}/reactions",
            json={"value": "fire"}, headers=auth_header(ALICE_ID)
        )

        self.assertEqual(self.database.tables["forum_interactions"], forum_before)
        self.assertNotIn(
            "forum_interactions", {table for table, _ in self.database.executed}
        )

        # El foro sigue rechazando las reacciones nuevas.
        with self.assertRaises(Exception):
            main.ForumReactionCreate(value="fire")

    # ---------- seguridad ----------

    def test_content_is_stored_and_returned_as_plain_text(self):
        payload = anchor_payload(
            2, QUOTE, text='<script>alert(1)</script><img src=x onerror="alert(2)">'
        )
        comment_id = self.create_comment_id(**payload)
        comment = self.get_comments().json()["comments"][0]

        # El backend no interpreta el texto: lo devuelve como dato JSON y
        # el lector lo muestra como texto, nunca como HTML.
        self.assertEqual(comment["content"], payload["content"])
        self.assertEqual(comment["id"], comment_id)

    def test_client_cannot_choose_the_author_or_the_quote(self):
        payload = anchor_payload(2, QUOTE)
        payload.update({"user_id": BOB_ID, "status": "removed", "prefix": "falso"})
        response = self.client.post(
            f"/chapters/{CHAPTER_ID}/comments",
            json=payload, headers=auth_header(ALICE_ID)
        )
        row = self.stored(response.json()["comment"]["id"])

        self.assertEqual(row["user_id"], ALICE_ID)
        self.assertEqual(row["status"], "visible")
        self.assertNotEqual(row["prefix"], "falso")

    def test_write_rate_limit(self):
        limit = main.CHAPTER_COMMENT_RATE_LIMITS["write"][0]
        for _ in range(limit):
            self.assertEqual(self.create_comment().status_code, 200)

        self.assertEqual(self.create_comment().status_code, 429)
        # El límite es por usuario.
        self.assertEqual(self.create_comment(user_id=BOB_ID).status_code, 200)

    # ---------- cambios en el capítulo ----------

    def test_editing_the_chapter_moves_the_anchor(self):
        comment_id = self.create_comment_id()
        new_content = "Un párrafo nuevo al inicio.\n" + CONTENT.replace(
            QUOTE, "Entonces, " + QUOTE
        )

        self.assertEqual(self.edit_chapter(new_content).status_code, 200)

        row = self.stored(comment_id)
        paragraph = new_content.split("\n")[row["paragraph_index"]]
        self.assertFalse(row["is_orphaned"])
        self.assertEqual(row["paragraph_index"], 3)
        self.assertEqual(paragraph[row["start_offset"]:row["end_offset"]], QUOTE)

        comment = self.get_comments().json()["comments"][0]
        self.assertEqual(comment["paragraph_index"], 3)
        self.assertFalse(comment["is_orphaned"])

    def test_unrelated_edit_keeps_the_anchor(self):
        comment_id = self.create_comment_id()
        before = copy.deepcopy(self.stored(comment_id))

        self.edit_chapter(CONTENT + "\nUn párrafo final.")
        after = self.stored(comment_id)

        for field in ("paragraph_index", "start_offset", "end_offset", "quote"):
            self.assertEqual(after[field], before[field])
        self.assertFalse(after["is_orphaned"])

    def test_removed_fragment_becomes_orphan(self):
        comment_id = self.create_comment_id()
        reply_id = self.create_comment_id(
            user_id=BOB_ID, content="Respuesta", parent_id=comment_id
        )

        self.edit_chapter(CONTENT.replace(QUOTE, "Juanito guardó silencio."))

        row = self.stored(comment_id)
        self.assertTrue(row["is_orphaned"])
        self.assertIsNotNone(row["orphaned_at"])
        self.assertEqual(row["quote"], QUOTE)

        comments = {c["id"]: c for c in self.get_comments().json()["comments"]}
        self.assertTrue(comments[comment_id]["is_orphaned"])
        self.assertEqual(comments[comment_id]["quote"], QUOTE)
        self.assertIn(reply_id, comments)

    def test_orphan_never_points_to_another_fragment(self):
        # "—Sí." aparece dos veces: se comenta la primera.
        comment_id = self.create_comment_id(**anchor_payload(4, "—Sí."))

        # Se elimina la línea comentada; la otra "—Sí." sigue en el texto.
        lines = CONTENT.split("\n")
        del lines[4]
        self.edit_chapter("\n".join(lines))

        row = self.stored(comment_id)
        self.assertTrue(row["is_orphaned"])

        # Aunque el texto vuelva, un huérfano no se reancla solo.
        self.edit_chapter(CONTENT)
        self.assertTrue(self.stored(comment_id)["is_orphaned"])

    def test_reanchor_failure_does_not_block_saving_the_chapter(self):
        def broken_reanchor(*_args):
            raise RuntimeError("tabla no disponible")

        original = main.reanchor_chapter_comments
        main.reanchor_chapter_comments = broken_reanchor
        try:
            response = self.edit_chapter(CONTENT + "\nOtro final.")
        finally:
            main.reanchor_chapter_comments = original

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            self.database.tables["chapters"][0]["content"].endswith("Otro final.")
        )

    def test_only_the_story_author_can_edit_the_chapter(self):
        comment_id = self.create_comment_id()
        response = self.edit_chapter("Texto ajeno", user_id=BOB_ID)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.stored(comment_id)["is_orphaned"])


# ============================================================
# ANCLAJE (sin base de datos)
# ============================================================

class AnchorTestCase(unittest.TestCase):
    def anchor(self, content, paragraph_index, quote):
        start = content.split("\n")[paragraph_index].index(quote)
        return build_anchor(content, paragraph_index, start, start + len(quote))

    def assert_points_to_quote(self, content, anchor, quote):
        paragraph = content.split("\n")[anchor["paragraph_index"]]
        self.assertEqual(
            paragraph[anchor["start_offset"]:anchor["end_offset"]], quote
        )

    def test_build_anchor_validates_positions(self):
        self.assertIsNone(build_anchor("Hola mundo", 1, 0, 4))
        self.assertIsNone(build_anchor("Hola mundo", 0, 4, 4))
        self.assertIsNone(build_anchor("Hola mundo", 0, 5, 40))
        self.assertIsNone(build_anchor("Hola mundo", 0, -1, 4))
        self.assertIsNone(build_anchor("Hola   mundo", 0, 4, 7))
        self.assertIsNone(build_anchor("", 0, 0, 1))
        self.assertIsNone(build_anchor(None, 0, 0, 1))

    def test_context_crosses_paragraphs(self):
        anchor = self.anchor("Primero.\nSegundo párrafo.\nTercero.", 1, "Segundo párrafo.")
        self.assertEqual(anchor["prefix"], "Primero.\n")
        self.assertEqual(anchor["suffix"], "\nTercero.")
        self.assertLessEqual(len(anchor["prefix"]), ANCHOR_CONTEXT_LENGTH)

    def test_same_position(self):
        anchor = self.anchor(CONTENT, 2, QUOTE)
        located = locate_anchor(CONTENT, anchor)
        self.assertEqual(located, anchor)

    def test_moved_by_inserted_text(self):
        anchor = self.anchor(CONTENT, 3, "miró hacia la ventana")
        new_content = "Prólogo.\n\n" + CONTENT
        located = locate_anchor(new_content, anchor)

        self.assertEqual(located["paragraph_index"], 5)
        self.assert_points_to_quote(new_content, located, "miró hacia la ventana")

    def test_edit_next_to_the_fragment(self):
        anchor = self.anchor(CONTENT, 3, "miró hacia la ventana")
        new_content = CONTENT.replace("qué responder y miró", "qué decir, así que miró")
        located = locate_anchor(new_content, anchor)

        self.assert_points_to_quote(new_content, located, "miró hacia la ventana")

    def test_long_unique_quote_survives_context_changes(self):
        quote = "miró hacia la ventana abierta"
        anchor = self.anchor(CONTENT, 3, quote)
        new_content = "Nuevo inicio. Ella " + quote + " y suspiró."
        located = locate_anchor(new_content, anchor)

        self.assert_points_to_quote(new_content, located, quote)

    def test_short_quote_without_context_is_orphaned(self):
        anchor = self.anchor(CONTENT, 3, "María")
        self.assertIsNone(locate_anchor("Otra historia donde María aparece.", anchor))

    def test_short_quote_at_same_position_needs_context(self):
        content = "ab sí cd"
        anchor = self.anchor(content, 0, "sí")
        # Mismo texto en la misma posición, pero dentro de otra frase.
        self.assertIsNone(locate_anchor("xy sí zw, y algo más largo.", anchor))

    def test_edited_quote_is_orphaned(self):
        anchor = self.anchor(CONTENT, 2, QUOTE)
        self.assertIsNone(
            locate_anchor(CONTENT.replace(QUOTE, "Juanito le dijo que no."), anchor)
        )

    def test_repeated_lines_are_told_apart_by_context(self):
        first = self.anchor(CONTENT, 4, "—Sí.")
        last = self.anchor(CONTENT, 6, "—Sí.")
        new_content = "Nuevo.\n" + CONTENT

        self.assertEqual(locate_anchor(new_content, first)["paragraph_index"], 5)
        self.assertEqual(locate_anchor(new_content, last)["paragraph_index"], 7)

    def test_ambiguous_matches_are_orphaned(self):
        content = "x\n—Sí.\ny"
        anchor = self.anchor(content, 1, "—Sí.")
        self.assertIsNone(locate_anchor("—Sí.\n—Sí.\n—Sí.", anchor))

    def test_located_anchor_always_has_the_quoted_text(self):
        quotes = [(2, QUOTE), (3, "María"), (4, "—Sí."), (5, "🐶"), (0, "tarde tranquila")]
        variants = [
            CONTENT,
            "Intro\n" + CONTENT,
            CONTENT.replace("Juanito", "Pedro"),
            CONTENT.replace("\n", "\n\n"),
            "\n".join(reversed(CONTENT.split("\n"))),
            CONTENT.upper(),
            ""
        ]

        for paragraph_index, quote in quotes:
            anchor = self.anchor(CONTENT, paragraph_index, quote)
            for variant in variants:
                located = locate_anchor(variant, anchor)
                if located is not None:
                    self.assert_points_to_quote(variant, located, quote)
                    self.assertEqual(located["quote"], quote)


if __name__ == "__main__":
    unittest.main()
