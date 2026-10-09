# Pruebas de las etiquetas de las historias (tropos y temas).
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
from test_chapter_comments import FakeAuth, FakeDatabase, FakeQuery  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
OTHER_ID = str(uuid.uuid4())
STORY_ID = str(uuid.uuid4())
OTHER_STORY_ID = str(uuid.uuid4())
DRAFT_STORY_ID = str(uuid.uuid4())


class CountingQuery(FakeQuery):
    # Igual que la consulta de prueba, pero acepta select(..., count="exact").
    def select(self, *_columns, **_options):
        return self

    def execute(self):
        response = super().execute()
        if isinstance(response.data, list):
            response.count = len(response.data)
        return response


class TagsDatabase(FakeDatabase):
    def table(self, table_name):
        return CountingQuery(self, table_name)

    def new_row(self, table_name, payload):
        row = super().new_row(table_name, payload)
        if table_name == "tags":
            row.setdefault("id", str(uuid.uuid4()))
        return row


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


class StoryTagsTestCase(unittest.TestCase):
    def setUp(self):
        self.database = TagsDatabase()

        def story(story_id, title, status="published", **extra):
            return {
                "id": story_id, "author_id": AUTHOR_ID, "title": title,
                "description": None, "cover_url": None, "genre": "Romance",
                "status": status, "work_type": "original", "original_work": None,
                "original_author": None, "sensitive_content": False,
                "content_warnings": [], **extra
            }

        self.database.tables = {
            "users": [
                {"id": AUTHOR_ID, "username": "autora", "role": "user"},
                {"id": OTHER_ID, "username": "otra", "role": "user"}
            ],
            "stories": [
                story(
                    STORY_ID, "Bajo la última sombra", work_type="fanfic",
                    original_work="Harry Potter"
                ),
                story(OTHER_STORY_ID, "Sin etiquetas"),
                story(DRAFT_STORY_ID, "Borrador", status="draft")
            ],
            "tags": [
                {"id": "t1", "name": "slow burn"},
                {"id": "t2", "name": "magia"}
            ],
            "story_tags": [
                {"story_id": STORY_ID, "tag_id": "t1"},
                {"story_id": STORY_ID, "tag_id": "t2"},
                {"story_id": DRAFT_STORY_ID, "tag_id": "t2"}
            ],
            "votes": [],
            "ratings": [],
            "chapters": []
        }

        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (AUTHOR_ID, OTHER_ID)
        }

        self.originals = (main.supabase_admin, main.supabase_public)
        self.original_notify = main.run_notification_task
        main.run_notification_task = lambda *args, **kwargs: None
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(
            auth=FakeAuth(users), table=self.database.table
        )
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public = self.originals
        main.run_notification_task = self.original_notify

    # ---------- número de capítulo ----------

    def create_chapter(self, user_id=AUTHOR_ID, story_id=STORY_ID, **extra):
        return self.client.post(
            "/chapters",
            json={
                "story_id": story_id, "title": "Un capítulo",
                "content": "Texto del capítulo.", **extra
            },
            headers=auth_header(user_id)
        )

    def chapter_numbers(self, story_id=STORY_ID):
        return [
            chapter["chapter_number"] for chapter in self.database.tables["chapters"]
            if chapter["story_id"] == story_id
        ]

    def test_chapter_number_is_assigned_automatically(self):
        first = self.create_chapter()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["chapter"]["chapter_number"], 1)

        self.assertEqual(self.create_chapter(status="published").status_code, 200)
        self.assertEqual(self.create_chapter().status_code, 200)
        self.assertEqual(self.chapter_numbers(), [1, 2, 3])

        # Cada historia lleva su propia cuenta.
        self.assertEqual(self.create_chapter(story_id=OTHER_STORY_ID).status_code, 200)
        self.assertEqual(self.chapter_numbers(OTHER_STORY_ID), [1])

    def test_a_number_sent_by_the_form_is_ignored(self):
        self.create_chapter()

        # Ni saltos ni repetidos, aunque se envíe un número a mano.
        self.assertEqual(self.create_chapter(chapter_number=40).status_code, 200)
        self.assertEqual(self.create_chapter(chapter_number=1).status_code, 200)
        self.assertEqual(self.chapter_numbers(), [1, 2, 3])

    def test_new_chapter_goes_after_the_highest_existing_number(self):
        # Una historia antigua con un salto: el nuevo va al final.
        self.database.tables["chapters"].extend(
            {"id": str(uuid.uuid4()), "story_id": STORY_ID, "chapter_number": number,
             "title": "Viejo", "content": "x", "status": "published"}
            for number in (1, 2, 5)
        )

        self.assertEqual(self.create_chapter().status_code, 200)
        self.assertEqual(self.chapter_numbers(), [1, 2, 5, 6])

    def test_only_the_author_adds_chapters(self):
        self.assertEqual(self.create_chapter(user_id=OTHER_ID).status_code, 403)
        self.assertEqual(self.database.tables["chapters"], [])

    def update(self, user_id=AUTHOR_ID, **changes):
        body = {"title": "Bajo la última sombra", "status": "published", **changes}
        return self.client.put(
            f"/stories/{STORY_ID}", json=body, headers=auth_header(user_id)
        )

    def story_tags(self, story_id=STORY_ID):
        names = {tag["id"]: tag["name"] for tag in self.database.tables["tags"]}
        return [
            names[link["tag_id"]] for link in self.database.tables["story_tags"]
            if link["story_id"] == story_id
        ]

    def test_public_list_includes_tags_and_fandom(self):
        response = self.client.get("/stories")
        self.assertEqual(response.status_code, 200, response.text)

        stories = {story["id"]: story for story in response.json()}
        self.assertEqual(stories[STORY_ID]["tags"], ["slow burn", "magia"])
        self.assertEqual(stories[STORY_ID]["original_work"], "Harry Potter")
        self.assertEqual(stories[OTHER_STORY_ID]["tags"], [])
        # Los borradores, con sus etiquetas, no salen en el listado público.
        self.assertNotIn(DRAFT_STORY_ID, stories)

    def test_story_page_includes_tags(self):
        story = self.client.get(f"/stories/{STORY_ID}").json()
        self.assertEqual(story["tags"], ["slow burn", "magia"])

        untagged = self.client.get(f"/stories/{OTHER_STORY_ID}").json()
        self.assertEqual(untagged["tags"], [])

    def test_author_can_replace_tags_when_editing(self):
        response = self.update(tags=["enemies to lovers", " magia ", "magia", ""])
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(self.story_tags(), ["enemies to lovers", "magia"])
        # La etiqueta que ya existía se reutiliza; la nueva se crea una vez.
        self.assertEqual(
            sorted(tag["name"] for tag in self.database.tables["tags"]),
            ["enemies to lovers", "magia", "slow burn"]
        )
        # Las etiquetas de otras historias no se tocan.
        self.assertEqual(self.story_tags(DRAFT_STORY_ID), ["magia"])

        self.assertEqual(self.update(tags=[]).status_code, 200)
        self.assertEqual(self.story_tags(), [])

    def test_editing_without_tags_keeps_the_existing_ones(self):
        response = self.update(description="Nueva descripción")
        self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(self.story_tags(), ["slow burn", "magia"])
        self.assertEqual(
            self.database.tables["stories"][0]["description"], "Nueva descripción"
        )

    def test_only_the_author_can_change_tags(self):
        response = self.update(user_id=OTHER_ID, tags=["spam"])

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.story_tags(), ["slow burn", "magia"])

    def test_tag_limits_apply_when_editing(self):
        too_long = self.update(tags=["a" * 31])
        too_many = self.update(
            tags=[f"etiqueta {index}" for index in range(main.MAX_STORY_TAGS + 1)]
        )

        self.assertEqual(too_long.status_code, 400)
        self.assertEqual(too_many.status_code, 400)
        self.assertEqual(self.story_tags(), ["slow burn", "magia"])

    def test_tag_lookup_failure_does_not_break_the_list(self):
        original = main.get_story_tags

        class Broken:
            def table(self, _name):
                raise RuntimeError("tabla no disponible")

        admin = main.supabase_admin
        try:
            main.supabase_admin = Broken()
            self.assertEqual(main.get_story_tags([STORY_ID]), {})
        finally:
            main.supabase_admin = admin
            main.get_story_tags = original


if __name__ == "__main__":
    unittest.main()
