# Pruebas del registro de lecturas y de los reconocimientos de la fase 2
# (lectores, Autor Popular y Autor en Ascenso).
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
import uuid
from datetime import date, datetime, timedelta, timezone
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
STORY_ID = str(uuid.uuid4())
CHAPTER_1 = str(uuid.uuid4())
CHAPTER_2 = str(uuid.uuid4())


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


def words(count):
    return " ".join(["palabra"] * count)


class ReadingTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [
                {"id": user_id, "username": name, "role": "user"}
                for user_id, name in ((AUTHOR_ID, "autora"), (READER_ID, "lectora"), (OTHER_ID, "otra"))
            ],
            "stories": [
                {"id": STORY_ID, "author_id": AUTHOR_ID, "status": "completed",
                 "genre": "Terror", "created_at": "2026-01-01"},
            ],
            "chapters": [
                # 500 palabras: 2 minutos de lectura; para terminarlo hace
                # falta leer al menos un cuarto (30 segundos).
                {"id": CHAPTER_1, "story_id": STORY_ID, "chapter_number": 1,
                 "status": "published", "content": words(500)},
                {"id": CHAPTER_2, "story_id": STORY_ID, "chapter_number": 2,
                 "status": "published", "content": words(500)},
            ],
            "chapter_reads": [],
            "reading_activity": [],
            "chapter_comments": [],
            "chapter_comment_reactions": [],
            "comments": [],
            "first_reader_claims": [],
            "user_follows": [],
            "user_badges": [],
            "founder_slots": [],
            "user_badge_display": [],
            "popular_authors": [],
            "temporary_titles": [],
            "recommendation_snapshots": [],
            "votes": [],
            "forum_topics": [],
            "forum_replies": [],
            "forum_interactions": [],
        }
        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (AUTHOR_ID, READER_ID, OTHER_ID)
        }

        self.originals = (main.supabase_admin, main.supabase_public, main.run_notification_task)
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        # Las tareas en segundo plano se ejecutan en el acto.
        main.run_notification_task = lambda task, *args: task(*args)
        badges.popular_cache.clear()
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public, main.run_notification_task = self.originals
        badges.popular_cache.clear()

    # ---------- utilidades ----------

    def read(self, chapter_id=CHAPTER_1, user_id=READER_ID, seconds=30, reached_end=False):
        return self.client.post(
            f"/chapters/{chapter_id}/reading",
            json={"seconds": seconds, "reached_end": reached_end},
            headers=auth_header(user_id),
        )

    def rewind(self, minutes=5):
        # Simula que el último aviso llegó hace un rato.
        past = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
        for row in self.database.tables["chapter_reads"]:
            row["last_read_at"] = past

    def read_row(self, chapter_id=CHAPTER_1, user_id=READER_ID):
        return next(
            row for row in self.database.tables["chapter_reads"]
            if row["chapter_id"] == chapter_id and row["user_id"] == user_id
        )

    def finish_chapter(self, chapter_id, user_id=READER_ID):
        self.read(chapter_id, user_id, seconds=60)
        self.rewind()
        self.read(chapter_id, user_id, seconds=60, reached_end=True)

    def levels(self, user_id=READER_ID):
        return {
            row["badge_id"]: row["level"]
            for row in self.database.tables["user_badges"]
            if row["user_id"] == user_id
        }

    # ---------- registro de lecturas ----------

    def test_reading_is_recorded_with_a_daily_row(self):
        response = self.read(seconds=30)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.read_row()["seconds_read"], 30)
        activity = self.database.tables["reading_activity"]
        self.assertEqual(len(activity), 1)
        self.assertEqual(activity[0]["story_id"], STORY_ID)

    def test_the_author_reading_is_not_recorded(self):
        response = self.read(user_id=AUTHOR_ID)

        self.assertFalse(response.json()["recorded"])
        self.assertEqual(self.database.tables["chapter_reads"], [])

    def test_seconds_cannot_be_inflated(self):
        self.read(seconds=5000)
        self.assertEqual(self.read_row()["seconds_read"], 60)

        # Un segundo aviso inmediato no puede sumar otro minuto.
        self.read(seconds=60)
        self.assertLessEqual(self.read_row()["seconds_read"], 66)

    def test_reaching_the_end_too_fast_does_not_complete(self):
        response = self.read(seconds=10, reached_end=True)

        self.assertFalse(response.json()["completed"])

    def test_reaching_the_end_after_reading_completes_and_qualifies(self):
        self.read(seconds=20)
        self.rewind()
        response = self.read(seconds=20, reached_end=True)

        self.assertTrue(response.json()["completed"])
        self.assertTrue(response.json()["can_be_first_reader"])

    def test_ten_minutes_qualify_without_finishing(self):
        for _ in range(10):
            self.read(seconds=60)
            self.rewind()

        self.assertTrue(self.read_row()["qualified_at"])
        self.assertIsNone(self.read_row()["completed_at"])

    # ---------- Maratonista y Lector Fundador ----------

    def test_marathon_needs_every_chapter(self):
        self.finish_chapter(CHAPTER_1)
        self.assertEqual(badges.finished_stories(READER_ID), 0)

        self.finish_chapter(CHAPTER_2)
        self.assertEqual(badges.finished_stories(READER_ID), 1)

    def test_reader_founder_needs_a_finished_story_and_three_comments(self):
        self.finish_chapter(CHAPTER_1)
        self.finish_chapter(CHAPTER_2)
        badges.refresh_user_badges(READER_ID)
        self.assertNotIn("lector_fundador", self.levels())

        self.database.tables["chapter_comments"] = [
            {"id": str(uuid.uuid4()), "chapter_id": CHAPTER_1, "user_id": READER_ID, "status": "visible"}
            for _ in range(3)
        ]
        badges.refresh_user_badges(READER_ID)

        self.assertEqual(self.levels().get("lector_fundador"), 1)
        reader_slots = [r for r in self.database.tables["founder_slots"] if r["kind"] == "reader"]
        self.assertEqual([r["slot"] for r in reader_slots], [1])

    # ---------- Primer Lector ----------

    def test_first_reader_goes_to_the_first_comment_after_reading(self):
        chapter = {"id": CHAPTER_1, "story_author_id": AUTHOR_ID}
        # Comenta sin haber leído: no cuenta.
        badges.claim_first_reader(chapter, OTHER_ID, str(uuid.uuid4()))
        self.assertEqual(self.database.tables["first_reader_claims"], [])

        self.finish_chapter(CHAPTER_1)
        badges.claim_first_reader(chapter, READER_ID, str(uuid.uuid4()))
        self.finish_chapter(CHAPTER_1, OTHER_ID)
        badges.claim_first_reader(chapter, OTHER_ID, str(uuid.uuid4()))

        claims = self.database.tables["first_reader_claims"]
        self.assertEqual([claim["user_id"] for claim in claims], [READER_ID])
        self.assertEqual(self.levels().get("primer_lector"), 1)

    def test_the_author_cannot_be_first_reader(self):
        chapter = {"id": CHAPTER_1, "story_author_id": AUTHOR_ID}
        badges.claim_first_reader(chapter, AUTHOR_ID, str(uuid.uuid4()))

        self.assertEqual(self.database.tables["first_reader_claims"], [])

    # ---------- Comentarista ----------

    def test_only_reactions_from_the_story_author_count(self):
        comment_ids = [str(uuid.uuid4()) for _ in range(12)]
        self.database.tables["chapter_comments"] = [
            {"id": comment_id, "chapter_id": CHAPTER_1, "user_id": READER_ID, "status": "visible"}
            for comment_id in comment_ids
        ]
        self.database.tables["chapter_comment_reactions"] = (
            [{"comment_id": comment_id, "user_id": AUTHOR_ID} for comment_id in comment_ids[:10]]
            + [{"comment_id": comment_id, "user_id": OTHER_ID} for comment_id in comment_ids]
        )

        self.assertEqual(badges.author_reactions_received(READER_ID), 10)
        badges.refresh_user_badges(READER_ID)
        self.assertEqual(self.levels().get("comentarista"), 1)

    # ---------- Lector Fiel ----------

    def add_reading_days(self, first_monday, weeks, days_per_week):
        for week in range(weeks):
            for weekday in range(days_per_week):
                day = first_monday + timedelta(weeks=week, days=weekday)
                self.database.tables["reading_activity"].append(
                    {"user_id": READER_ID, "story_id": STORY_ID, "day": day.isoformat(), "seconds": 60}
                )

    def test_loyal_reader_needs_four_weeks_in_a_row_and_a_follow(self):
        self.add_reading_days(date(2026, 3, 2), weeks=4, days_per_week=5)
        self.assertEqual(badges.best_loyal_streak(READER_ID), 0)  # no sigue a nadie

        self.database.tables["user_follows"] = [
            {"follower_id": READER_ID, "following_id": AUTHOR_ID, "created_at": "2026-01-01T00:00:00+00:00"}
        ]
        self.assertEqual(badges.best_loyal_streak(READER_ID), 4)

    def test_weeks_with_fewer_days_break_the_streak(self):
        self.database.tables["user_follows"] = [
            {"follower_id": READER_ID, "following_id": AUTHOR_ID, "created_at": "2026-01-01T00:00:00+00:00"}
        ]
        self.add_reading_days(date(2026, 3, 2), weeks=2, days_per_week=5)
        self.add_reading_days(date(2026, 3, 16), weeks=1, days_per_week=4)
        self.add_reading_days(date(2026, 3, 23), weeks=3, days_per_week=6)

        self.assertEqual(badges.best_loyal_streak(READER_ID), 3)

    # ---------- Autor en Ascenso ----------

    def test_rising_author_needs_100_new_followers_in_30_days(self):
        recent = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        self.database.tables["user_follows"] = (
            [{"follower_id": str(uuid.uuid4()), "following_id": AUTHOR_ID, "created_at": recent}] * 99
            + [{"follower_id": str(uuid.uuid4()), "following_id": AUTHOR_ID, "created_at": old}] * 50
        )
        badges.refresh_user_badges(AUTHOR_ID)
        self.assertEqual(self.database.tables["temporary_titles"], [])

        self.database.tables["user_follows"].append(
            {"follower_id": str(uuid.uuid4()), "following_id": AUTHOR_ID, "created_at": recent}
        )
        badges.refresh_user_badges(AUTHOR_ID)

        data = self.client.get(f"/users/{AUTHOR_ID}/badges").json()
        self.assertIn("autor_en_ascenso", [title["id"] for title in data["titles"]])

    def test_rising_title_expires(self):
        self.database.tables["temporary_titles"] = [{
            "user_id": AUTHOR_ID, "badge_id": "autor_en_ascenso",
            "ends_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }]

        data = self.client.get(f"/users/{AUTHOR_ID}/badges").json()
        self.assertEqual(data["titles"], [])

    # ---------- Autor Popular ----------

    def test_popular_is_the_top_ten_of_last_month(self):
        last_month = badges.previous_month(datetime.now(timezone.utc).date())
        stories = {}
        # 11 autores: el que tiene menos lectores queda fuera del top 10.
        for index in range(11):
            author_id, story_id = str(uuid.uuid4()), str(uuid.uuid4())
            stories[author_id] = story_id
            self.database.tables["stories"].append(
                {"id": story_id, "author_id": author_id, "status": "published"}
            )
            for reader in range(index + 1):
                self.database.tables["reading_activity"].append({
                    "user_id": f"lector-{reader}", "story_id": story_id,
                    "day": (last_month + timedelta(days=3)).isoformat(), "seconds": 60,
                })
        # Leerse a sí mismo no suma.
        self.database.tables["reading_activity"].append({
            "user_id": AUTHOR_ID, "story_id": STORY_ID,
            "day": (last_month + timedelta(days=3)).isoformat(), "seconds": 60,
        })

        holders = badges.popular_authors()

        self.assertEqual(len(holders), 10)
        self.assertNotIn(AUTHOR_ID, holders)
        least_read = min(stories, key=lambda author: len(
            [r for r in self.database.tables["reading_activity"] if r["story_id"] == stories[author]]
        ))
        self.assertNotIn(least_read, holders)
        self.assertEqual(len(self.database.tables["popular_authors"]), 10)

        top = max(holders, key=holders.get)
        title = self.client.get(f"/users/{top}/badges").json()["main_title"]
        self.assertEqual(title["id"], "autor_popular")
        self.assertEqual(title["period"], badges.month_label(last_month))

    # ---------- Lector Versátil ----------

    def test_versatile_reader_counts_genres_of_finished_chapters(self):
        romance_story, romance_chapter = str(uuid.uuid4()), str(uuid.uuid4())
        self.database.tables["stories"].append(
            {"id": romance_story, "author_id": OTHER_ID, "status": "published", "genre": "Romance"}
        )
        self.database.tables["chapters"].append(
            {"id": romance_chapter, "story_id": romance_story, "chapter_number": 1,
             "status": "published", "content": words(500)}
        )

        self.finish_chapter(CHAPTER_1)
        # Abrir un capítulo sin terminarlo no suma el género.
        self.read(romance_chapter, seconds=20)
        self.assertEqual(badges.genres_read(READER_ID), 1)

        self.rewind()
        self.read(romance_chapter, seconds=20, reached_end=True)
        badges.refresh_user_badges(READER_ID)

        self.assertEqual(badges.genres_read(READER_ID), 2)
        self.assertEqual(self.levels().get("lector_versatil"), 1)

    # ---------- Descubridor ----------

    def add_readers(self, count):
        for _ in range(count):
            self.database.tables["chapter_reads"].append(
                {"user_id": str(uuid.uuid4()), "chapter_id": CHAPTER_1, "story_id": STORY_ID}
            )

    def test_recommending_saves_the_readers_of_the_moment(self):
        self.add_readers(40)
        badges.record_recommendation(READER_ID, STORY_ID)

        snapshot = self.database.tables["recommendation_snapshots"][0]
        self.assertEqual(snapshot["author_readers"], 40)
        self.assertEqual(snapshot["author_id"], AUTHOR_ID)

        # El autor no puede descubrirse a sí mismo.
        badges.record_recommendation(AUTHOR_ID, STORY_ID)
        self.assertEqual(len(self.database.tables["recommendation_snapshots"]), 1)

        badges.forget_recommendation(READER_ID, STORY_ID)
        self.assertEqual(self.database.tables["recommendation_snapshots"], [])

    def test_discoverer_needs_the_author_to_reach_100(self):
        self.database.tables["recommendation_snapshots"] = [
            {"user_id": READER_ID, "story_id": STORY_ID, "author_id": AUTHOR_ID, "author_readers": 40},
            # Recomendado cuando ya era conocido: no cuenta.
            {"user_id": READER_ID, "story_id": str(uuid.uuid4()), "author_id": OTHER_ID, "author_readers": 150},
        ]
        self.add_readers(99)
        self.assertEqual(badges.discoveries(READER_ID), 0)

        # El lector número 100 recalcula a quien lo descubrió.
        self.finish_chapter(CHAPTER_2, OTHER_ID)

        self.assertEqual(badges.discoveries(READER_ID), 1)
        self.assertEqual(self.levels().get("descubridor"), 1)

    # ---------- perfil propio ----------

    def test_my_badges_include_reader_progress(self):
        self.finish_chapter(CHAPTER_1)

        data = self.client.get("/me/badges", headers=auth_header(READER_ID)).json()

        catalog = {item["id"]: item for item in data["catalog"]}
        self.assertEqual(catalog["maratonista"]["progress"], {"current": 0, "next": 5})
        self.assertEqual(catalog["lector_fundador"]["group"], "lector")
        self.assertEqual(data["founders"]["reader"]["remaining"], 500)
        self.assertFalse(data["has_published"])

    # ---------- seguir leyendo ----------

    def test_removing_a_story_from_continue_reading_only_touches_my_row(self):
        self.database.tables["reading_progress"] = [
            {"user_id": READER_ID, "story_id": STORY_ID, "chapter_id": CHAPTER_2,
             "paragraph_index": 3, "updated_at": "2026-10-01T00:00:00+00:00"},
            {"user_id": OTHER_ID, "story_id": STORY_ID, "chapter_id": CHAPTER_1,
             "paragraph_index": 0, "updated_at": "2026-10-01T00:00:00+00:00"},
        ]

        response = self.client.delete(
            f"/me/reading-progress/{STORY_ID}", headers=auth_header(READER_ID)
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row["user_id"] for row in self.database.tables["reading_progress"]],
            [OTHER_ID],
        )
        items = self.client.get(
            "/me/reading-progress", headers=auth_header(READER_ID)
        ).json()["items"]
        self.assertEqual(items, [])


if __name__ == "__main__":
    unittest.main()
