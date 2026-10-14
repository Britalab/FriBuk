# Pruebas de los reconocimientos: títulos, insignias y cupos de fundador.
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

import badges  # noqa: E402
import main  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
READER_ID = str(uuid.uuid4())
OTHER_ID = str(uuid.uuid4())


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


def words(count):
    return " ".join(["palabra"] * count)


class BadgesTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [
                {"id": AUTHOR_ID, "username": "autora", "role": "user"},
                {"id": READER_ID, "username": "lectora", "role": "user"},
                {"id": OTHER_ID, "username": "otra", "role": "user"},
            ],
            "stories": [],
            "chapters": [],
            "forum_topics": [],
            "forum_replies": [],
            "forum_interactions": [],
            "user_badges": [],
            "founder_slots": [],
            "user_badge_display": [],
        }
        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (AUTHOR_ID, READER_ID, OTHER_ID)
        }

        self.originals = (main.supabase_admin, main.supabase_public)
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public = self.originals

    # ---------- utilidades ----------

    def add_story(self, author_id=AUTHOR_ID, status="completed", genre="Fantasía",
                  chapters=3, words_per_chapter=1000):
        story_id = str(uuid.uuid4())
        self.database.tables["stories"].append({
            "id": story_id, "author_id": author_id, "status": status,
            "genre": genre, "created_at": f"2026-01-{len(self.database.tables['stories']) + 1:02d}",
        })
        for number in range(chapters):
            self.database.tables["chapters"].append({
                "id": str(uuid.uuid4()), "story_id": story_id,
                "chapter_number": number + 1, "status": "published",
                "content": words(words_per_chapter),
            })
        return story_id

    def levels(self, user_id=AUTHOR_ID):
        return {
            row["badge_id"]: row["level"]
            for row in self.database.tables["user_badges"]
            if row["user_id"] == user_id
        }

    # ---------- Autor Fundador ----------

    def test_founder_needs_two_chapters_and_three_thousand_words(self):
        self.add_story(chapters=2, words_per_chapter=1500)
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertEqual(self.levels().get("autor_fundador"), 1)
        self.assertEqual(self.database.tables["founder_slots"][0]["slot"], 1)

    def test_founder_requires_both_conditions(self):
        # Muchas palabras pero pocos capítulos, y al revés.
        self.add_story(chapters=1, words_per_chapter=5000)
        self.add_story(chapters=2, words_per_chapter=1499)
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertNotIn("autor_fundador", self.levels())
        self.assertEqual(self.database.tables["founder_slots"], [])

    def test_founder_needs_a_finished_story(self):
        self.add_story(status="published", chapters=5, words_per_chapter=1000)
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertNotIn("autor_fundador", self.levels())

    def test_draft_chapters_do_not_count(self):
        story_id = self.add_story(chapters=2, words_per_chapter=2000)
        self.database.tables["chapters"][0]["status"] = "draft"
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertNotIn("autor_fundador", self.levels())
        self.assertTrue(story_id)

    def test_only_one_hundred_founders(self):
        self.database.tables["founder_slots"] = [
            {"kind": "author", "slot": slot, "user_id": str(uuid.uuid4())}
            for slot in range(1, 101)
        ]
        self.add_story()
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertNotIn("autor_fundador", self.levels())
        self.assertEqual(len(self.database.tables["founder_slots"]), 100)

    def test_founder_slots_follow_arrival_order(self):
        self.database.tables["founder_slots"] = [
            {"kind": "author", "slot": 1, "user_id": OTHER_ID}
        ]
        self.add_story()
        badges.refresh_user_badges(AUTHOR_ID)
        badges.refresh_user_badges(AUTHOR_ID)

        mine = [
            row for row in self.database.tables["founder_slots"]
            if row["user_id"] == AUTHOR_ID
        ]
        self.assertEqual([row["slot"] for row in mine], [2])

    def test_founder_is_kept_after_the_story_changes(self):
        self.add_story()
        badges.refresh_user_badges(AUTHOR_ID)

        # Sigue escribiendo especiales: la historia vuelve a "en curso".
        self.database.tables["stories"][0]["status"] = "published"
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertEqual(self.levels().get("autor_fundador"), 1)

    def test_founder_counter(self):
        self.add_story()
        badges.refresh_user_badges(AUTHOR_ID)

        response = self.client.get("/badges/founders")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["author"], {"total": 100, "taken": 1, "remaining": 99}
        )

    # ---------- insignias y títulos por niveles ----------

    def test_first_publication(self):
        self.add_story(status="published", chapters=1, words_per_chapter=10)
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertEqual(self.levels(), {"primera_publicacion": 1})

    def test_levels_for_finished_stories_and_genres(self):
        for genre in ("Fantasía", "Terror", "Romance", "Misterio", "Fantasía"):
            self.add_story(genre=genre, chapters=1, words_per_chapter=10)
        badges.refresh_user_badges(AUTHOR_ID)

        levels = self.levels()
        self.assertEqual(levels["historia_finalizada"], 2)  # 5 terminadas
        self.assertEqual(levels["autor_constante"], 3)      # 5 o más
        self.assertEqual(levels["autor_versatil"], 2)       # 4 géneros

    def test_levels_never_go_down(self):
        self.add_story(chapters=1, words_per_chapter=10)
        self.add_story(chapters=1, words_per_chapter=10)
        badges.refresh_user_badges(AUTHOR_ID)
        self.assertEqual(self.levels()["autor_constante"], 1)

        self.database.tables["stories"] = []
        badges.refresh_user_badges(AUTHOR_ID)

        self.assertEqual(self.levels()["autor_constante"], 1)

    def test_community_counts_what_others_give(self):
        topic_id, reply_id = str(uuid.uuid4()), str(uuid.uuid4())
        self.database.tables["forum_topics"] = [{"id": topic_id, "user_id": AUTHOR_ID}]
        self.database.tables["forum_replies"] = [{"id": reply_id, "user_id": AUTHOR_ID}]

        def interaction(user_id, kind, value, topic=None, reply=None):
            return {"user_id": user_id, "kind": kind, "value": value,
                    "topic_id": topic, "reply_id": reply}

        self.database.tables["forum_interactions"] = (
            [interaction(READER_ID, "reaction", "heart", topic=topic_id)] * 20
            + [interaction(OTHER_ID, "vote", "up", reply=reply_id)] * 5
            # No cuentan: votos negativos ni lo que se da a sí misma.
            + [interaction(OTHER_ID, "vote", "down", topic=topic_id)] * 10
            + [interaction(AUTHOR_ID, "reaction", "clap", topic=topic_id)] * 10
        )

        metrics = badges.refresh_user_badges(AUTHOR_ID)

        self.assertEqual(metrics["community_points"], 25)
        self.assertEqual(self.levels()["autor_comunidad"], 1)

    # ---------- Historia Destacada ----------

    def test_featured_story_thresholds(self):
        self.assertTrue(badges.is_featured_story([4.5] * 31))
        self.assertFalse(badges.is_featured_story([5] * 30))   # más de 30
        self.assertFalse(badges.is_featured_story([4.4] * 100))
        self.assertFalse(badges.is_featured_story([]))

    # ---------- rutas ----------

    def test_my_badges_show_progress_and_unearned(self):
        self.add_story(chapters=1, words_per_chapter=10)

        response = self.client.get("/me/badges", headers=auth_header(AUTHOR_ID))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["has_published"])
        catalog = {item["id"]: item for item in data["catalog"]}
        self.assertTrue(catalog["historia_finalizada"]["earned"])
        self.assertEqual(catalog["historia_finalizada"]["progress"], {"current": 1, "next": 5})
        self.assertFalse(catalog["autor_versatil"]["earned"])
        self.assertEqual(data["founders"]["author"]["remaining"], 100)

    def test_reader_without_stories_has_nothing_to_show(self):
        response = self.client.get("/me/badges", headers=auth_header(READER_ID))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["has_published"])
        self.assertIsNone(response.json()["main_title"])

    def test_public_badges_only_show_earned(self):
        self.add_story()
        badges.refresh_user_badges(AUTHOR_ID)

        data = self.client.get(f"/users/{AUTHOR_ID}/badges").json()

        self.assertEqual(data["main_title"]["id"], "autor_fundador")
        self.assertNotIn("catalog", data)
        self.assertEqual(
            [badge["id"] for badge in data["featured"]],
            ["primera_publicacion", "historia_finalizada"],
        )

    def test_choose_main_title_and_featured(self):
        self.add_story()
        self.add_story(genre="Terror", chapters=1, words_per_chapter=10)
        badges.refresh_user_badges(AUTHOR_ID)

        response = self.client.put(
            "/me/badges/display",
            json={"main_title": "autor_constante", "featured": ["autor_versatil"]},
            headers=auth_header(AUTHOR_ID),
        )
        self.assertEqual(response.status_code, 200)

        data = self.client.get(f"/users/{AUTHOR_ID}/badges").json()
        self.assertEqual(data["main_title"]["id"], "autor_constante")
        self.assertEqual([t["id"] for t in data["other_titles"]], ["autor_fundador"])
        self.assertEqual([b["id"] for b in data["featured"]], ["autor_versatil"])

    def test_cannot_choose_what_was_not_earned(self):
        for body in (
            {"main_title": "autor_fundador", "featured": []},
            {"main_title": None, "featured": ["autor_versatil"]},
            {"main_title": "primera_publicacion", "featured": []},
        ):
            response = self.client.put(
                "/me/badges/display", json=body, headers=auth_header(AUTHOR_ID)
            )
            self.assertEqual(response.status_code, 400, body)

    def test_featured_limit(self):
        response = self.client.put(
            "/me/badges/display",
            json={"featured": ["a", "b", "c", "d", "e"]},
            headers=auth_header(AUTHOR_ID),
        )
        self.assertEqual(response.status_code, 400)

    def test_story_cards_carry_author_title_and_featured(self):
        story_id = self.add_story()
        badges.refresh_user_badges(AUTHOR_ID)
        self.database.tables["ratings"] = [
            {"story_id": story_id, "plot": 5, "spelling": 4} for _ in range(31)
        ]
        main.supabase_public = SimpleNamespace(
            auth=main.supabase_public.auth,
            table=self.database.table,
        )
        self.database.tables["story_tags"] = []

        response = self.client.get(f"/stories/{story_id}")

        self.assertEqual(response.status_code, 200)
        story = response.json()
        self.assertTrue(story["is_featured"])
        self.assertEqual(story["author_title"]["main_title"]["id"], "autor_fundador")


if __name__ == "__main__":
    unittest.main()
