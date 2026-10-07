import { Link } from "react-router-dom";
import { formatNotificationTime, getNotificationContent } from "../utils/notificationText";

// Una notificación: enlaza al contenido relacionado y, al abrirla, se marca
// como leída. `onMarkRead` y `onRemove` son opcionales: los usa el centro de
// actividad para marcarla como leída sin abrirla y para descartarla.
export default function NotificationItem({ notification, onOpen, onMarkRead, onRemove }) {
  const content = getNotificationContent(notification);
  const avatarUrl = notification.actor?.avatar_url;

  return (
    <li className={`notification-item${notification.is_read ? "" : " is-unread"}`}>
      <Link
        className="notification-link"
        to={content.to}
        onClick={() => onOpen?.(notification)}
      >
        <span className="notification-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : content.icon}
        </span>
        <span className="notification-body">
          <span className="notification-text">
            {content.actor && <strong>{content.actor}</strong>}
            {content.text}
          </span>
          {content.excerpt && (
            <span className="notification-excerpt">“{content.excerpt}”</span>
          )}
          <span className="notification-time">
            {formatNotificationTime(notification.updated_at || notification.created_at)}
            {!notification.is_read && (
              <span className="notification-unread-label"> · sin leer</span>
            )}
          </span>
        </span>
        {!notification.is_read && <span className="notification-dot" aria-hidden="true" />}
      </Link>
      {onMarkRead && !notification.is_read && (
        <button
          type="button"
          className="notification-remove notification-mark-read"
          onClick={() => onMarkRead(notification)}
          aria-label="Marcar como leída"
          title="Marcar como leída"
        >
          ✓
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          className="notification-remove"
          onClick={() => onRemove(notification)}
          aria-label="Descartar notificación"
          title="Descartar"
        >
          ×
        </button>
      )}
    </li>
  );
}
