# Pruebas de los consejos para escribir de tía FriBuk (/consejos).
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
WRITER_ID = str(uuid.uuid4())
PUBLISHED_ID = str(uuid.uuid4())
DRAFT_ID = str(uuid.uuid4())


class TipsDatabase(FakeDatabase):
    # La comprobación de admin usa .single(), que devuelve una sola fila.
    def table(self, table_name):
        return SingleRowQuery(self, table_name)

    def new_row(self, table_name, payload):
        row = super().new_row(table_name, payload)
        if table_name == "writing_tips":
            row.setdefault("id", str(uuid.uuid4()))
            row.setdefault("published_at", None)
        return row


def tip_row(tip_id, slug, position, status):
    return {
        "id": tip_id, "slug": slug, "position": position, "title": f"Título {slug}",
        "description": "", "summary": "Resumen", "pose": "retrato",
        "sections": [{"heading": "", "text": "Texto"}], "status": status,
        "published_at": "2026-10-27" if status == "published" else None,
    }


def payload(**changes):
    return {
        "slug": "un-consejo-nuevo",
        "title": "¿Un consejo nuevo?",
        "description": "Para Google.",
        "summary": "Resumen corto.",
        "pose": "pensativa",
        "position": 3,
        "sections": [{"heading": "Primera parte", "text": "**Hola**\n[•]Uno"}],
        "status": "draft",
        **changes,
    }


class TipsTestCase(unittest.TestCase):
    def setUp(self):
        self.database = TipsDatabase()
        self.database.tables = {
            "users": [
                {"id": ADMIN_ID, "username": "fribuk", "role": "admin"},
                {"id": WRITER_ID, "username": "autora", "role": "user"},
            ],
            "writing_tips": [
                tip_row(PUBLISHED_ID, "publicado", 1, "published"),
                tip_row(DRAFT_ID, "borrador", 2, "draft"),
            ],
        }
        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (ADMIN_ID, WRITER_ID)
        }
        self.originals = (main.supabase_admin, main.supabase_public)
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public = self.originals

    def slugs(self, user_id=None):
        headers = auth_header(user_id) if user_id else {}
        body = self.client.get("/tips", headers=headers).json()
        return [tip["slug"] for tip in body["tips"]], body["can_edit"]

    # ---------- lectura ----------

    def test_visitors_and_writers_only_see_published_tips(self):
        self.assertEqual(self.slugs(), (["publicado"], False))
        self.assertEqual(self.slugs(WRITER_ID), (["publicado"], False))

        self.assertEqual(self.client.get("/tips/publicado").status_code, 200)
        self.assertEqual(self.client.get("/tips/borrador").status_code, 404)
        self.assertEqual(
            self.client.get("/tips/borrador", headers=auth_header(WRITER_ID)).status_code, 404
        )

    def test_the_admin_sees_drafts_and_can_edit(self):
        self.assertEqual(self.slugs(ADMIN_ID), (["publicado", "borrador"], True))

        response = self.client.get("/tips/borrador", headers=auth_header(ADMIN_ID))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["can_edit"])

    # ---------- edición ----------

    def test_only_the_admin_can_create_edit_and_delete(self):
        for user_id in (None, WRITER_ID):
            headers = auth_header(user_id) if user_id else {}
            self.assertIn(self.client.post("/tips", json=payload(), headers=headers).status_code, (401, 403))
            self.assertIn(
                self.client.put(f"/tips/{DRAFT_ID}", json=payload(), headers=headers).status_code, (401, 403)
            )
            self.assertIn(self.client.delete(f"/tips/{DRAFT_ID}", headers=headers).status_code, (401, 403))

        self.assertEqual(len(self.database.tables["writing_tips"]), 2)

    def test_the_admin_creates_a_draft(self):
        response = self.client.post("/tips", json=payload(), headers=auth_header(ADMIN_ID))
        self.assertEqual(response.status_code, 200, response.text)

        tip = response.json()["tip"]
        self.assertEqual(tip["status"], "draft")
        self.assertIsNone(tip["published_at"])
        self.assertEqual(tip["sections"], [{"heading": "Primera parte", "text": "**Hola**\n[•]Uno"}])
        # Un borrador nuevo no aparece para el público.
        self.assertNotIn("un-consejo-nuevo", self.slugs()[0])

    def test_publishing_sets_the_date_once(self):
        published = self.client.put(
            f"/tips/{DRAFT_ID}", json=payload(slug="borrador", status="published"),
            headers=auth_header(ADMIN_ID),
        )
        self.assertEqual(published.status_code, 200, published.text)
        first_date = published.json()["tip"]["published_at"]
        self.assertIsNotNone(first_date)
        self.assertIn("borrador", self.slugs()[0])

        # Editarlo después no cambia la fecha de publicación.
        self.database.tables["writing_tips"][1]["published_at"] = "2026-01-01"
        edited = self.client.put(
            f"/tips/{DRAFT_ID}", json=payload(slug="borrador", status="published", title="Otro título"),
            headers=auth_header(ADMIN_ID),
        )
        self.assertEqual(edited.json()["tip"]["published_at"], "2026-01-01")

    def test_the_admin_deletes_a_tip(self):
        response = self.client.delete(f"/tips/{DRAFT_ID}", headers=auth_header(ADMIN_ID))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([tip["id"] for tip in self.database.tables["writing_tips"]], [PUBLISHED_ID])

    # ---------- validación ----------

    def test_invalid_data_is_rejected(self):
        for changes in (
            {"slug": "Con Mayúsculas"},
            {"slug": "con-tílde"},
            {"slug": ""},
            {"title": "  "},
            {"pose": "inventada"},
            {"status": "secreto"},
            {"description": "x" * 201},
            # Para publicar hace falta texto.
            {"status": "published", "sections": [{"heading": "Solo título", "text": ""}]},
        ):
            response = self.client.post("/tips", json=payload(**changes), headers=auth_header(ADMIN_ID))
            self.assertEqual(response.status_code, 400, changes)

    def test_the_address_must_be_unique(self):
        response = self.client.post("/tips", json=payload(slug="publicado"), headers=auth_header(ADMIN_ID))
        self.assertEqual(response.status_code, 409)

        # Guardar un consejo con su propia dirección sí se puede.
        response = self.client.put(
            f"/tips/{PUBLISHED_ID}", json=payload(slug="publicado", status="published"),
            headers=auth_header(ADMIN_ID),
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_empty_sections_are_not_saved(self):
        response = self.client.post(
            "/tips",
            json=payload(sections=[{"heading": "", "text": "  "}, {"heading": "", "text": "Algo"}]),
            headers=auth_header(ADMIN_ID),
        )
        self.assertEqual(response.json()["tip"]["sections"], [{"heading": "", "text": "Algo"}])


if __name__ == "__main__":
    unittest.main()
