# Pruebas de los días de escritura: el calendario de cada historia y su
# recordatorio.
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import push  # noqa: E402
import reminders  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
READER_ID = str(uuid.uuid4())
STORY_ID = str(uuid.uuid4())
SANTIAGO = "America/Santiago"
# Martes 27 de octubre de 2026, 19:05 en Santiago (UTC-3).
TUESDAY_7PM = datetime(2026, 10, 27, 22, 5, tzinfo=timezone.utc)
TUESDAY, SATURDAY = 1, 5


class ScheduleTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "stories": [{
                "id": STORY_ID,
                "author_id": AUTHOR_ID,
                "title": "Mi historia",
                "status": "published",
            }],
            "chapters": [],
            "notifications": [],
            "story_schedules": [],
            "story_schedule_reminders": [],
        }
        users = {
            user_id: SimpleNamespace(id=user_id, email=f"{user_id}@test", user_metadata={})
            for user_id in (AUTHOR_ID, READER_ID)
        }
        self.originals = (
            main.supabase_admin, main.supabase_public, push.schedule_notifications
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        push.schedule_notifications = lambda rows: None
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public, push.schedule_notifications = self.originals

    def headers(self, user_id):
        return {"Authorization": f"Bearer {user_id}"}

    def save(self, user_id=AUTHOR_ID, **changes):
        body = {
            "days": [TUESDAY, SATURDAY],
            "hour": 19,
            "timezone": SANTIAGO,
            "show_publicly": True,
            **changes,
        }
        return self.client.put(
            f"/stories/{STORY_ID}/schedule", json=body, headers=self.headers(user_id)
        )

    def get(self, user_id=None):
        headers = self.headers(user_id) if user_id else {}
        return self.client.get(f"/stories/{STORY_ID}/schedule", headers=headers)


class ScheduleApiTests(ScheduleTestCase):
    def test_author_saves_and_reads_the_full_schedule(self):
        self.assertEqual(self.save(days=[SATURDAY, TUESDAY, TUESDAY]).status_code, 200)

        self.assertEqual(self.get(AUTHOR_ID).json()["schedule"], {
            "days": [TUESDAY, SATURDAY],
            "hour": 19,
            "timezone": SANTIAGO,
            "show_publicly": True,
        })

    def test_readers_only_see_the_days(self):
        self.save()

        self.assertEqual(self.get().json()["schedule"], {"days": [TUESDAY, SATURDAY]})
        self.assertEqual(self.get(READER_ID).json()["schedule"], {"days": [TUESDAY, SATURDAY]})

    def test_hidden_schedule_is_only_for_the_author(self):
        self.save(show_publicly=False)

        self.assertIsNone(self.get(READER_ID).json()["schedule"])
        self.assertIsNotNone(self.get(AUTHOR_ID).json()["schedule"])

    def test_readers_see_no_schedule_on_paused_stories(self):
        self.save()
        self.database.tables["stories"][0]["status"] = "paused"

        self.assertIsNone(self.get(READER_ID).json()["schedule"])

    def test_only_the_author_can_change_it(self):
        self.assertEqual(self.save(user_id=READER_ID).status_code, 403)
        self.assertEqual(self.database.tables["story_schedules"], [])

    def test_no_days_removes_the_schedule(self):
        self.save()
        self.save(days=[])

        self.assertEqual(self.database.tables["story_schedules"], [])
        self.assertIsNone(self.get(AUTHOR_ID).json()["schedule"])

    def test_invalid_values_are_rejected(self):
        self.assertEqual(self.save(days=[7]).status_code, 400)
        self.assertEqual(self.save(hour=24).status_code, 400)
        self.assertEqual(self.save(timezone="Marte/Olympus").status_code, 400)
        self.assertEqual(self.database.tables["story_schedules"], [])


class ScheduleReminderTests(ScheduleTestCase):
    def setUp(self):
        super().setUp()
        self.save()

    def reminders(self):
        return [
            row for row in self.database.tables["notifications"]
            if row["type"] == "story_schedule"
        ]

    def send(self, now=TUESDAY_7PM):
        return reminders.send_schedule_reminders(now)

    def test_reminder_arrives_on_a_writing_day_at_the_chosen_hour(self):
        self.assertEqual(self.send(), 1)

        [notification] = self.reminders()
        self.assertEqual(notification["recipient_user_id"], AUTHOR_ID)
        self.assertEqual(notification["story_id"], STORY_ID)
        self.assertEqual(notification["data"], {"story_title": "Mi historia"})

    def test_only_once_per_day_even_if_dismissed(self):
        self.send()
        self.database.tables["notifications"].clear()

        self.assertEqual(self.send(TUESDAY_7PM + timedelta(minutes=15)), 0)
        self.assertEqual(self.reminders(), [])

    def test_not_before_the_hour(self):
        self.assertEqual(self.send(TUESDAY_7PM - timedelta(minutes=10)), 0)

    def test_not_too_late_in_the_day(self):
        self.assertEqual(self.send(TUESDAY_7PM + timedelta(hours=3)), 0)

    def test_not_on_other_days(self):
        self.assertEqual(self.send(TUESDAY_7PM + timedelta(days=1)), 0)

    def test_next_writing_day_reminds_again(self):
        self.send()

        self.assertEqual(self.send(TUESDAY_7PM + timedelta(days=4)), 1)
        self.assertEqual(len(self.reminders()), 2)

    def test_uses_the_author_time_zone(self):
        # Las 19:05 de Ciudad de México (UTC-6) son las 22:05 de Santiago.
        self.save(timezone="America/Mexico_City")

        self.assertEqual(self.send(), 0)
        self.assertEqual(self.send(TUESDAY_7PM + timedelta(hours=3)), 1)

    def test_no_reminder_if_a_chapter_was_published_that_day(self):
        self.database.tables["chapters"].append({
            "id": str(uuid.uuid4()),
            "story_id": STORY_ID,
            "status": "published",
            # Martes a las 10:00 en Santiago.
            "updated_at": (TUESDAY_7PM - timedelta(hours=9)).isoformat(),
        })

        self.assertEqual(self.send(), 0)

    def test_a_chapter_from_the_day_before_does_not_count(self):
        self.database.tables["chapters"].append({
            "id": str(uuid.uuid4()),
            "story_id": STORY_ID,
            "status": "published",
            "updated_at": (TUESDAY_7PM - timedelta(days=1)).isoformat(),
        })

        self.assertEqual(self.send(), 1)

    def test_paused_completed_and_draft_stories_get_no_reminder(self):
        for status in ("paused", "completed", "draft"):
            self.database.tables["stories"][0]["status"] = status
            self.assertEqual(self.send(), 0)

    def test_push_text(self):
        message = push.notification_message(
            {"type": "story_schedule", "story_id": "s",
             "data": {"story_title": "Mi historia"}},
            None,
        )

        self.assertEqual(
            message["body"],
            "Hoy toca capítulo de «Mi historia». ¡Tus lectores te esperan!",
        )
        self.assertEqual(message["url"], "/stories/s/create-chapter")


if __name__ == "__main__":
    unittest.main()
