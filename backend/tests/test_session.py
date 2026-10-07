# Pruebas de la renovación de la sesión.
#
# No llaman a Supabase: reemplazan el intercambio del token de renovación.
# Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


class SessionRefreshTestCase(unittest.TestCase):
    def setUp(self):
        self.original_exchange = main.exchange_refresh_token
        self.original_public = main.supabase_public
        self.original_is_admin = main.is_admin_user
        self.received = []
        self.client = TestClient(main.app)

    def tearDown(self):
        main.exchange_refresh_token = self.original_exchange
        main.supabase_public = self.original_public
        main.is_admin_user = self.original_is_admin

    def use_exchange(self, result):
        def exchange(refresh_token):
            self.received.append(refresh_token)
            if isinstance(result, Exception):
                raise result
            return result

        main.exchange_refresh_token = exchange

    def refresh(self, refresh_token):
        return self.client.post(
            "/auth/refresh", json={"refresh_token": refresh_token}
        )

    def test_valid_refresh_token_returns_a_new_session(self):
        self.use_exchange({"access_token": "nuevo-acceso", "refresh_token": "nueva-renovacion"})

        response = self.refresh("  renovacion-actual  ")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json(),
            {
                "access_token": "nuevo-acceso",
                "refresh_token": "nueva-renovacion",
                "token_type": "bearer"
            }
        )
        self.assertEqual(self.received, ["renovacion-actual"])

    def test_invalid_or_used_refresh_token_ends_the_session(self):
        self.use_exchange(None)

        response = self.refresh("renovacion-vencida")

        self.assertEqual(response.status_code, 401)
        self.assertNotIn("access_token", response.text)

    def test_empty_or_oversized_token_is_rejected_without_calling_supabase(self):
        self.use_exchange({"access_token": "a", "refresh_token": "b"})

        self.assertEqual(self.refresh("").status_code, 401)
        self.assertEqual(self.refresh("   ").status_code, 401)
        self.assertEqual(
            self.refresh("x" * (main.SESSION_REFRESH_TOKEN_MAX_LENGTH + 1)).status_code,
            401
        )
        self.assertEqual(self.client.post("/auth/refresh", json={}).status_code, 422)
        self.assertEqual(self.received, [])

    def test_supabase_failure_does_not_look_like_an_expired_session(self):
        # Un fallo de red no debe cerrar la sesión de la persona.
        self.use_exchange(RuntimeError("sin conexión"))

        response = self.refresh("renovacion-actual")

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("sin conexión", response.text)

    def test_login_returns_the_refresh_token(self):
        user = SimpleNamespace(
            id="usuario-1", email="ana@example.com",
            user_metadata={"username": "ana"}, app_metadata={},
            created_at=None
        )
        session = SimpleNamespace(access_token="acceso", refresh_token="renovacion")
        main.supabase_public = SimpleNamespace(
            auth=SimpleNamespace(
                sign_in_with_password=lambda _credentials: SimpleNamespace(
                    user=user, session=session
                )
            )
        )
        main.is_admin_user = lambda _user_id: False

        response = self.client.post(
            "/login", json={"email": "ana@example.com", "password": "secreta"}
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["access_token"], "acceso")
        self.assertEqual(body["refresh_token"], "renovacion")
        self.assertEqual(body["user"]["username"], "ana")


if __name__ == "__main__":
    unittest.main()
