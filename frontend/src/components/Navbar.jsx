import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("fribuk-theme") === "dark";
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("fribuk-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("fribuk-theme", "light");
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((current) => !current);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">

        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <img
            src="/logo-fribuk.jpg"
            alt="FriBuk"
            className="navbar-logo-image"
          />

          <span className="navbar-logo-text">
            FriBuk
          </span>
        </Link>

        {/* Navegación principal */}
        <div className="navbar-links">

          <Link to="/autores" className="navbar-authors">
            Buscar autores
          </Link>

          {user && (
            <Link
              to="/create-story"
              className="navbar-create-story"
            >
              Crear historia ✏️
            </Link>
          )}

        </div>

        {/* Usuario */}
        <div className="navbar-user">

          {/* Botón modo oscuro */}
          <button
            onClick={toggleDarkMode}
            className="theme-toggle"
            aria-label={
              darkMode
                ? "Cambiar a modo claro"
                : "Cambiar a modo oscuro"
            }
            title={
              darkMode
                ? "Modo claro"
                : "Modo oscuro"
            }
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          {user ? (
            <>
              <Link
                to="/perfil"
                className="navbar-profile"
                aria-label="Ir a mi perfil"
                title="Mi perfil"
              >
                <span aria-hidden="true">👤</span>
                <span className="navbar-profile-label">Mi perfil</span>
              </Link>

              <span className="navbar-greeting">
                Bienvenido, {user.username || user.email}
              </span>

              <button
                onClick={logout}
                className="navbar-button"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="navbar-login"
              >
                Iniciar sesión
              </Link>

              <Link
                to="/register"
                className="navbar-register"
              >
                Registrarse
              </Link>
            </>
          )}

        </div>
      </div>
    </nav>
  );
}
