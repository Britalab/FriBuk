# Pruebas de los límites contra el spam al publicar.
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
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import rate_limits  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase  # noqa: E402

ANA_ID = str(uuid.uuid4())
BOB_ID = str(uuid.uuid4())


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


class PublishLimiterTestCase(unittest.TestCase):
    def setUp(self):
        rate_limits.publish_requests.clear()

    def fill(self, bucket, user_id, count):
        for _ in range(count):
            rate_limits.limit_publish_requests(bucket, user_id)

    def test_blocks_after_the_limit(self):
        limit = rate_limits.PUBLISH_RATE_LIMITS["forum_reply"][0][0]
        self.fill("forum_reply", ANA_ID, limit)

        with self.assertRaises(HTTPException) as raised:
            rate_limits.limit_publish_requests("forum_reply", ANA_ID)
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(
            raised.exception.detail, rate_limits.PUBLISH_RATE_DETAILS["forum_reply"]
        )

    def test_limits_are_per_user_and_per_action(self):
        limit = rate_limits.PUBLISH_RATE_LIMITS["forum_reply"][0][0]
        self.fill("forum_reply", ANA_ID, limit)

        rate_limits.limit_publish_requests("forum_reply", BOB_ID)
        rate_limits.limit_publish_requests("story_comment", ANA_ID)

    def test_window_expires(self):
        limit, window = rate_limits.PUBLISH_RATE_LIMITS["forum_reply"][0]

        with mock.patch.object(rate_limits.time, "monotonic", return_value=1000.0):
            self.fill("forum_reply", ANA_ID, limit)
            with self.assertRaises(HTTPException):
                rate_limits.limit_publish_requests("forum_reply", ANA_ID)

        with mock.patch.object(
            rate_limits.time, "monotonic", return_value=1000.0 + window + 1
        ):
            rate_limits.limit_publish_requests("forum_reply", ANA_ID)

    def test_rejected_attempt_does_not_use_quota(self):
        (short_limit, short_window), (long_limit, _) = (
            rate_limits.PUBLISH_RATE_LIMITS["forum_reply"]
        )
        clock = [1000.0]

        with mock.patch.object(rate_limits.time, "monotonic", side_effect=lambda: clock[0]):
            # Se llena la ventana larga sin chocar nunca con la corta.
            for index in range(long_limit):
                if index and index % short_limit == 0:
                    clock[0] += short_window + 1
                rate_limits.limit_publish_requests("forum_reply", ANA_ID)

            clock[0] += short_window + 1
            for _ in range(3):
                with self.assertRaises(HTTPException):
                    rate_limits.limit_publish_requests("forum_reply", ANA_ID)

        short_key = ("forum_reply", short_window, ANA_ID)
        self.assertEqual(len(rate_limits.publish_requests[short_key]), 0)

    def test_every_action_has_a_message(self):
        self.assertEqual(
            set(rate_limits.PUBLISH_RATE_LIMITS), set(rate_limits.PUBLISH_RATE_DETAILS)
        )


class ForumTopicLimitTestCase(unittest.TestCase):
    def setUp(self):
        rate_limits.publish_requests.clear()
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [{"id": ANA_ID, "username": "ana", "role": "user"}],
            "forum_topics": [],
            "moderation_cases": []
        }
        users = {
            ANA_ID: SimpleNamespace(id=ANA_ID, email="ana@test", user_metadata={})
        }

        self.originals = (
            main.supabase_admin, main.supabase_public, main.add_forum_user_data
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(
            auth=FakeAuth(users), table=self.database.table
        )
        # Los nombres y fotos de quien publica no son parte de estas pruebas.
        main.add_forum_user_data = lambda items: items
        self.client = TestClient(main.app)

    def tearDown(self):
        (
            main.supabase_admin, main.supabase_public, main.add_forum_user_data
        ) = self.originals
        rate_limits.publish_requests.clear()

    def create_topic(self):
        return self.client.post(
            "/forum/topics",
            data={"title": "Un tema", "content": "Texto del tema"},
            headers=auth_header(ANA_ID)
        )

    def test_topic_creation_is_limited(self):
        limit = rate_limits.PUBLISH_RATE_LIMITS["forum_topic"][0][0]

        for _ in range(limit):
            self.assertEqual(self.create_topic().status_code, 200)

        blocked = self.create_topic()
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(
            blocked.json()["detail"], rate_limits.PUBLISH_RATE_DETAILS["forum_topic"]
        )
        self.assertEqual(len(self.database.tables["forum_topics"]), limit)


if __name__ == "__main__":
    unittest.main()
