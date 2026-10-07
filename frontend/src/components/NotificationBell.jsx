import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NotificationItem from "./NotificationItem";
import { useNotificationFeed } from "../hooks/useNotificationFeed";
import { useNotifications } from "../hooks/useNotifications";
import { formatUnreadCount } from "../utils/notificationText";
import "../styles/notifications.css";

const PANEL_LIMIT = 8;
const MOBILE_QUERY = "(max-width: 760px)";

// Campana del Navbar con el número de notificaciones sin leer.
// En escritorio abre un panel con las más recientes; en móvil lleva a la
// centro de actividad, donde hay espacio para leerlas.
export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  const feed = useNotificationFeed({ limit: PANEL_LIMIT });
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }

    if (window.matchMedia(MOBILE_QUERY).matches) {
      navigate("/actividad");
      return;
    }

    setOpen(true);
    feed.load();
  };

  const handleOpenNotification = (notification) => {
    feed.markRead(notification);
    setOpen(false);
  };

  const label =
    unreadCount > 0
      ? `Notificaciones: ${unreadCount} sin leer`
      : "Notificaciones";

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-button"
        onClick={handleToggle}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificaciones"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-bell-badge" aria-hidden="true">
            {formatUnreadCount(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notificaciones">
          <div className="notification-panel-header">
            <h2>Notificaciones</h2>
            {feed.hasUnread && (
              <button type="button" onClick={feed.markAllRead}>
                Marcar todas como leídas
              </button>
            )}
          </div>

          {feed.actionError && (
            <p className="notification-error" role="alert">{feed.actionError}</p>
          )}

          {feed.status === "error" ? (
            <div className="notification-state" role="alert">
              <p>{feed.error}</p>
              <button type="button" onClick={feed.load}>Reintentar</button>
            </div>
          ) : feed.status !== "ready" ? (
            <p className="notification-state">Cargando notificaciones...</p>
          ) : feed.items.length === 0 ? (
            <div className="notification-state">
              <span aria-hidden="true">🔔</span>
              <p>Todavía no tienes notificaciones.</p>
            </div>
          ) : (
            <ul className="notification-list">
              {feed.items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onOpen={handleOpenNotification}
                />
              ))}
            </ul>
          )}

          <Link
            to="/actividad"
            className="notification-panel-footer"
            onClick={() => setOpen(false)}
          >
            Ver toda la actividad
          </Link>
        </div>
      )}
    </div>
  );
}
