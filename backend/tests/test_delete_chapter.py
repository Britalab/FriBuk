# Pruebas de eliminar un capítulo desde la página de la historia.
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_chapter_comments as base  # noqa: E402
from test_chapter_comments import (  # noqa: E402
    ALICE_ID,
    AUTHOR_ID,
    CHAPTER_ID,
    OTHER_CHAPTER_ID,
    auth_header,
)


class DeleteChapterTests(unittest.TestCase):
    # Se usa solo la preparación de esas pruebas: heredar la clase volvería a
    # ejecutar todas sus pruebas aquí.
    def setUp(self):
        base.ChapterCommentsTestCase.setUp(self)
        self.database.tables["notifications"] = [
            {"id": "n1", "type": "story_chapter", "chapter_id": CHAPTER_ID},
            {"id": "n2", "type": "story_chapter", "chapter_id": OTHER_CHAPTER_ID},
            {"id": "n3", "type": "follow", "chapter_id": None},
        ]

    def tearDown(self):
        base.ChapterCommentsTestCase.tearDown(self)

    def delete(self, user_id, chapter_id=CHAPTER_ID):
        return self.client.delete(f"/chapters/{chapter_id}", headers=auth_header(user_id))

    def chapter_ids(self):
        return {row["id"] for row in self.database.tables["chapters"]}

    def test_the_author_deletes_the_chapter_and_its_notifications(self):
        response = self.delete(AUTHOR_ID)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn(CHAPTER_ID, self.chapter_ids())
        self.assertIn(OTHER_CHAPTER_ID, self.chapter_ids())
        self.assertEqual(
            [row["id"] for row in self.database.tables["notifications"]],
            ["n2", "n3"],
        )

    def test_someone_else_cannot_delete_it(self):
        response = self.delete(ALICE_ID)

        self.assertEqual(response.status_code, 403)
        self.assertIn(CHAPTER_ID, self.chapter_ids())
        self.assertEqual(len(self.database.tables["notifications"]), 3)

    def test_a_missing_chapter_is_not_found(self):
        response = self.delete(AUTHOR_ID, chapter_id="no-existe")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
