import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);

  const { register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!acceptedTerms) {
      setError(
        "Debes aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta."
      );
      return;
    }

    try {
      await register(username, email, password, acceptedTerms);
      setRegistered(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Error al registrarse");
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-container">
        <section className="auth-card">
          <header className="auth-header">
            <div className="auth-logo">
              <img src="/logo-fribuk.jpg" alt="FriBuk" />
            </div>

            <p className="auth-eyebrow">ÚNETE A FRIBUK</p>

            <h1>Crea tu cuenta</h1>

            <p>
              Empieza a leer, escribir y descubrir nuevas historias.
            </p>
          </header>

          {registered ? (
            <div className="auth-notice" role="status">
              <p>
                <strong>¡Tu cuenta fue creada!</strong>
              </p>
              <p>
                Te enviamos un correo a <strong>{email}</strong>. Debes
                confirmar tu correo electrónico antes de iniciar sesión.
              </p>
              <p>Si no lo ves, revisa tu carpeta de spam.</p>
            </div>
          ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-group">
              <label htmlFor="username">Usuario</label>

              <input
                id="username"
                type="text"
                placeholder="Elige tu nombre de usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="auth-form-group">
              <label htmlFor="email">Correo electrónico</label>

              <input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-form-group">
              <label htmlFor="password">Contraseña</label>

              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="Crea una contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <label className="auth-terms" htmlFor="accepted-terms">
              <input
                id="accepted-terms"
                type="checkbox"
                className="auth-terms-checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />

              <span className="auth-terms-text">
                He leído y acepto los{" "}
                <Link to="/terminos" target="_blank" rel="noopener noreferrer">
                  Términos y Condiciones
                </Link>{" "}
                y la{" "}
                <Link to="/privacidad" target="_blank" rel="noopener noreferrer">
                  Política de Privacidad
                </Link>
                .
              </span>
            </label>

            {error && (
              <div className="auth-error">
                <span>!</span>
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={!acceptedTerms}
            >
              Crear mi cuenta
            </button>
          </form>
          )}

          <footer className="auth-footer">
            <p>¿Ya tienes una cuenta?</p>

            <Link to="/login">
              Inicia sesión
            </Link>
          </footer>
        </section>
      </div>
    </main>
  );
}