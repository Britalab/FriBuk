
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.detail || "Correo o contraseña incorrectos"
      );
    }
  };

  return (
    <main className="auth-page login-page">
      <div className="auth-container">

        <div className="auth-card">

          <div className="auth-header">
            <div className="auth-logo">
                <img
                  src="/logo-fribuk.jpg"
                  alt="FriBuk"
                />
            </div>

            <p className="auth-eyebrow">
              BIENVENIDO A FRIBUK
            </p>

            <h1>Iniciar sesión</h1>

            <p>
              Continúa leyendo y escribiendo tus historias.
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >
            <div className="auth-form-group">
              <label htmlFor="email">
                Correo electrónico
              </label>

              <input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
              />
            </div>

            <div className="auth-form-group">
              <label htmlFor="password">
                Contraseña
              </label>

              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
              />
            </div>

            {error && (
              <div className="auth-error">
                <span>!</span>
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
            >
              Entrar
            </button>
          </form>

          <div className="auth-footer">
            <p>
              ¿Todavía no tienes una cuenta?
            </p>

            <Link to="/register">
              Crear una cuenta
            </Link>
          </div>

        </div>

      </div>
    </main>
  );
}

