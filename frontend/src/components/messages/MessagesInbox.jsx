import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import api from "../../api/client";
import MessageAvatar from "./MessageAvatar";
import MessagesClose from "./MessagesClose";
import {
  apiErrorDetail,
  formatInboxDate,
  formatUnreadCount,
} from "../../utils/messages";

const EMPTY_FOLLOWERS = { status: "idle", list: [], error: "" };

// Para comparar nombres de usuario sin importar mayúsculas, tildes ni la "@".
function normalizeSearch(value) {
  return (value || "")
    .trim()
    .replace(/^@/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

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

function InboxItem({ to, user, title, preview, date, unread, note, onClick }) {
  return (
    <li>
      <NavLink
        to={to}
        onClick={onClick}
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

  const [query, setQuery] = useState("");
  const [followers, setFollowers] = useState(EMPTY_FOLLOWERS);

  // Los seguidores se piden una sola vez, al usar el buscador.
  const loadFollowers = async () => {
    if (followers.status === "loading" || followers.status === "ready") return;

    setFollowers({ status: "loading", list: [], error: "" });
    try {
      const response = await api.get(`/users/${currentUser.id}/followers`);
      setFollowers({
        status: "ready",
        list: Array.isArray(response.data) ? response.data : [],
        error: "",
      });
    } catch (requestError) {
      setFollowers({
        status: "error",
        list: [],
        error: apiErrorDetail(requestError, "No se pudieron cargar tus seguidores."),
      });
    }
  };

  const term = normalizeSearch(query);
  const searching = tab === "private" && term !== "";
  const matches = searching
    ? followers.list.filter((follower) =>
        normalizeSearch(follower.username).includes(term)
      )
    : [];
  const conversationByUser = new Map(
    conversations.map((conversation) => [conversation.user.id, conversation])
  );

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

      {tab === "private" && (
        <div className="messages-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" />
          </svg>

          <input
            type="search"
            aria-label="Buscar entre tus seguidores"
            placeholder="Buscar entre tus seguidores"
            autoComplete="off"
            value={query}
            onFocus={loadFollowers}
            onChange={(event) => {
              setQuery(event.target.value);
              loadFollowers();
            }}
          />
        </div>
      )}

      <div
        className="messages-list"
        id="messages-panel"
        role="tabpanel"
        aria-labelledby={`messages-tab-${tab}`}
      >
        {searching ? (
          followers.status === "error" ? (
            <div className="messages-state" role="alert">
              <p>{followers.error}</p>
              <button
                type="button"
                className="messages-button"
                onClick={loadFollowers}
              >
                Reintentar
              </button>
            </div>
          ) : followers.status !== "ready" ? (
            <p className="messages-state">Buscando entre tus seguidores...</p>
          ) : followers.list.length === 0 ? (
            <p className="messages-state">
              Todavía no tienes seguidores a quienes escribir.
            </p>
          ) : matches.length === 0 ? (
            <p className="messages-state">
              Ninguno de tus seguidores coincide con «{query.trim()}».
            </p>
          ) : (
            <ul>
              {matches.map((follower) => {
                const conversation = conversationByUser.get(follower.id);

                return (
                  <InboxItem
                    key={follower.id}
                    to={`/mensajes/privados/${follower.id}`}
                    user={follower}
                    title={`@${follower.username}`}
                    preview={
                      conversation
                        ? (conversation.last_message_is_mine ? "Tú: " : "") +
                          conversation.last_message_preview
                        : "Enviar un mensaje"
                    }
                    date={conversation?.last_message_at}
                    unread={conversation?.unread_count || 0}
                    onClick={() => setQuery("")}
                  />
                );
              })}
            </ul>
          )
        ) : loading ? (
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
              Todavía no tienes conversaciones. Busca a alguien que te siga o
              entra a un perfil y elige «Enviar mensaje».
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
