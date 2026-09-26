import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await register(username, email, password);
      navigate("/login");
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

              <input
                id="password"
                type="password"
                placeholder="Crea una contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="auth-error">
                <span>!</span>
                <p>{error}</p>
              </div>
            )}

            <button type="submit" className="auth-submit">
              Crear mi cuenta
            </button>
          </form>

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