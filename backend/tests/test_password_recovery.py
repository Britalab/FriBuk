# Pruebas de la recuperación de contraseña.
#
# No llaman a Supabase ni envían correos: reemplazan esas llamadas.
# Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import base64
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

USER_ID = "11111111-1111-1111-1111-111111111111"


def token(methods):
    # Token con el formato de uno real: solo importa cómo se obtuvo la sesión.
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": USER_ID, "amr": [{"method": m} for m in methods]}).encode()
    ).decode().rstrip("=")
    return f"cabecera.{payload}.firma"


RECOVERY_TOKEN = token(["recovery"])
PASSWORD_TOKEN = token(["password"])


class PasswordRecoveryTestCase(unittest.TestCase):
    def setUp(self):
        self.originals = (
            main.request_password_recovery, main.supabase_public,
            main.supabase_admin, list(main.CORS_ALLOWED_ORIGINS)
        )
        self.original_redeem = main.redeem_recovery_token_hash
        # Códigos del enlace del correo: cada uno sirve una sola vez.
        self.token_hashes = {"codigo-valido"}
        self.redeem_calls = []

        def redeem(token_hash):
            self.redeem_calls.append(token_hash)
            if token_hash in self.token_hashes:
                self.token_hashes.discard(token_hash)
                return USER_ID
            return None

        main.redeem_recovery_token_hash = redeem
        self.recovery_calls = []
        self.password_updates = []
        self.valid_tokens = {RECOVERY_TOKEN, PASSWORD_TOKEN}

        main.request_password_recovery = (
            lambda email, redirect_to: self.recovery_calls.append((email, redirect_to))
        )
        main.CORS_ALLOWED_ORIGINS[:] = [
            "http://localhost:3000", "http://localhost:5173",
            "https://www.fribuk.com", "https://fribuk.com"
        ]

        def get_user(access_token):
            if access_token not in self.valid_tokens:
                raise RuntimeError("token inválido")
            return SimpleNamespace(user=SimpleNamespace(id=USER_ID))

        main.supabase_public = SimpleNamespace(auth=SimpleNamespace(get_user=get_user))
        main.supabase_admin = SimpleNamespace(
            auth=SimpleNamespace(
                admin=SimpleNamespace(
                    update_user_by_id=lambda user_id, attributes: (
                        self.password_updates.append((user_id, attributes))
                    )
                )
            )
        )
        main.password_recovery_requests.clear()

        self.client = TestClient(main.app)

    def tearDown(self):
        (
            main.request_password_recovery, main.supabase_public,
            main.supabase_admin, origins
        ) = self.originals
        main.CORS_ALLOWED_ORIGINS[:] = origins
        main.redeem_recovery_token_hash = self.original_redeem

    def recover(self, email="ana@example.com", origin="https://www.fribuk.com"):
        headers = {"Origin": origin} if origin else {}
        return self.client.post(
            "/auth/password-recovery", json={"email": email}, headers=headers
        )

    def update(self, access_token=RECOVERY_TOKEN, password="clave-nueva-123"):
        return self.client.post(
            "/auth/password-update",
            json={"access_token": access_token, "password": password}
        )

    # ---------- pedir el enlace ----------

    def test_recovery_sends_the_link_back_to_the_site(self):
        response = self.recover("  Ana@Example.com ".strip())

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"message": main.PASSWORD_RECOVERY_MESSAGE})
        self.assertEqual(
            self.recovery_calls,
            [("ana@example.com", "https://www.fribuk.com/restablecer")]
        )

    def test_recovery_never_redirects_to_an_unknown_site(self):
        self.recover(origin="https://sitio-malicioso.example")
        self.recover(email="otra@example.com", origin=None)
        self.recover(email="local@example.com", origin="http://localhost:5173")

        self.assertEqual(
            [redirect for _email, redirect in self.recovery_calls],
            [
                "https://www.fribuk.com/restablecer",
                "https://www.fribuk.com/restablecer",
                "http://localhost:5173/restablecer"
            ]
        )

    def test_recovery_answers_the_same_whether_or_not_it_worked(self):
        ok = self.recover()

        def failing(_email, _redirect_to):
            raise RuntimeError("Supabase no responde")

        main.request_password_recovery = failing
        failed = self.recover(email="nadie@example.com")

        # No se revela si la cuenta existe ni si el envío falló.
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.json(), ok.json())
        self.assertNotIn("Supabase", failed.text)

    def test_recovery_rejects_invalid_emails(self):
        self.assertEqual(self.recover(email="no-es-un-correo").status_code, 422)
        self.assertEqual(self.recovery_calls, [])

    def test_recovery_is_rate_limited_per_email(self):
        limit = main.PASSWORD_RECOVERY_RATE_LIMITS["email"][0]

        for _ in range(limit):
            self.assertEqual(self.recover().status_code, 200)

        self.assertEqual(self.recover().status_code, 429)
        self.assertEqual(len(self.recovery_calls), limit)

    def test_recovery_is_rate_limited_per_visitor(self):
        limit = main.PASSWORD_RECOVERY_RATE_LIMITS["ip"][0]

        for index in range(limit):
            self.assertEqual(
                self.recover(email=f"persona{index}@example.com").status_code, 200
            )

        self.assertEqual(self.recover(email="una-mas@example.com").status_code, 429)

    # ---------- elegir la contraseña nueva con el código del enlace ----------

    def update_with_code(self, token_hash="codigo-valido", password="clave-nueva-123"):
        return self.client.post(
            "/auth/password-update",
            json={"token_hash": token_hash, "password": password}
        )

    def test_link_code_sets_a_new_password_once(self):
        response = self.update_with_code()

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            self.password_updates, [(USER_ID, {"password": "clave-nueva-123"})]
        )
        self.assertEqual(set(response.json()), {"message"})

        # El mismo código no sirve dos veces.
        again = self.update_with_code(password="otra-clave-456")
        self.assertEqual(again.status_code, 401)
        self.assertEqual(len(self.password_updates), 1)

    def test_invalid_link_code_is_rejected(self):
        self.assertEqual(self.update_with_code(token_hash="inventado").status_code, 401)
        self.assertEqual(self.update_with_code(token_hash="   ").status_code, 401)
        self.assertEqual(
            self.client.post(
                "/auth/password-update", json={"password": "clave-nueva-123"}
            ).status_code,
            401
        )
        self.assertEqual(self.password_updates, [])

    def test_weak_password_does_not_spend_the_link_code(self):
        short = self.update_with_code(password="corta")

        self.assertEqual(short.status_code, 400)
        # El código sigue disponible para un segundo intento.
        self.assertEqual(self.redeem_calls, [])
        self.assertEqual(self.update_with_code().status_code, 200)

    def test_supabase_failure_while_checking_the_code_is_not_an_expired_link(self):
        def failing(_token_hash):
            raise RuntimeError("Supabase no responde")

        main.redeem_recovery_token_hash = failing

        response = self.update_with_code()

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("Supabase", response.text)
        self.assertEqual(self.password_updates, [])

    # ---------- enlaces del formato anterior ----------

    def test_recovery_token_can_set_a_new_password(self):
        response = self.update()

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            self.password_updates, [(USER_ID, {"password": "clave-nueva-123"})]
        )
        # La respuesta no devuelve tokens ni la contraseña.
        self.assertEqual(set(response.json()), {"message"})

    def test_a_normal_session_cannot_change_the_password(self):
        # Quien solo tiene una sesión abierta no puede cambiar la contraseña
        # sin pasar por el correo.
        response = self.update(access_token=PASSWORD_TOKEN)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.password_updates, [])

    def test_invalid_or_expired_link_is_rejected(self):
        for access_token in ("", "   ", "token-inventado", token(["recovery"]) + "x"):
            response = self.update(access_token=access_token)
            self.assertEqual(response.status_code, 401, access_token)

        self.assertEqual(self.password_updates, [])

    def test_new_password_must_have_a_reasonable_length(self):
        short = self.update(password="a" * (main.PASSWORD_MIN_LENGTH - 1))
        long = self.update(password="a" * (main.PASSWORD_MAX_LENGTH + 1))

        self.assertEqual(short.status_code, 400)
        self.assertEqual(long.status_code, 400)
        self.assertEqual(self.password_updates, [])

        exact = self.update(password="a" * main.PASSWORD_MIN_LENGTH)
        self.assertEqual(exact.status_code, 200, exact.text)

    def test_supabase_rejection_does_not_leak_details(self):
        def failing(_user_id, _attributes):
            raise RuntimeError("weak_password: detalle interno")

        main.supabase_admin.auth.admin.update_user_by_id = failing

        response = self.update()

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("detalle interno", response.text)


if __name__ == "__main__":
    unittest.main()
