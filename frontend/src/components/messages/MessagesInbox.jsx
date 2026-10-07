import { Link, NavLink } from "react-router-dom";
import MessageAvatar from "./MessageAvatar";
import MessagesClose from "./MessagesClose";
import { formatInboxDate, formatUnreadCount } from "../../utils/messages";

function UnreadBadge({ count }) {
  if (!count) return null;

  return (
    <span
      className="messages-unread-badge"
      aria-label={count === 1 ? "1 sin leer" : `${count} sin leer`}
    >
      {formatUnreadCount(count)}
    </span>
  );
}

function InboxItem({ to, user, title, preview, date, unread, note }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `messages-item${isActive ? " is-active" : ""}${unread ? " is-unread" : ""}`
        }
      >
        <MessageAvatar user={user} />

        <span className="messages-item-text">
          <span className="messages-item-top">
            <span className="messages-item-name">{title}</span>
            {date && (
              <time className="messages-item-date" dateTime={date}>
                {formatInboxDate(date)}
              </time>
            )}
          </span>

          <span className="messages-item-bottom">
            <span className="messages-item-preview">{note || preview}</span>
            <UnreadBadge count={unread} />
          </span>
        </span>
      </NavLink>
    </li>
  );
}

// Bandeja de Mensajes: una lista por pestaña (Privados / Autores que sigo).
export default function MessagesInbox({
  tab,
  onTabChange,
  inbox,
  currentUser,
  onRetry,
}) {
  const { loading, error, conversations, channels, own } = inbox;
  const privateUnread = conversations.reduce(
    (sum, item) => sum + item.unread_count,
    0
  );
  const authorsUnread =
    channels.reduce((sum, item) => sum + item.unread_count, 0) +
    (own?.unread_count || 0);

  return (
    <>
      <header className="messages-sidebar-header">
        <h1>Mensajes</h1>

        <Link
          to="/mensajes/ajustes"
          className="messages-button"
          aria-label="Privacidad de mensajes"
          title="Privacidad de mensajes"
        >
          <span aria-hidden="true">⚙</span> Privacidad
        </Link>

        <MessagesClose />
      </header>

      <div className="messages-tabs" role="tablist" aria-label="Tipo de mensajes">
        <button
          type="button"
          role="tab"
          id="messages-tab-private"
          aria-selected={tab === "private"}
          aria-controls="messages-panel"
          onClick={() => onTabChange("private")}
        >
          Privados
          <UnreadBadge count={privateUnread} />
        </button>

        <button
          type="button"
          role="tab"
          id="messages-tab-authors"
          aria-selected={tab === "authors"}
          aria-controls="messages-panel"
          onClick={() => onTabChange("authors")}
        >
          Autores que sigo
          <UnreadBadge count={authorsUnread} />
        </button>
      </div>

      <div
        className="messages-list"
        id="messages-panel"
        role="tabpanel"
        aria-labelledby={`messages-tab-${tab}`}
      >
        {loading ? (
          <p className="messages-state">Cargando mensajes...</p>
        ) : error ? (
          <div className="messages-state" role="alert">
            <p>{error}</p>
            <button type="button" className="messages-button" onClick={onRetry}>
              Reintentar
            </button>
          </div>
        ) : tab === "private" ? (
          conversations.length === 0 ? (
            <p className="messages-state">
              Todavía no tienes conversaciones. Entra al perfil de alguien y
              elige «Enviar mensaje».
            </p>
          ) : (
            <ul>
              {conversations.map((conversation) => (
                <InboxItem
                  key={conversation.user.id}
                  to={`/mensajes/privados/${conversation.user.id}`}
                  user={conversation.user}
                  title={`@${conversation.user.username}`}
                  preview={
                    (conversation.last_message_is_mine ? "Tú: " : "") +
                    conversation.last_message_preview
                  }
                  note={conversation.blocked_by_me ? "Bloqueaste a esta persona" : ""}
                  date={conversation.last_message_at}
                  unread={conversation.unread_count}
                />
              ))}
            </ul>
          )
        ) : (
          <ul>
            <InboxItem
              to={`/mensajes/autores/${currentUser.id}`}
              user={currentUser}
              title="Mis mensajes a seguidores"
              preview={
                own?.post_count
                  ? own.last_post_preview
                  : "Escribe un aviso para quienes te siguen"
              }
              date={own?.last_post_at}
              unread={own?.unread_count || 0}
            />

            {channels.map((channel) => (
              <InboxItem
                key={channel.author.id}
                to={`/mensajes/autores/${channel.author.id}`}
                user={channel.author}
                title={`@${channel.author.username}`}
                preview={channel.last_post_preview}
                date={channel.last_post_at}
                unread={channel.unread_count}
              />
            ))}

            {channels.length === 0 && (
              <li className="messages-state">
                Cuando un autor que sigues envíe un mensaje a sus seguidores,
                aparecerá aquí.
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  );
}
