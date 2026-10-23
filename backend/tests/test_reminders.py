# Pruebas del recordatorio para publicar el primer capítulo.
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

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


if __name__ == "__main__":
    unittest.main()
