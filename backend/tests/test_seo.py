# Pruebas de los datos para buscadores y vistas previas al compartir.
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import io
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import seo  # noqa: E402
from test_chapter_comments import FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
SECOND_ID = str(uuid.uuid4())
DELETED_ID = str(uuid.uuid4())
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
            ],
            "writing_tips": [
                {
                    "id": str(uuid.uuid4()), "slug": "como-crear-tension",
                    "status": "published", "published_at": "2026-10-27",
                    "updated_at": "2026-10-28T09:00:00+00:00"
                },
                {
                    "id": str(uuid.uuid4()), "slug": "consejo-en-borrador",
                    "status": "draft", "updated_at": "2026-10-28T09:00:00+00:00"
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
        self.assertIn("<loc>https://www.fribuk.com/consejos</loc>", body)
        self.assertIn(
            "<loc>https://www.fribuk.com/consejos/como-crear-tension</loc>"
            "<lastmod>2026-10-28</lastmod>",
            body
        )
        self.assertNotIn("consejo-en-borrador", body)

        # Ni borradores ni capítulos de historias ocultas.
        for hidden in (DRAFT_STORY_ID, DRAFT_CHAPTER_ID, HIDDEN_CHAPTER_ID):
            self.assertNotIn(hidden, body)


# ============================================================
# VISTA PREVIA DE UN PERFIL
# ============================================================

STORAGE_AVATAR = "https://proyecto.supabase.co/storage/v1/object/public/story-covers/avatars/x/avatar"


def webp_avatar() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (512, 512), (120, 40, 60)).save(output, "WEBP")
    return output.getvalue()


class ProfilePreviewTestCase(unittest.TestCase):
    def setUp(self):
        self.users = {
            AUTHOR_ID: {"username": "autora", "avatar_url": f"{STORAGE_AVATAR}?v=1700"},
            SECOND_ID: {"username": "lectora"},
            DELETED_ID: {"username": "eliminado_abc123"},
        }
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [],
            "user_profiles": [
                {"user_id": AUTHOR_ID, "display_name": "Ana Autora",
                 "bio": "Escribo fantasía.", "website_url": None}
            ],
            "stories": [
                {"id": STORY_ID, "author_id": AUTHOR_ID, "status": "published",
                 "title": "Bajo la última sombra"},
                {"id": DRAFT_STORY_ID, "author_id": AUTHOR_ID, "status": "draft",
                 "title": "Secreta"},
            ],
        }

        def get_user_by_id(user_id):
            metadata = self.users.get(user_id)
            return SimpleNamespace(
                user=SimpleNamespace(id=user_id, user_metadata=metadata) if metadata else None
            )

        self.database.auth = SimpleNamespace(admin=SimpleNamespace(get_user_by_id=get_user_by_id))
        self.originals = (main.supabase_admin, main.SUPABASE_URL, seo.download_avatar)
        main.supabase_admin = self.database
        main.SUPABASE_URL = "https://proyecto.supabase.co"
        self.downloaded = []
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.SUPABASE_URL, seo.download_avatar = self.originals

    def test_preview_has_name_bio_photo_version_and_public_stories(self):
        response = self.client.get(f"/seo/users/{AUTHOR_ID}")
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(response.json(), {
            "id": AUTHOR_ID,
            "username": "autora",
            "display_name": "Ana Autora",
            "bio": "Escribo fantasía.",
            "avatar_version": "1700",
            # Sin los borradores.
            "stories": [{"id": STORY_ID, "title": "Bajo la última sombra"}],
        })

    def test_profile_without_photo_or_extra_info(self):
        body = self.client.get(f"/seo/users/{SECOND_ID}").json()

        self.assertIsNone(body["avatar_version"])
        self.assertIsNone(body["display_name"])
        self.assertEqual(body["stories"], [])

    def test_deleted_and_missing_accounts_do_not_exist(self):
        for user_id in (DELETED_ID, str(uuid.uuid4()), "no-es-un-id"):
            self.assertEqual(self.client.get(f"/seo/users/{user_id}").status_code, 404, user_id)
            self.assertEqual(
                self.client.get(f"/seo/users/{user_id}/avatar.jpg").status_code, 404, user_id
            )

    def test_photo_is_served_as_a_small_jpeg(self):
        seo.download_avatar = lambda url: self.downloaded.append(url) or webp_avatar()

        response = self.client.get(f"/seo/users/{AUTHOR_ID}/avatar.jpg?v=1700")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/jpeg")
        self.assertIn("max-age", response.headers["cache-control"])
        self.assertEqual(Image.open(io.BytesIO(response.content)).size, (300, 300))
        self.assertEqual(self.downloaded, [f"{STORAGE_AVATAR}?v=1700"])

    def test_a_removed_photo_is_not_served(self):
        # Moderación deja avatar_url vacío al retirar la foto.
        self.users[AUTHOR_ID]["avatar_url"] = None

        self.assertEqual(self.client.get(f"/seo/users/{AUTHOR_ID}/avatar.jpg").status_code, 404)
        self.assertIsNone(self.client.get(f"/seo/users/{AUTHOR_ID}").json()["avatar_version"])

    def test_only_photos_from_our_storage_are_downloaded(self):
        with self.assertRaises(ValueError):
            seo.download_avatar("https://otro-sitio.test/foto.webp")


if __name__ == "__main__":
    unittest.main()
