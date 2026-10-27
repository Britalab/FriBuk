import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import { useMessagesSummary } from "../hooks/useMessagesSummary";
import { useNotifications } from "../hooks/useNotifications";
import {
  closeShownNotifications,
  isMessageTag,
  isNotificationTag,
  updateAppBadge,
} from "../utils/appBadge";
import { formatUnreadCount, rememberMessagesReturnPath } from "../utils/messages";

export default function Navbar() {
  const { user, logout } = useAuth();
  const unreadMessages = useMessagesSummary();
  const { unreadCount } = useNotifications();
  const location = useLocation();

  // Número sobre el ícono de la app instalada (donde el sistema lo admite):
  // notificaciones más mensajes sin leer. Sin sesión o sin pendientes, se quita.
  useEffect(() => {
    updateAppBadge(unreadCount + unreadMessages);
  }, [unreadCount, unreadMessages]);

  // Al quedar sin pendientes, se quitan los avisos del teléfono que sigan a la
  // vista (por ejemplo, de mensajes ya leídos). En Android el número del ícono
  // los cuenta. Solo al bajar a 0: mientras carga, los contadores parten en 0.
  const previousCounts = useRef({ unreadCount, unreadMessages });
  useEffect(() => {
    const previous = previousCounts.current;
    previousCounts.current = { unreadCount, unreadMessages };
    if (previous.unreadCount > 0 && unreadCount === 0) {
      closeShownNotifications(isNotificationTag);
    }
    if (previous.unreadMessages > 0 && unreadMessages === 0) {
      closeShownNotifications(isMessageTag);
    }
  }, [unreadCount, unreadMessages]);

  // Para que "cerrar" en Mensajes vuelva a donde estaba la persona.
  useEffect(() => {
    rememberMessagesReturnPath(location.pathname + location.search);
  }, [location]);

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

            <Link to="/forum" className="navbar-forum">
              Foro 💬
            </Link>

            <Link to="/consejos" className="navbar-tips">
              Consejos 📏
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

          {/* En el celular, "Consejos" pasa a un círculo junto al tema. */}
          <Link
            to="/consejos"
            className="theme-toggle navbar-tips-circle"
            aria-label="Consejos para escribir"
            title="Consejos para escribir"
          >
            📏
          </Link>

          {user ? (
            <>
              <Link
                to="/mensajes"
                className="navbar-messages"
                aria-label={
                  unreadMessages > 0
                    ? `Mensajes, ${unreadMessages} sin leer`
                    : "Mensajes"
                }
                title="Mensajes"
              >
                <span aria-hidden="true">✉</span>
                {unreadMessages > 0 && (
                  <span className="navbar-messages-badge" aria-hidden="true">
                    {formatUnreadCount(unreadMessages)}
                  </span>
                )}
              </Link>

              <NotificationBell />

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
