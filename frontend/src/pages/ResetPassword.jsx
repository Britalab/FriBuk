import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import PasswordInput from "../components/PasswordInput";

const PASSWORD_MIN_LENGTH = 8;

// Lee lo que trae el enlace del correo.
//
// El enlace actual lleva un código de un solo uso (?token_hash=...) que no
// se gasta al abrir la página, sino al enviar el formulario. Así no llega
// vencido cuando un filtro de correo visita el enlace antes que la persona.
//
// Los enlaces del formato anterior traían la sesión después del "#".
function readRecoveryLink() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const tokenHash =
    query.get("type") === "recovery" ? query.get("token_hash") || "" : "";
  const accessToken =
    hash.get("type") === "recovery" ? hash.get("access_token") || "" : "";
  const failed = Boolean(hash.get("error") || hash.get("error_code"));

  return {
    tokenHash,
    accessToken: tokenHash ? "" : accessToken,
    usable: Boolean(tokenHash || (accessToken && !failed)),
  };
}

// Segundo paso para recuperar la cuenta: elegir la contraseña nueva. Solo
// funciona entrando desde el enlace que se envió por correo.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [link] = useState(readRecoveryLink);
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  // Una sesión que venga después del "#" no se deja en la barra de
  // direcciones ni en el historial del navegador.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        null, "", window.location.pathname + window.location.search
      );
    }
  }, []);

  const linkIsValid = link.usable && !expired;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== repeated) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await api.post("/auth/password-update", {
        ...(link.tokenHash
          ? { token_hash: link.tokenHash }
          : { access_token: link.accessToken }),
        password,
      });
      // Se entra de nuevo con la contraseña recién elegida.
      logout();
      showToast(response.data.message || "Tu contraseña se cambió.");
      navigate("/login", { replace: true });
    } catch (requestError) {
      const status = requestError.response?.status;
      const detail = requestError.response?.data?.detail;

      if (status === 401 || status === 403) {
        setExpired(true);
      } else {
        setError(
          typeof detail === "string"
            ? detail
            : "No se pudo cambiar la contraseña. Inténtalo nuevamente."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="auth-page login-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <img src="/logo-fribuk.jpg" alt="FriBuk" />
            </div>

            <p className="auth-eyebrow">RECUPERAR CUENTA</p>

            <h1>Elige una contraseña nueva</h1>

            {linkIsValid && (
              <p>Escríbela dos veces para evitar errores al teclear.</p>
            )}
          </div>

          {linkIsValid ? (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form-group">
                <label htmlFor="new-password">Contraseña nueva</label>

                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  placeholder={`Al menos ${PASSWORD_MIN_LENGTH} caracteres`}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  required
                />
              </div>

              <div className="auth-form-group">
                <label htmlFor="repeat-password">Repite la contraseña</label>

                <PasswordInput
                  id="repeat-password"
                  autoComplete="new-password"
                  placeholder="Escríbela otra vez"
                  value={repeated}
                  onChange={(event) => {
                    setRepeated(event.target.value);
                    setError("");
                  }}
                  required
                />
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  <span>!</span>
                  <p>{error}</p>
                </div>
              )}

              <button type="submit" className="auth-submit" disabled={saving}>
                {saving ? "Guardando..." : "Cambiar contraseña"}
              </button>
            </form>
          ) : (
            <div className="auth-error" role="alert">
              <span>!</span>
              <p>
                Este enlace ya no es válido: puede haber vencido o haberse
                usado. Pide uno nuevo para cambiar tu contraseña.
              </p>
            </div>
          )}

          <div className="auth-footer">
            {linkIsValid ? (
              <Link to="/login">Volver a iniciar sesión</Link>
            ) : (
              <Link to="/recuperar">Pedir un enlace nuevo</Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
