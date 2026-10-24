# Pruebas de los recordatorios para autores: primer capítulo e inactividad.
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# otras pruebas. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import push  # noqa: E402
import reminders  # noqa: E402
from test_chapter_comments import FakeDatabase  # noqa: E402

AUTHOR_ID = str(uuid.uuid4())
NOW = datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)


def created(hours_ago: float) -> str:
    return main.utc_timestamp(NOW - timedelta(hours=hours_ago))


class FirstChapterReminderTests(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "stories": [],
            "chapters": [],
            "notifications": [],
            "first_chapter_reminders": [],
        }
        self.originals = (main.supabase_admin, push.schedule_notifications)
        main.supabase_admin = self.database
        push.schedule_notifications = lambda rows: None

    def tearDown(self):
        main.supabase_admin, push.schedule_notifications = self.originals

    def add_story(self, hours_ago, title="Mi historia", chapters=()):
        story_id = str(uuid.uuid4())
        self.database.tables["stories"].append({
            "id": story_id,
            "author_id": AUTHOR_ID,
            "title": title,
            "status": "published",
            "created_at": created(hours_ago),
        })
        for number, status in enumerate(chapters, start=1):
            self.database.tables["chapters"].append({
                "id": str(uuid.uuid4()),
                "story_id": story_id,
                "chapter_number": number,
                "status": status,
            })
        return story_id

    def reminders_for(self, story_id):
        return [
            row for row in self.database.tables["notifications"]
            if row["type"] == "story_first_chapter" and row["story_id"] == story_id
        ]

    def test_story_without_chapters_gets_one_reminder_after_a_day(self):
        story_id = self.add_story(hours_ago=25)

        self.assertEqual(reminders.send_first_chapter_reminders(NOW), 1)

        [notification] = self.reminders_for(story_id)
        self.assertEqual(notification["recipient_user_id"], AUTHOR_ID)
        self.assertIsNone(notification["actor_user_id"])
        self.assertEqual(notification["data"], {"story_title": "Mi historia"})

    def test_reminder_is_not_repeated_even_if_dismissed(self):
        story_id = self.add_story(hours_ago=25)
        reminders.send_first_chapter_reminders(NOW)
        self.database.tables["notifications"].clear()

        self.assertEqual(reminders.send_first_chapter_reminders(NOW + timedelta(hours=1)), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_a_failed_notification_is_retried_in_the_next_check(self):
        story_id = self.add_story(hours_ago=25)
        original = main.create_notification

        def reject(*_args, **_kwargs):
            raise RuntimeError("notifications_type_valid")

        main.create_notification = reject
        try:
            with self.assertRaises(RuntimeError):
                reminders.send_first_chapter_reminders(NOW)
        finally:
            main.create_notification = original

        self.assertEqual(self.database.tables["first_chapter_reminders"], [])
        self.assertEqual(reminders.send_first_chapter_reminders(NOW + timedelta(minutes=15)), 1)
        self.assertEqual(len(self.reminders_for(story_id)), 1)

    def test_recent_stories_wait_a_day(self):
        story_id = self.add_story(hours_ago=23)

        self.assertEqual(reminders.send_first_chapter_reminders(NOW), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_old_stories_are_left_alone(self):
        story_id = self.add_story(hours_ago=24 * 31)

        self.assertEqual(reminders.send_first_chapter_reminders(NOW), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_story_with_a_published_chapter_gets_no_reminder(self):
        story_id = self.add_story(hours_ago=25, chapters=("published",))

        self.assertEqual(reminders.send_first_chapter_reminders(NOW), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_draft_chapters_still_get_the_reminder(self):
        story_id = self.add_story(hours_ago=25, chapters=("draft",))

        self.assertEqual(reminders.send_first_chapter_reminders(NOW), 1)
        self.assertEqual(len(self.reminders_for(story_id)), 1)

    def test_paused_and_completed_stories_get_no_first_chapter_reminder(self):
        for status in ("paused", "completed"):
            story_id = self.add_story(hours_ago=25)
            self.database.tables["stories"][-1]["status"] = status

            reminders.send_first_chapter_reminders(NOW)
            self.assertEqual(self.reminders_for(story_id), [])

    def test_push_text_invites_to_publish(self):
        message = push.notification_message(
            {"type": "story_first_chapter", "story_id": "s",
             "data": {"story_title": "Mi historia"}},
            None,
        )

        self.assertEqual(
            message["body"],
            "Publica el primer capítulo de «Mi historia», ¡estamos emocionados por leerte!",
        )
        self.assertEqual(message["url"], "/stories/s/create-chapter")



class InactivityReminderTests(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "stories": [],
            "chapters": [],
            "notifications": [],
            "story_inactivity_reminders": [],
        }
        self.originals = (main.supabase_admin, push.schedule_notifications)
        main.supabase_admin = self.database
        push.schedule_notifications = lambda rows: None

    def tearDown(self):
        main.supabase_admin, push.schedule_notifications = self.originals

    def add_story(self, days_since_chapter, status="published", chapter_status="published"):
        story_id = str(uuid.uuid4())
        self.database.tables["stories"].append({
            "id": story_id,
            "author_id": AUTHOR_ID,
            "title": "Mi historia",
            "status": status,
        })
        self.add_chapter(story_id, days_since_chapter + 10)
        self.add_chapter(story_id, days_since_chapter, chapter_status)
        return story_id

    def add_chapter(self, story_id, days_ago, status="published"):
        self.database.tables["chapters"].append({
            "id": str(uuid.uuid4()),
            "story_id": story_id,
            "status": status,
            "updated_at": (NOW - timedelta(days=days_ago)).isoformat(),
        })

    def reminders_for(self, story_id):
        return [
            row for row in self.database.tables["notifications"]
            if row["type"] == "story_inactive" and row["story_id"] == story_id
        ]

    def send(self, days_later=0):
        return reminders.send_inactivity_reminders(NOW + timedelta(days=days_later))

    def test_two_weeks_without_chapters_sends_a_reminder(self):
        story_id = self.add_story(days_since_chapter=15)

        self.assertEqual(self.send(), 1)

        [notification] = self.reminders_for(story_id)
        self.assertEqual(notification["recipient_user_id"], AUTHOR_ID)
        self.assertEqual(notification["data"], {"story_title": "Mi historia", "days": 14})

    def test_reminders_at_two_weeks_and_a_month_then_stop(self):
        story_id = self.add_story(days_since_chapter=15)

        self.send()
        self.send(days_later=1)
        self.send(days_later=16)
        self.send(days_later=17)
        self.send(days_later=60)

        days = [row["data"]["days"] for row in self.reminders_for(story_id)]
        self.assertEqual(days, [14, 30])

    def test_recent_chapter_sends_nothing(self):
        story_id = self.add_story(days_since_chapter=13)

        self.assertEqual(self.send(), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_long_abandoned_stories_are_left_alone(self):
        story_id = self.add_story(days_since_chapter=40)

        self.assertEqual(self.send(), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_a_late_check_skips_the_two_week_reminder(self):
        story_id = self.add_story(days_since_chapter=31)

        self.send()

        days = [row["data"]["days"] for row in self.reminders_for(story_id)]
        self.assertEqual(days, [30])

    def test_paused_completed_and_draft_stories_get_no_reminder(self):
        for status in ("paused", "completed", "draft"):
            story_id = self.add_story(days_since_chapter=15, status=status)

            self.send()
            self.assertEqual(self.reminders_for(story_id), [])

    def test_draft_chapters_do_not_count_as_activity(self):
        story_id = self.add_story(days_since_chapter=15)
        self.add_chapter(story_id, days_ago=1, status="draft")

        self.assertEqual(self.send(), 1)

    def test_a_new_chapter_starts_the_count_again(self):
        story_id = self.add_story(days_since_chapter=15)
        self.send()

        self.add_chapter(story_id, days_ago=-1)
        self.send(days_later=10)
        self.send(days_later=16)

        days = [row["data"]["days"] for row in self.reminders_for(story_id)]
        self.assertEqual(days, [14, 14])

    def test_reminder_is_not_repeated_even_if_dismissed(self):
        story_id = self.add_story(days_since_chapter=15)
        self.send()
        self.database.tables["notifications"].clear()

        self.assertEqual(self.send(days_later=1), 0)
        self.assertEqual(self.reminders_for(story_id), [])

    def test_push_text_says_readers_are_waiting(self):
        message = push.notification_message(
            {"type": "story_inactive", "story_id": "s",
             "data": {"story_title": "Mi historia", "days": 14}},
            None,
        )

        self.assertEqual(
            message["body"],
            "Tus lectores siguen esperando el próximo capítulo de «Mi historia» ✨",
        )
        self.assertEqual(message["url"], "/stories/s/create-chapter")


class CronEndpointTests(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "stories": [{
                "id": str(uuid.uuid4()),
                "author_id": AUTHOR_ID,
                "title": "Mi historia",
                "status": "published",
                "created_at": main.utc_timestamp(datetime.now(timezone.utc) - timedelta(days=2)),
            }],
            "chapters": [],
            "notifications": [],
            "first_chapter_reminders": [],
            "story_inactivity_reminders": [],
            "story_schedules": [],
            "story_schedule_reminders": [],
        }
        self.originals = (
            main.supabase_admin, push.schedule_notifications,
            os.environ.get("REMINDERS_CRON_SECRET"),
        )
        main.supabase_admin = self.database
        push.schedule_notifications = lambda rows: None
        os.environ["REMINDERS_CRON_SECRET"] = "clave-de-prueba"
        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, push.schedule_notifications, secret = self.originals
        if secret is None:
            os.environ.pop("REMINDERS_CRON_SECRET", None)
        else:
            os.environ["REMINDERS_CRON_SECRET"] = secret

    def run_cron(self, secret="clave-de-prueba"):
        headers = {"X-Cron-Secret": secret} if secret else {}
        return self.client.post("/internal/reminders/run", headers=headers)

    def test_the_right_secret_runs_every_reminder(self):
        response = self.run_cron()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "sent": {"first_chapter": 1, "inactivity": 0, "schedule": 0},
            "skipped": False,
        })

    def test_a_wrong_or_missing_secret_is_rejected(self):
        self.assertEqual(self.run_cron("otra").status_code, 403)
        self.assertEqual(self.run_cron(None).status_code, 403)
        self.assertEqual(self.database.tables["notifications"], [])

    def test_without_a_configured_secret_it_is_disabled(self):
        os.environ.pop("REMINDERS_CRON_SECRET")

        self.assertEqual(self.run_cron().status_code, 503)
        self.assertEqual(self.database.tables["notifications"], [])

    def test_a_check_already_running_is_skipped(self):
        with reminders.run_lock:
            response = self.run_cron()

        self.assertEqual(response.json(), {"sent": None, "skipped": True})

if __name__ == "__main__":
    unittest.main()
