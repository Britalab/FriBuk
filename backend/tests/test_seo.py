# Pruebas de los datos para buscadores y vistas previas al compartir.
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
import seo  # noqa: E402
from test_chapter_comments import FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
STORY_ID = str(uuid.uuid4())
DRAFT_STORY_ID = str(uuid.uuid4())
CHAPTER_ONE_ID = str(uuid.uuid4())
CHAPTER_TWO_ID = str(uuid.uuid4())
DRAFT_CHAPTER_ID = str(uuid.uuid4())
HIDDEN_CHAPTER_ID = str(uuid.uuid4())


class SeoTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [{"id": AUTHOR_ID, "username": "autora"}],
            "stories": [
                {
                    "id": STORY_ID, "author_id": AUTHOR_ID, "status": "published",
                    "title": "Bajo la última sombra", "description": "Una sinopsis.",
                    "genre": "Fantasía", "cover_url": "https://cdn.test/portada.jpg",
                    "updated_at": "2026-10-01T12:00:00+00:00"
                },
                {
                    "id": DRAFT_STORY_ID, "author_id": AUTHOR_ID, "status": "draft",
                    "title": "Secreta", "description": "No publicada."
                }
            ],
            "chapters": [
                # Guardados con un salto en la numeración.
                {
                    "id": CHAPTER_TWO_ID, "story_id": STORY_ID, "chapter_number": 5,
                    "title": "Dos", "content": "Segundo texto.", "status": "published",
                    "created_at": "2026-10-03T08:00:00+00:00"
                },
                {
                    "id": CHAPTER_ONE_ID, "story_id": STORY_ID, "chapter_number": 1,
                    "title": "Uno", "content": "Primer texto.", "status": "published"
                },
                {
                    "id": DRAFT_CHAPTER_ID, "story_id": STORY_ID, "chapter_number": 6,
                    "title": "Borrador", "content": "Sin publicar.", "status": "draft"
                },
                {
                    "id": HIDDEN_CHAPTER_ID, "story_id": DRAFT_STORY_ID,
                    "chapter_number": 1, "title": "Oculto", "content": "Secreto.",
                    "status": "published"
                }
            ]
        }
        self.original = main.supabase_admin
        main.supabase_admin = self.database
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin = self.original

    # ---------- vista previa ----------

    def test_story_preview_has_only_public_data(self):
        response = self.client.get(f"/seo/stories/{STORY_ID}")
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(response.json(), {
            "id": STORY_ID,
            "title": "Bajo la última sombra",
            "description": "Una sinopsis.",
            "genre": "Fantasía",
            "cover_url": "https://cdn.test/portada.jpg",
            "author_id": AUTHOR_ID,
            "author_username": "autora",
            # Solo los publicados, en el orden de lectura.
            "chapters": [
                {"id": CHAPTER_ONE_ID, "title": "Uno"},
                {"id": CHAPTER_TWO_ID, "title": "Dos"}
            ],
            "chapter": None
        })

    def test_chapter_preview_includes_its_text_and_reading_position(self):
        response = self.client.get(
            f"/seo/stories/{STORY_ID}", params={"chapter_id": CHAPTER_TWO_ID}
        )
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(response.json()["chapter"], {
            "id": CHAPTER_TWO_ID,
            "title": "Dos",
            # Segundo capítulo que ve el lector, aunque esté guardado como 5.
            "position": 2,
            "content": "Segundo texto.",
            "is_truncated": False
        })

    def test_long_chapter_text_is_cut(self):
        self.database.tables["chapters"][1]["content"] = "a" * 25000

        chapter = self.client.get(
            f"/seo/stories/{STORY_ID}", params={"chapter_id": CHAPTER_ONE_ID}
        ).json()["chapter"]

        self.assertEqual(len(chapter["content"]), seo.CHAPTER_TEXT_MAX_LENGTH)
        self.assertTrue(chapter["is_truncated"])

    def test_drafts_do_not_exist_for_crawlers(self):
        for url, params in (
            (f"/seo/stories/{DRAFT_STORY_ID}", None),
            (f"/seo/stories/{DRAFT_STORY_ID}", {"chapter_id": HIDDEN_CHAPTER_ID}),
            # Capítulo en borrador de una historia publicada.
            (f"/seo/stories/{STORY_ID}", {"chapter_id": DRAFT_CHAPTER_ID}),
            # Capítulo publicado, pero de otra historia.
            (f"/seo/stories/{STORY_ID}", {"chapter_id": HIDDEN_CHAPTER_ID}),
            (f"/seo/stories/{uuid.uuid4()}", None),
            ("/seo/stories/no-es-un-id", None),
            (f"/seo/stories/{STORY_ID}", {"chapter_id": "no-es-un-id"})
        ):
            response = self.client.get(url, params=params)
            self.assertEqual(response.status_code, 404, (url, params))
            self.assertNotIn("Secret", response.text)

    # ---------- mapa del sitio ----------

    def test_sitemap_lists_public_pages_only(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.headers["content-type"].startswith("application/xml"))

        body = response.text
        self.assertIn("<loc>https://www.fribuk.com/</loc>", body)
        self.assertIn("<loc>https://www.fribuk.com/forum</loc>", body)
        self.assertIn(
            f"<url><loc>https://www.fribuk.com/stories/{STORY_ID}</loc>"
            "<lastmod>2026-10-01</lastmod></url>",
            body
        )
        self.assertIn(
            f"<loc>https://www.fribuk.com/stories/{STORY_ID}/chapters/{CHAPTER_TWO_ID}</loc>"
            "<lastmod>2026-10-03</lastmod>",
            body
        )
        self.assertIn(f"/chapters/{CHAPTER_ONE_ID}</loc></url>", body)

        # Ni borradores ni capítulos de historias ocultas.
        for hidden in (DRAFT_STORY_ID, DRAFT_CHAPTER_ID, HIDDEN_CHAPTER_ID):
            self.assertNotIn(hidden, body)


if __name__ == "__main__":
    unittest.main()
