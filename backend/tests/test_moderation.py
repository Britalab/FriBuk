# Pruebas de la moderación de contenido: reportes, retiro automático y
# manual, restauración y visibilidad de publicaciones e imágenes.
#
# No usan la base de datos ni el almacenamiento reales: los reemplazan por
# versiones en memoria. Ejecutar desde la carpeta backend:
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
import moderation  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase, FakeQuery  # noqa: E402

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
XSS_TEXT = '<script>alert("x")</script><img src=x onerror=alert(1)>'


# ============================================================
# SUPABASE EN MEMORIA
# ============================================================

class SingleRowQuery(FakeQuery):
    # Igual que la consulta de prueba, pero .single() devuelve una fila.
    def __init__(self, database, table_name):
        super().__init__(database, table_name)
        self.single_row = False

    def single(self):
        self.single_row = True
        return self

    def execute(self):
        response = super().execute()
        if self.single_row:
            response.data = response.data[0] if response.data else None
        return response


class FakeBucket:
    def __init__(self, files, name):
        self.files = files
        self.name = name

    def upload(self, path, data, _options=None):
        self.files[(self.name, path)] = data

    def move(self, source, destination):
        if (self.name, source) not in self.files:
            raise RuntimeError("archivo no encontrado")
        self.files[(self.name, destination)] = self.files.pop((self.name, source))

    def remove(self, paths):
        for path in paths:
            self.files.pop((self.name, path), None)

    def get_public_url(self, path):
        return f"https://fake.test/storage/v1/object/public/{self.name}/{path}"

    def list(self, folder=None, _options=None):
        return [
            {"name": path.rsplit("/", 1)[-1], "updated_at": "2026-01-01T00:00:00"}
            for bucket, path in self.files
            if bucket == self.name and path.rsplit("/", 1)[0] == folder
        ]


class FakeStorage:
    def __init__(self):
        self.files = {}

    def from_(self, name):
        return FakeBucket(self.files, name)

    def paths(self, bucket):
        return sorted(path for name, path in self.files if name == bucket)


class FakeAuthAdmin:
    def __init__(self, users):
        self.users = users

    def get_user_by_id(self, user_id):
        return SimpleNamespace(user=self.users.get(user_id))

    def update_user_by_id(self, user_id, attributes):
        self.users[user_id].user_metadata = dict(attributes["user_metadata"])
        return SimpleNamespace(user=self.users[user_id])


class ModerationDatabase(FakeDatabase):
    def __init__(self, users):
        super().__init__()
        self.storage = FakeStorage()
        self.auth = SimpleNamespace(admin=FakeAuthAdmin(users))

    def table(self, table_name):
        return SingleRowQuery(self, table_name)


# ============================================================
# DATOS DE PRUEBA
# ============================================================

OWNER_ID = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())
OUTSIDER_ID = str(uuid.uuid4())
REPORTER_IDS = [str(uuid.uuid4()) for _ in range(10)]
NEW_ACCOUNT_IDS = [str(uuid.uuid4()) for _ in range(5)]

TOPIC_ID = str(uuid.uuid4())
REPLY_ID = str(uuid.uuid4())
OTHER_REPLY_ID = str(uuid.uuid4())
STORY_ID = str(uuid.uuid4())

TOPIC_IMAGE_PATH = f"topics/{OWNER_ID}/imagen.png"
TOPIC_IMAGE_URL = (
    f"https://fake.test/storage/v1/object/public/forum-images/{TOPIC_IMAGE_PATH}"
)


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


class ModerationTestCase(unittest.TestCase):
    def setUp(self):
        now = datetime.now(timezone.utc)
        old = now - timedelta(days=30)

        def user(user_id, username, created_at=old):
            return SimpleNamespace(
                id=user_id,
                email=f"{username}@privado.test",
                user_metadata={"username": username},
                created_at=created_at
            )

        self.users = {
            OWNER_ID: user(OWNER_ID, "autora"),
            ADMIN_ID: user(ADMIN_ID, "moderadora"),
            OUTSIDER_ID: user(OUTSIDER_ID, "visitante")
        }
        for index, user_id in enumerate(REPORTER_IDS):
            self.users[user_id] = user(user_id, f"lector{index}")
        for index, user_id in enumerate(NEW_ACCOUNT_IDS):
            self.users[user_id] = user(user_id, f"nueva{index}", created_at=now)

        self.database = ModerationDatabase(self.users)
        self.database.tables = {
            "users": [
                {
                    "id": user_id,
                    "username": account.user_metadata["username"],
                    "role": "admin" if user_id == ADMIN_ID else "user"
                }
                for user_id, account in self.users.items()
            ],
            "forum_topics": [{
                "id": TOPIC_ID, "user_id": OWNER_ID, "title": "Mi tema",
                "content": "Contenido del tema", "image_url": TOPIC_IMAGE_URL,
                "created_at": "2026-01-01T10:00:00+00:00"
            }],
            "forum_replies": [
                {
                    "id": REPLY_ID, "topic_id": TOPIC_ID, "user_id": OWNER_ID,
                    "content": "Respuesta de la autora", "image_url": None,
                    "created_at": "2026-01-01T11:00:00+00:00"
                },
                {
                    "id": OTHER_REPLY_ID, "topic_id": TOPIC_ID, "user_id": OUTSIDER_ID,
                    "content": "Otra respuesta", "image_url": None,
                    "created_at": "2026-01-01T12:00:00+00:00"
                }
            ],
            "forum_interactions": [],
            "stories": [{
                "id": STORY_ID, "author_id": OWNER_ID, "title": "Mi historia",
                "status": "published", "cover_url": None
            }],
            "moderation_cases": [],
            "content_reports": [],
            "moderation_actions": []
        }
        self.database.storage.from_("forum-images").upload(TOPIC_IMAGE_PATH, PNG_BYTES)

        self.originals = (
            main.supabase_admin, main.supabase_public, main.run_notification_task,
            main.home_banner_cache
        )
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(self.users))
        main.run_notification_task = lambda *args, **kwargs: None
        main.home_banner_cache = None
        main.user_search_avatars.clear()
        moderation.report_requests.clear()

        self.client = TestClient(main.app)

    def tearDown(self):
        (
            main.supabase_admin, main.supabase_public, main.run_notification_task,
            main.home_banner_cache
        ) = self.originals

    # ---------- utilidades ----------

    def report(self, user_id, target_type="forum_topic", target_id=TOPIC_ID,
               reason="sexual", details=None):
        body = {"target_type": target_type, "target_id": target_id, "reason": reason}
        if details is not None:
            body["details"] = details
        return self.client.post(
            "/moderation/reports", json=body, headers=auth_header(user_id)
        )

    def remove(self, user_id=ADMIN_ID, target_type="forum_topic", target_id=TOPIC_ID,
               reason="prohibited", note=None):
        return self.client.post(
            "/moderation/remove",
            json={
                "target_type": target_type, "target_id": target_id,
                "reason": reason, "note": note
            },
            headers=auth_header(user_id)
        )

    def restore(self, case_id, user_id=ADMIN_ID, note=None):
        return self.client.post(
            f"/moderation/cases/{case_id}/restore",
            json={"note": note},
            headers=auth_header(user_id)
        )

    def cases(self, user_id=ADMIN_ID, status="all"):
        return self.client.get(
            f"/moderation/cases?status={status}", headers=auth_header(user_id)
        )

    def case(self, target_type="forum_topic", target_id=TOPIC_ID):
        return next(
            row for row in self.database.tables["moderation_cases"]
            if row["target_type"] == target_type and row["target_id"] == target_id
        )

    def topic(self, user_id=None):
        headers = auth_header(user_id) if user_id else {}
        return self.client.get(f"/forum/topics/{TOPIC_ID}", headers=headers)

    def replies(self, user_id=None):
        headers = auth_header(user_id) if user_id else {}
        return self.client.get(
            f"/forum/topics/{TOPIC_ID}/replies", headers=headers
        ).json()

    def topic_list_ids(self):
        return [topic["id"] for topic in self.client.get("/forum/topics").json()]

    def upload(self, path, user_id, data=PNG_BYTES, content_type="image/png"):
        return self.client.post(
            path,
            files={"file": ("imagen.png", data, content_type)},
            headers=auth_header(user_id)
        )

    def public_profile(self, user_id=OWNER_ID):
        return self.client.get(f"/users/{user_id}/public-profile").json()["user"]

    # ============================================================
    # REPORTAR
    # ============================================================

    # 1
    def test_user_can_report_content(self):
        response = self.report(REPORTER_IDS[0], reason="harassment")
        self.assertEqual(response.status_code, 200, response.text)

        report = self.database.tables["content_reports"][0]
        self.assertEqual(report["reporter_id"], REPORTER_IDS[0])
        self.assertEqual(report["reason"], "harassment")
        self.assertEqual(report["target_id"], TOPIC_ID)
        self.assertTrue(report["created_at"])

        case = self.case()
        self.assertEqual(case["status"], "open")
        self.assertEqual(case["owner_id"], OWNER_ID)
        self.assertEqual(case["report_count"], 1)
        self.assertEqual(case["snapshot"]["title"], "Mi tema")

    def test_report_requires_session_and_valid_data(self):
        anonymous = self.client.post(
            "/moderation/reports",
            json={"target_type": "forum_topic", "target_id": TOPIC_ID, "reason": "spam"}
        )
        self.assertIn(anonymous.status_code, (401, 403))

        self.assertEqual(self.report(REPORTER_IDS[0], reason="aburrido").status_code, 400)
        self.assertEqual(
            self.report(REPORTER_IDS[0], target_type="chapter").status_code, 400
        )
        self.assertEqual(
            self.report(REPORTER_IDS[0], target_id=str(uuid.uuid4())).status_code, 404
        )
        self.assertEqual(
            self.report(REPORTER_IDS[0], target_id="no-es-un-id").status_code, 404
        )
        self.assertEqual(self.database.tables["content_reports"], [])

    def test_explanation_is_kept_only_for_other(self):
        self.report(REPORTER_IDS[0], reason="other", details="  Es publicidad encubierta  ")
        self.report(REPORTER_IDS[1], reason="spam", details="No debería guardarse")
        too_long = self.report(
            REPORTER_IDS[2], reason="other",
            details="a" * (moderation.REPORT_DETAILS_MAX_LENGTH + 1)
        )
        self.assertEqual(too_long.status_code, 400)

        details = [row["details"] for row in self.database.tables["content_reports"]]
        self.assertEqual(details, ["Es publicidad encubierta", None])

    # 2, 3 y 12
    def test_same_user_cannot_report_twice(self):
        self.assertEqual(self.report(REPORTER_IDS[0]).status_code, 200)

        for _ in range(5):
            duplicate = self.report(REPORTER_IDS[0], reason="spam")
            self.assertEqual(duplicate.status_code, 409)

        self.assertEqual(len(self.database.tables["content_reports"]), 1)
        self.assertEqual(self.case()["report_count"], 1)
        # Cinco intentos de la misma persona no retiran nada.
        self.assertEqual(self.case()["status"], "open")
        self.assertEqual(self.topic().status_code, 200)

    # 4
    def test_report_rate_limit(self):
        limit = moderation.REPORT_RATE_LIMITS[0][0]
        topic_ids = [str(uuid.uuid4()) for _ in range(limit + 1)]
        self.database.tables["forum_topics"].extend(
            {
                "id": topic_id, "user_id": OWNER_ID, "title": "Otro", "content": "x",
                "image_url": None, "created_at": "2026-01-02T10:00:00+00:00"
            }
            for topic_id in topic_ids
        )

        for topic_id in topic_ids[:limit]:
            response = self.report(REPORTER_IDS[0], target_id=topic_id)
            self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(
            self.report(REPORTER_IDS[0], target_id=topic_ids[limit]).status_code, 429
        )
        # El límite es por persona.
        self.assertEqual(
            self.report(REPORTER_IDS[1], target_id=topic_ids[limit]).status_code, 200
        )

    # 16
    def test_own_content_and_new_accounts_cannot_force_a_removal(self):
        self.assertEqual(self.report(OWNER_ID).status_code, 400)

        # Las cuentas recién creadas pueden reportar, pero no suman.
        for user_id in NEW_ACCOUNT_IDS:
            self.assertEqual(self.report(user_id).status_code, 200)

        case = self.case()
        self.assertEqual(case["report_count"], 5)
        self.assertEqual(case["status"], "open")
        self.assertIn(TOPIC_ID, self.topic_list_ids())

        # Con cuatro cuentas antiguas más sigue sin alcanzar el umbral.
        for user_id in REPORTER_IDS[:4]:
            self.report(user_id)
        self.assertEqual(self.case()["status"], "open")

        self.report(REPORTER_IDS[4])
        self.assertEqual(self.case()["status"], "removed")

    # ============================================================
    # RETIRO AUTOMÁTICO
    # ============================================================

    # 11
    def test_four_reports_do_not_remove(self):
        for user_id in REPORTER_IDS[:4]:
            self.assertEqual(self.report(user_id).status_code, 200)

        self.assertEqual(self.case()["status"], "open")
        self.assertEqual(self.topic().status_code, 200)
        self.assertIn(TOPIC_ID, self.topic_list_ids())
        self.assertEqual(self.database.tables["moderation_actions"], [])

    # 10 y 13
    def test_five_distinct_users_remove_automatically(self):
        for user_id in REPORTER_IDS[:5]:
            self.assertEqual(self.report(user_id).status_code, 200)

        case = self.case()
        self.assertEqual(case["status"], "removed")
        self.assertEqual(case["removal_reason"], "many_reports")
        self.assertTrue(case["removal_automatic"])
        self.assertIsNone(case["removed_by"])

        action = self.database.tables["moderation_actions"][0]
        self.assertEqual(action["action"], "auto_removed")
        self.assertEqual(action["reason"], "many_reports")
        self.assertIsNone(action["actor_id"])

        # El contenido no se borra: sigue guardado para la revisión.
        self.assertEqual(len(self.database.tables["forum_topics"]), 1)
        self.assertEqual(case["snapshot"]["text"], "Contenido del tema")
        self.assertEqual(self.report(REPORTER_IDS[5]).status_code, 400)

        admin_case = self.cases().json()["cases"][0]
        self.assertEqual(admin_case["removal"]["reason_label"], "Alto número de reportes")
        self.assertTrue(admin_case["removal"]["automatic"])

    # ============================================================
    # PANEL Y PERMISOS
    # ============================================================

    # 5
    def test_admin_sees_reports_in_the_panel(self):
        self.report(REPORTER_IDS[0], reason="sexual")
        self.report(REPORTER_IDS[1], reason="sexual")
        self.report(REPORTER_IDS[2], reason="other", details="Mira la imagen")

        response = self.cases()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["auto_remove_threshold"], 5)

        case = body["cases"][0]
        self.assertEqual(case["target_label"], "Tema del foro")
        self.assertEqual(case["owner"]["username"], "autora")
        self.assertEqual(case["content"]["title"], "Mi tema")
        self.assertEqual(case["content"]["text"], "Contenido del tema")
        self.assertEqual(case["content"]["image_url"], TOPIC_IMAGE_URL)
        self.assertEqual(case["report_count"], 3)
        self.assertEqual(case["status"], "open")
        self.assertEqual(case["link"], f"/forum/{TOPIC_ID}")
        self.assertTrue(case["last_report_at"])
        self.assertEqual(
            {item["label"]: item["count"] for item in case["reasons"]},
            {"Contenido sexual": 2, "Otro": 1}
        )
        self.assertEqual(case["explanations"], ["Mira la imagen"])

        self.assertEqual(len(self.cases(status="open").json()["cases"]), 1)
        self.assertEqual(self.cases(status="removed").json()["cases"], [])
        self.assertEqual(self.cases(status="raro").status_code, 400)

    # 6, 21 y 23
    def test_only_admins_reach_the_moderation_actions(self):
        self.report(REPORTER_IDS[0])
        case_id = self.case()["id"]

        attempts = [
            lambda headers: self.client.get("/moderation/cases", headers=headers),
            lambda headers: self.client.post(
                "/moderation/remove",
                json={
                    "target_type": "forum_topic", "target_id": TOPIC_ID,
                    "reason": "spam"
                },
                headers=headers
            ),
            lambda headers: self.client.post(
                f"/moderation/cases/{case_id}/restore", json={}, headers=headers
            ),
            lambda headers: self.client.post(
                f"/moderation/cases/{case_id}/review", json={}, headers=headers
            )
        ]

        for attempt in attempts:
            self.assertIn(attempt({}).status_code, (401, 403))
            # Ni quien publicó ni quien reportó pueden moderar.
            for user_id in (OWNER_ID, REPORTER_IDS[0], OUTSIDER_ID):
                self.assertEqual(attempt(auth_header(user_id)).status_code, 403)

        self.assertEqual(self.case()["status"], "open")
        self.assertEqual(self.database.tables["moderation_actions"], [])
        self.assertEqual(self.topic().status_code, 200)

    # 7 y 8
    def test_admin_can_remove_with_a_reason(self):
        self.assertEqual(self.remove(reason="porque sí").status_code, 400)

        response = self.remove(reason="graphic_violence", note="Imagen explícita")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["case"]["removal"]["reason_label"], "Violencia gráfica"
        )

        case = self.case()
        self.assertEqual(case["status"], "removed")
        self.assertEqual(case["removal_reason"], "graphic_violence")
        self.assertFalse(case["removal_automatic"])
        self.assertEqual(case["removed_by"], ADMIN_ID)

        action = self.database.tables["moderation_actions"][0]
        self.assertEqual(
            (action["action"], action["actor_id"], action["reason"], action["note"]),
            ("removed", ADMIN_ID, "graphic_violence", "Imagen explícita")
        )

        # No se puede retirar dos veces.
        self.assertEqual(self.remove().status_code, 400)

        # El administrador también puede usar "Alto número de reportes".
        manual = self.remove(target_type="forum_reply", target_id=OTHER_REPLY_ID,
                             reason="many_reports")
        self.assertEqual(manual.status_code, 200, manual.text)

    def test_admin_can_mark_reports_as_reviewed(self):
        for user_id in REPORTER_IDS[:4]:
            self.report(user_id)
        case_id = self.case()["id"]

        reviewed = self.client.post(
            f"/moderation/cases/{case_id}/review",
            json={"note": "No infringe las normas"},
            headers=auth_header(ADMIN_ID)
        )
        self.assertEqual(reviewed.status_code, 200, reviewed.text)
        self.assertEqual(self.case()["status"], "reviewed")

        # Un reporte nuevo reabre el caso, pero los ya revisados no suman.
        self.report(REPORTER_IDS[4])
        self.assertEqual(self.case()["status"], "open")
        self.assertEqual(self.case()["report_count"], 5)
        self.assertEqual(self.topic().status_code, 200)

    # ============================================================
    # VISIBILIDAD EN EL FORO
    # ============================================================

    # 9 y 18
    def test_removed_topic_is_hidden_from_the_public(self):
        self.remove(reason="sexual")

        self.assertNotIn(TOPIC_ID, self.topic_list_ids())
        self.assertEqual(self.topic().status_code, 404)
        self.assertEqual(self.topic(OUTSIDER_ID).status_code, 404)

        # La imagen ya no está en su dirección original.
        self.assertEqual(
            [path for path in self.database.storage.paths("forum-images")
             if path == TOPIC_IMAGE_PATH],
            []
        )
        self.assertEqual(len(self.database.storage.paths("forum-images")), 1)

        # Su autora la ve con el motivo general.
        owner_view = self.topic(OWNER_ID)
        self.assertEqual(owner_view.status_code, 200, owner_view.text)
        notice = owner_view.json()["moderation"]
        self.assertTrue(notice["removed"])
        self.assertEqual(
            notice["message"], "Tu tema del foro fue retirado por contenido sexual."
        )
        self.assertNotIn("case_id", notice)

        # La administradora ve además el caso para poder restaurarlo.
        admin_view = self.topic(ADMIN_ID).json()
        self.assertEqual(admin_view["moderation"]["case_id"], self.case()["id"])
        self.assertIn("/moderation/", admin_view["image_url"])

        # No se puede responder en un tema retirado.
        reply = self.client.post(
            f"/forum/topics/{TOPIC_ID}/replies",
            data={"content": "Sigo aquí"},
            headers=auth_header(OUTSIDER_ID)
        )
        self.assertEqual(reply.status_code, 404)

    def test_new_reply_comes_back_with_its_author_name(self):
        # Sin esto, la respuesta recién publicada se mostraba como "Usuario"
        # hasta recargar la página.
        self.database.new_row = lambda table_name, payload: {
            "id": str(uuid.uuid4()), "created_at": "2026-01-02T10:00:00+00:00", **payload
        }

        response = self.client.post(
            f"/forum/topics/{TOPIC_ID}/replies",
            data={"content": "Hola a todas"},
            headers=auth_header(OUTSIDER_ID)
        )

        self.assertEqual(response.status_code, 200, response.text)
        reply = response.json()["reply"]
        self.assertEqual(reply["username"], "visitante")
        self.assertEqual(reply["content"], "Hola a todas")
        self.assertIsNone(reply["avatar_url"])

    def test_forum_posts_include_the_author_avatar(self):
        self.assertEqual(self.upload("/me/avatar", OWNER_ID).status_code, 200)
        avatar_url = self.public_profile()["avatar_url"]

        self.assertEqual(self.topic().json()["avatar_url"], avatar_url)

        by_id = {reply["id"]: reply for reply in self.replies()}
        self.assertEqual(by_id[REPLY_ID]["avatar_url"], avatar_url)
        # Quien no tiene foto llega sin ella: el foro muestra su inicial.
        self.assertIsNone(by_id[OTHER_REPLY_ID]["avatar_url"])

        # Una foto retirada por moderación deja de verse también en el foro.
        self.remove(target_type="avatar", target_id=OWNER_ID)
        self.assertIsNone(self.topic().json()["avatar_url"])

    def test_removed_reply_keeps_its_place_without_content(self):
        self.remove(target_type="forum_reply", target_id=REPLY_ID, reason="harassment")

        public = self.replies()
        self.assertEqual(len(public), 2)
        hidden = next(item for item in public if item["id"] == REPLY_ID)
        self.assertEqual(hidden["content"], "")
        self.assertIsNone(hidden["image_url"])
        self.assertIsNone(hidden["user_id"])
        self.assertEqual(hidden["moderation"], {"removed": True})

        untouched = next(item for item in public if item["id"] == OTHER_REPLY_ID)
        self.assertEqual(untouched["content"], "Otra respuesta")
        self.assertNotIn("moderation", untouched)

        owner = next(item for item in self.replies(OWNER_ID) if item["id"] == REPLY_ID)
        self.assertEqual(owner["content"], "Respuesta de la autora")
        self.assertEqual(
            owner["moderation"]["message"],
            "Tu respuesta en el foro fue retirada por acoso."
        )

    # ============================================================
    # RESTAURAR
    # ============================================================

    # 14 y 15
    def test_admin_can_restore_and_history_is_kept(self):
        for user_id in REPORTER_IDS[:5]:
            self.report(user_id)
        case_id = self.case()["id"]
        self.assertEqual(self.topic().status_code, 404)

        response = self.restore(case_id, note="El retiro fue un error")
        self.assertEqual(response.status_code, 200, response.text)

        case = self.case()
        self.assertEqual(case["status"], "restored")
        self.assertEqual(case["restored_by"], ADMIN_ID)
        self.assertTrue(case["restored_at"])

        # Vuelve a verse, con su imagen en la dirección original.
        self.assertEqual(self.topic().status_code, 200)
        self.assertNotIn("moderation", self.topic().json())
        self.assertIn(TOPIC_ID, self.topic_list_ids())
        self.assertEqual(
            self.database.storage.paths("forum-images"), [TOPIC_IMAGE_PATH]
        )

        # El historial de reportes y acciones sigue completo.
        self.assertEqual(len(self.database.tables["content_reports"]), 5)
        self.assertEqual(case["report_count"], 5)
        self.assertEqual(
            [action["action"] for action in self.database.tables["moderation_actions"]],
            ["auto_removed", "restored"]
        )
        restored = self.database.tables["moderation_actions"][1]
        self.assertEqual(restored["actor_id"], ADMIN_ID)
        self.assertEqual(restored["note"], "El retiro fue un error")

        history = self.cases().json()["cases"][0]["history"]
        self.assertEqual(history[1]["actor"], "moderadora")
        self.assertEqual(history[1]["note"], "El retiro fue un error")

        # No se restaura dos veces.
        self.assertEqual(self.restore(case_id).status_code, 400)

    def test_old_reports_do_not_remove_restored_content_again(self):
        for user_id in REPORTER_IDS[:5]:
            self.report(user_id)
        self.restore(self.case()["id"])

        # Quienes ya reportaron no pueden repetir el reporte.
        self.assertEqual(self.report(REPORTER_IDS[0]).status_code, 409)

        # Un reporte nuevo reabre el caso, pero hacen falta cinco nuevos.
        for user_id in REPORTER_IDS[5:9]:
            self.assertEqual(self.report(user_id).status_code, 200)
        self.assertEqual(self.case()["status"], "open")
        self.assertEqual(self.topic().status_code, 200)

        self.report(REPORTER_IDS[9])
        self.assertEqual(self.case()["status"], "removed")
        self.assertEqual(len(self.database.tables["content_reports"]), 10)

    # ============================================================
    # IMÁGENES
    # ============================================================

    # 20
    def test_uploads_still_check_the_real_file_content(self):
        fake = self.upload("/me/avatar", OWNER_ID, data=b"<html>no soy una imagen</html>")
        self.assertEqual(fake.status_code, 400)

        wrong_type = self.upload(
            "/me/avatar", OWNER_ID, data=PNG_BYTES, content_type="image/gif"
        )
        self.assertEqual(wrong_type.status_code, 400)

        # Un JPEG declarado como PNG tampoco pasa.
        mismatch = self.upload("/me/banner", OWNER_ID, data=JPEG_BYTES)
        self.assertEqual(mismatch.status_code, 400)

        empty = self.upload("/upload-cover", OWNER_ID, data=b"")
        self.assertEqual(empty.status_code, 400)

        self.assertEqual(self.database.storage.paths("story-covers"), [])
        self.assertEqual(self.upload("/me/avatar", OWNER_ID).status_code, 200)

    # 19: avatar
    def test_avatar_can_be_reported_removed_and_restored(self):
        self.assertEqual(
            self.report(REPORTER_IDS[0], "avatar", OWNER_ID).status_code, 404
        )

        self.assertEqual(self.upload("/me/avatar", OWNER_ID).status_code, 200)
        avatar_path = f"avatars/{OWNER_ID}/avatar"
        self.assertTrue(self.public_profile()["avatar_url"])

        self.assertEqual(self.report(REPORTER_IDS[0], "avatar", OWNER_ID).status_code, 200)
        self.assertEqual(
            self.cases().json()["cases"][0]["target_label"], "Foto de perfil"
        )

        removed = self.remove(target_type="avatar", target_id=OWNER_ID, reason="sexual")
        self.assertEqual(removed.status_code, 200, removed.text)

        # Deja de mostrarse y el perfil sigue funcionando con su estado por defecto.
        profile = self.public_profile()
        self.assertIsNone(profile["avatar_url"])
        self.assertEqual(profile["username"], "autora")

        # El archivo se conserva fuera de su dirección pública original.
        paths = self.database.storage.paths("story-covers")
        self.assertNotIn(avatar_path, paths)
        self.assertEqual(len(paths), 1)
        self.assertTrue(paths[0].startswith("moderation/"))

        notices = self.client.get(
            "/me/moderation", headers=auth_header(OWNER_ID)
        ).json()["notices"]
        self.assertEqual(
            notices[0]["message"], "Tu foto de perfil fue retirada por contenido sexual."
        )

        self.assertEqual(self.restore(self.case("avatar", OWNER_ID)["id"]).status_code, 200)
        self.assertTrue(self.public_profile()["avatar_url"])
        self.assertEqual(self.database.storage.paths("story-covers"), [avatar_path])
        self.assertEqual(
            self.client.get(
                "/me/moderation", headers=auth_header(OWNER_ID)
            ).json()["notices"],
            []
        )

    def test_restoring_does_not_replace_a_newer_avatar(self):
        self.upload("/me/avatar", OWNER_ID)
        self.remove(target_type="avatar", target_id=OWNER_ID)

        # La persona sube otra foto mientras la anterior está retirada.
        self.upload("/me/avatar", OWNER_ID, data=PNG_BYTES + b"nueva")
        new_url = self.public_profile()["avatar_url"]

        self.assertEqual(self.restore(self.case("avatar", OWNER_ID)["id"]).status_code, 200)
        self.assertEqual(self.public_profile()["avatar_url"], new_url)
        self.assertEqual(
            self.database.storage.files[("story-covers", f"avatars/{OWNER_ID}/avatar")],
            PNG_BYTES + b"nueva"
        )
        # La imagen retirada sigue guardada para el historial.
        self.assertEqual(len(self.database.storage.paths("story-covers")), 2)

    # 19: banner de perfil
    def test_profile_banner_can_be_removed_and_restored(self):
        self.assertEqual(self.upload("/me/banner", OWNER_ID).status_code, 200)
        self.assertTrue(self.public_profile()["banner_url"])

        for user_id in REPORTER_IDS[:5]:
            self.assertEqual(
                self.report(user_id, "profile_banner", OWNER_ID).status_code, 200
            )

        self.assertIsNone(self.public_profile()["banner_url"])
        case = self.case("profile_banner", OWNER_ID)
        self.assertEqual(case["removal_reason"], "many_reports")

        self.assertEqual(self.restore(case["id"]).status_code, 200)
        self.assertTrue(self.public_profile()["banner_url"])

    # 19: portada
    def test_story_cover_can_be_removed_and_restored(self):
        uploaded = self.upload("/upload-cover", OWNER_ID)
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        cover_url = uploaded.json()["url"]
        self.database.tables["stories"][0]["cover_url"] = cover_url
        cover_path = self.database.storage.paths("story-covers")[0]

        self.assertEqual(self.report(REPORTER_IDS[0], "story_cover", STORY_ID).status_code, 200)
        removed = self.remove(
            target_type="story_cover", target_id=STORY_ID, reason="copyright"
        )
        self.assertEqual(removed.status_code, 200, removed.text)

        self.assertIsNone(self.database.tables["stories"][0]["cover_url"])
        self.assertNotIn(cover_path, self.database.storage.paths("story-covers"))
        self.assertEqual(self.database.tables["stories"][0]["title"], "Mi historia")

        notice = self.client.get(
            "/me/moderation", headers=auth_header(OWNER_ID)
        ).json()["notices"][0]
        self.assertEqual(
            notice["message"],
            "La portada de tu historia fue retirada por infracción de derechos de autor."
        )
        self.assertEqual(notice["title"], "Mi historia")

        self.restore(self.case("story_cover", STORY_ID)["id"])
        self.assertEqual(self.database.tables["stories"][0]["cover_url"], cover_url)
        self.assertEqual(self.database.storage.paths("story-covers"), [cover_path])

    # El banner del inicio lo sube la administración: no se reporta ni se retira.
    def test_home_banner_is_not_reportable(self):
        uploaded = self.upload("/site/home-banner", ADMIN_ID)
        self.assertEqual(uploaded.status_code, 200, uploaded.text)

        self.assertEqual(
            self.report(REPORTER_IDS[0], "home_banner", "home").status_code, 400
        )
        self.assertEqual(
            self.remove(target_type="home_banner", target_id="home").status_code, 400
        )
        self.assertEqual(self.database.tables["moderation_cases"], [])
        self.assertTrue(self.client.get("/site/home-banner").json()["banner_url"])

    # ============================================================
    # ELIMINAR PUBLICACIONES PROPIAS DEL FORO
    # ============================================================

    def delete(self, path, user_id):
        return self.client.delete(path, headers=auth_header(user_id))

    def test_owner_can_remove_only_the_image_of_their_post(self):
        path = f"/forum/topics/{TOPIC_ID}/image"

        self.assertIn(self.client.delete(path).status_code, (401, 403))
        self.assertEqual(self.delete(path, OUTSIDER_ID).status_code, 404)
        self.assertEqual(self.delete(path, ADMIN_ID).status_code, 404)
        self.assertEqual(
            self.database.storage.paths("forum-images"), [TOPIC_IMAGE_PATH]
        )

        removed = self.delete(path, OWNER_ID)
        self.assertEqual(removed.status_code, 200, removed.text)

        # El tema sigue publicado con su texto, ya sin imagen ni archivo.
        topic = self.topic().json()
        self.assertIsNone(topic["image_url"])
        self.assertEqual(topic["content"], "Contenido del tema")
        self.assertEqual(self.database.storage.paths("forum-images"), [])
        self.assertEqual(self.delete(path, OWNER_ID).status_code, 400)

    def test_image_only_reply_must_be_deleted_whole(self):
        reply = self.database.tables["forum_replies"][0]
        reply["content"] = ""
        reply["image_url"] = TOPIC_IMAGE_URL

        only_image = self.delete(f"/forum/replies/{REPLY_ID}/image", OWNER_ID)
        self.assertEqual(only_image.status_code, 400)
        self.assertEqual(reply["image_url"], TOPIC_IMAGE_URL)

        deleted = self.delete(f"/forum/replies/{REPLY_ID}", OWNER_ID)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(self.database.storage.paths("forum-images"), [])

    def test_owner_can_delete_their_reply_but_not_someone_elses(self):
        self.database.tables["forum_interactions"].extend([
            {"id": "i1", "reply_id": REPLY_ID, "topic_id": None, "user_id": OUTSIDER_ID},
            {"id": "i2", "reply_id": OTHER_REPLY_ID, "topic_id": None, "user_id": OWNER_ID}
        ])

        self.assertEqual(
            self.delete(f"/forum/replies/{OTHER_REPLY_ID}", OWNER_ID).status_code, 404
        )
        self.assertEqual(
            self.delete(f"/forum/replies/{REPLY_ID}", OUTSIDER_ID).status_code, 404
        )
        self.assertEqual(len(self.database.tables["forum_replies"]), 2)

        deleted = self.delete(f"/forum/replies/{REPLY_ID}", OWNER_ID)
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(
            [reply["id"] for reply in self.database.tables["forum_replies"]],
            [OTHER_REPLY_ID]
        )
        self.assertEqual(
            [item["id"] for item in self.database.tables["forum_interactions"]], ["i2"]
        )
        self.assertEqual(
            self.delete(f"/forum/replies/{REPLY_ID}", OWNER_ID).status_code, 404
        )

    def test_owner_can_delete_their_topic_with_its_replies(self):
        self.assertEqual(
            self.delete(f"/forum/topics/{TOPIC_ID}", OUTSIDER_ID).status_code, 404
        )
        self.assertEqual(len(self.database.tables["forum_topics"]), 1)

        deleted = self.delete(f"/forum/topics/{TOPIC_ID}", OWNER_ID)
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(self.database.tables["forum_topics"], [])
        self.assertEqual(self.database.tables["forum_replies"], [])
        self.assertEqual(self.database.storage.paths("forum-images"), [])
        self.assertEqual(self.topic().status_code, 404)

    def test_reported_or_removed_posts_cannot_be_deleted_by_their_owner(self):
        self.report(REPORTER_IDS[0])

        # Con un reporte pendiente, la evidencia se conserva.
        for path in (f"/forum/topics/{TOPIC_ID}", f"/forum/topics/{TOPIC_ID}/image"):
            self.assertEqual(self.delete(path, OWNER_ID).status_code, 409)

        self.remove(reason="sexual")
        self.assertEqual(
            self.delete(f"/forum/topics/{TOPIC_ID}", OWNER_ID).status_code, 409
        )
        self.assertEqual(len(self.database.tables["forum_topics"]), 1)

        # Una respuesta reportada también impide borrar el tema que la contiene.
        self.restore(self.case()["id"])
        self.client.post(
            f"/moderation/cases/{self.case()['id']}/review",
            json={}, headers=auth_header(ADMIN_ID)
        )
        self.report(REPORTER_IDS[1], "forum_reply", OTHER_REPLY_ID)
        self.assertEqual(
            self.delete(f"/forum/topics/{TOPIC_ID}", OWNER_ID).status_code, 409
        )

        # Ya revisado y sin reportes pendientes, se puede eliminar.
        self.client.post(
            f"/moderation/cases/{self.case('forum_reply', OTHER_REPLY_ID)['id']}/review",
            json={}, headers=auth_header(ADMIN_ID)
        )
        self.assertEqual(
            self.delete(f"/forum/topics/{TOPIC_ID}", OWNER_ID).status_code, 200
        )

    # ============================================================
    # PRIVACIDAD Y SEGURIDAD
    # ============================================================

    # 17
    def test_reports_never_reveal_who_reported(self):
        responses = [self.report(user_id) for user_id in REPORTER_IDS[:5]]
        for response in responses:
            self.assertEqual(set(response.json()), {"message"})

        owner_topic = self.topic(OWNER_ID)
        owner_notices = self.client.get("/me/moderation", headers=auth_header(OWNER_ID))
        admin_cases = self.cases()

        self.assertEqual(
            owner_notices.json()["notices"][0]["message"],
            "Tu tema del foro fue retirado por alto número de reportes."
        )

        for response in (owner_topic, owner_notices, admin_cases):
            self.assertEqual(response.status_code, 200, response.text)
            for user_id in REPORTER_IDS[:5]:
                self.assertNotIn(user_id, response.text)
            self.assertNotIn("privado.test", response.text)
            self.assertNotIn("reporter", response.text)

        # A la autora no se le muestra cuántos reportes hubo.
        self.assertNotIn("report_count", owner_topic.text)
        self.assertNotIn("report_count", owner_notices.text)

    # 21
    def test_notices_belong_only_to_the_owner(self):
        self.remove(reason="spam")

        for user_id in (OUTSIDER_ID, REPORTER_IDS[0]):
            notices = self.client.get("/me/moderation", headers=auth_header(user_id))
            self.assertEqual(notices.json()["notices"], [])

        self.assertIn(
            self.client.get("/me/moderation").status_code, (401, 403)
        )
        self.assertEqual(self.restore(str(uuid.uuid4())).status_code, 404)
        self.assertEqual(self.restore("no-es-un-id").status_code, 404)

    # 22
    def test_html_in_reports_and_notes_stays_plain_text(self):
        self.database.tables["forum_topics"][0]["content"] = XSS_TEXT

        reported = self.report(REPORTER_IDS[0], reason="other", details=XSS_TEXT)
        self.assertEqual(reported.status_code, 200, reported.text)
        self.remove(reason="other", note=XSS_TEXT)

        response = self.cases()
        self.assertTrue(response.headers["content-type"].startswith("application/json"))
        case = response.json()["cases"][0]
        self.assertEqual(case["explanations"], [XSS_TEXT])
        self.assertEqual(case["content"]["text"], XSS_TEXT)
        self.assertEqual(case["history"][0]["note"], XSS_TEXT)


if __name__ == "__main__":
    unittest.main()
