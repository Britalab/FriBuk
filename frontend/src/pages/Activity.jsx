import { useEffect } from "react";
import NotificationItem from "../components/NotificationItem";
import { useNotificationFeed } from "../hooks/useNotificationFeed";
import { useNotifications } from "../hooks/useNotifications";
import "../styles/notifications.css";

const DAY_MS = 86400000;

// Agrupa por antigüedad. Las notificaciones ya llegan ordenadas de más
// reciente a más antigua, así que los grupos conservan ese orden.
function groupByDate(items) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();

  const groups = [
    { id: "today", title: "Hoy", items: [] },
    { id: "yesterday", title: "Ayer", items: [] },
    { id: "week", title: "Esta semana", items: [] },
    { id: "older", title: "Anteriores", items: [] },
  ];

  for (const item of items) {
    const time = Date.parse(item.updated_at || item.created_at || "");
    const group = Number.isNaN(time) || time < today - 6 * DAY_MS
      ? groups[3]
      : time >= today
        ? groups[0]
        : time >= today - DAY_MS
          ? groups[1]
          : groups[2];
    group.items.push(item);
  }

  return groups.filter((group) => group.items.length > 0);
}

// Centro de actividad: la vista completa de las notificaciones del usuario.
// No tiene datos propios; usa el mismo sistema y los mismos endpoints que la
// campana del Navbar.
export default function Activity() {
  const feed = useNotificationFeed({ limit: 20 });
  const { unreadCount } = useNotifications();
  const { load } = feed;

  useEffect(() => {
    load();
  }, [load]);

  const handleClearRead = () => {
    const confirmed = window.confirm(
      "¿Eliminar todas las notificaciones que ya leíste? Las que siguen sin leer se conservan."
    );
    if (confirmed) feed.clearRead();
  };

  const isReady = feed.status === "ready";

  return (
    <main className="notifications-page">
      <div className="notifications-container">
        <header className="notifications-header">
          <div>
            <p className="notifications-eyebrow">TU ACTIVIDAD EN FRIBUK</p>
            <h1>Centro de actividad</h1>
            <p>
              Seguidores, comentarios, recomendaciones, respuestas del foro y
              novedades de tus historias favoritas.
            </p>
          </div>
        </header>

        {isReady && feed.items.length > 0 && (
          <div className="activity-toolbar">
            <p className="activity-summary" aria-live="polite">
              {unreadCount > 0
                ? `${unreadCount} sin leer`
                : "Estás al día"}
            </p>
            <div className="activity-toolbar-actions">
              <button
                type="button"
                className="notifications-button"
                onClick={feed.markAllRead}
                disabled={!feed.hasUnread && unreadCount === 0}
              >
                Marcar todas como leídas
              </button>
              <button
                type="button"
                className="notifications-button"
                onClick={handleClearRead}
                disabled={!feed.hasRead}
              >
                Limpiar leídas
              </button>
            </div>
          </div>
        )}

        {feed.actionError && (
          <p className="notification-error" role="alert">{feed.actionError}</p>
        )}

        {feed.status === "error" ? (
          <div className="notifications-state" role="alert">
            <p>{feed.error}</p>
            <button type="button" className="notifications-button is-primary" onClick={load}>
              Reintentar
            </button>
          </div>
        ) : !isReady ? (
          <p className="notifications-state">Cargando tu actividad...</p>
        ) : feed.items.length === 0 ? (
          <div className="notifications-state">
            <span aria-hidden="true">🔔</span>
            <h2>Todavía no hay actividad</h2>
            <p>
              Aquí verás cuando alguien te siga, comente o recomiende tus historias,
              responda tus temas del foro, o cuando una historia de tus favoritos
              publique un capítulo.
            </p>
          </div>
        ) : (
          <>
            {groupByDate(feed.items).map((group) => (
              <section className="activity-group" key={group.id} aria-label={group.title}>
                <h2 className="activity-group-title">{group.title}</h2>
                <ul className="notification-list notifications-list">
                  {group.items.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onOpen={feed.markRead}
                      onMarkRead={feed.markRead}
                      onRemove={feed.remove}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {feed.hasMore && (
              <div className="notifications-more">
                <button
                  type="button"
                  className="notifications-button"
                  onClick={feed.loadMore}
                  disabled={feed.loadingMore}
                >
                  {feed.loadingMore ? "Cargando..." : "Cargar más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
