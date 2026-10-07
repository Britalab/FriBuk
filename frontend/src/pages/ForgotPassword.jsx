import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

// Primer paso para recuperar la cuenta: pedir por correo el enlace para
// elegir una contraseña nueva. La respuesta es la misma exista o no la
// cuenta, para no revelar qué correos están registrados.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError("");

    try {
      const response = await api.post("/auth/password-recovery", {
        email: email.trim(),
      });
      setMessage(response.data.message);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Revisa que el correo esté bien escrito e inténtalo nuevamente."
      );
    } finally {
      setSending(false);
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

            <h1>¿Olvidaste tu contraseña?</h1>

            <p>
              Escribe el correo de tu cuenta y te enviaremos un enlace para
              elegir una contraseña nueva.
            </p>
          </div>

          {message ? (
            <p className="auth-success" role="status">{message}</p>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form-group">
                <label htmlFor="recovery-email">Correo electrónico</label>

                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
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

              <button type="submit" className="auth-submit" disabled={sending}>
                {sending ? "Enviando..." : "Enviar enlace"}
              </button>
            </form>
          )}

          <div className="auth-footer">
            <p>¿Ya la recordaste?</p>

            <Link to="/login">Volver a iniciar sesión</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
