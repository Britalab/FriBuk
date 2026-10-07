import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useToast } from "../../hooks/useToast";
import MessageAvatar from "./MessageAvatar";
import MessageComposer from "./MessageComposer";
import MessagesClose from "./MessagesClose";
import {
  PRIVATE_MESSAGE_MAX_LENGTH,
  REPORT_REASON_MAX_LENGTH,
  apiErrorDetail,
  formatMessageTime,
  groupMessagesByDay,
  messageTextError,
  notifyMessagesChanged,
} from "../../utils/messages";

const REFRESH_INTERVAL_MS = 15000;

function ReportForm({ userId, messageId, onClose }) {
  const { showToast } = useToast();
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    const problem = messageTextError(reason, REPORT_REASON_MAX_LENGTH);
    if (problem) {
      setError("Cuéntanos el motivo del reporte.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await api.post(`/messages/private/${userId}/report`, {
        reason: reason.trim(),
        message_id: messageId || null,
      });
      showToast(response.data.message || "Reporte enviado.");
      onClose();
    } catch (requestError) {
      setError(apiErrorDetail(requestError, "No se pudo enviar el reporte."));
      setSending(false);
    }
  };

  return (
    <form className="messages-report" onSubmit={handleSubmit}>
      <label htmlFor="message-report-reason">
        {messageId
          ? "¿Por qué reportas este mensaje?"
          : "¿Por qué reportas esta conversación?"}
      </label>

      <textarea
        id="message-report-reason"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setError("");
        }}
        rows={3}
        maxLength={REPORT_REASON_MAX_LENGTH}
        placeholder="Describe brevemente lo que ocurrió."
        autoFocus
      />

      <p className="messages-hint">
        El equipo de FriBuk revisará el reporte. La otra persona no recibe
        ningún aviso.
      </p>

      {error && <p className="messages-error" role="alert">{error}</p>}

      <div className="messages-report-actions">
        <button
          type="button"
          className="messages-button"
          onClick={onClose}
          disabled={sending}
        >
          Cancelar
        </button>
        <button type="submit" className="messages-button is-primary" disabled={sending}>
          {sending ? "Enviando..." : "Enviar reporte"}
        </button>
      </div>
    </form>
  );
}

// Conversación privada con una persona. Se identifica por esa persona y no
// por un id de conversación: así nadie puede pedir una conversación ajena.
export default function PrivateThread({ userId }) {
  const { showToast } = useToast();
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const endRef = useRef(null);
  const lastMessageIdRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/messages/private/${userId}`);
      const data = response.data;
      setThread(data);
      setError("");

      // Abrir la conversación marca como leído lo que me enviaron.
      if (data.messages.some((message) => !message.is_mine && !message.read_at)) {
        await api.post(`/messages/private/${userId}/read`);
        notifyMessagesChanged();
      }
    } catch (requestError) {
      setError(apiErrorDetail(requestError, "No se pudo cargar la conversación."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    refreshIfVisible();
    const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [load]);

  // Baja al último mensaje solo cuando llega uno nuevo, no en cada consulta.
  const messages = thread?.messages;
  useEffect(() => {
    const lastId = messages?.length ? messages[messages.length - 1].id : null;
    if (lastId && lastId !== lastMessageIdRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
    }
    lastMessageIdRef.current = lastId;
  }, [messages]);

  const handleSend = async (content) => {
    const response = await api.post(`/messages/private/${userId}`, { content });

    setThread((current) =>
      current
        ? {
            ...current,
            has_conversation: true,
            messages: [...current.messages, response.data.message],
          }
        : current
    );
    notifyMessagesChanged();
  };

  const handleDelete = async (message) => {
    if (!window.confirm("¿Eliminar este mensaje? Se borrará para las dos personas.")) {
      return;
    }

    try {
      await api.delete(`/messages/private/${userId}/${message.id}`);
      setThread((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter((item) => item.id !== message.id),
            }
          : current
      );
      notifyMessagesChanged();
    } catch (requestError) {
      showToast(apiErrorDetail(requestError, "No se pudo eliminar el mensaje."), "error");
    }
  };

  const handleToggleBlock = async () => {
    if (!thread || blocking) return;

    const blockedByMe = thread.blocked_by_me;
    if (
      !blockedByMe &&
      !window.confirm(
        `¿Bloquear a @${thread.user.username}? No podrán enviarse mensajes mientras dure el bloqueo.`
      )
    ) {
      return;
    }

    setBlocking(true);

    try {
      if (blockedByMe) {
        await api.delete(`/users/${userId}/block`);
        showToast(`Desbloqueaste a @${thread.user.username}.`);
      } else {
        await api.post(`/users/${userId}/block`);
        showToast(`Bloqueaste a @${thread.user.username}.`);
      }
      await load();
      notifyMessagesChanged();
    } catch (requestError) {
      showToast(apiErrorDetail(requestError, "No se pudo guardar el cambio."), "error");
    } finally {
      setBlocking(false);
    }
  };

  if (loading) {
    return <p className="messages-state">Cargando conversación...</p>;
  }

  if (error && !thread) {
    return (
      <div className="messages-state" role="alert">
        <p>{error}</p>
        <Link to="/mensajes" className="messages-button">Volver a Mensajes</Link>
      </div>
    );
  }

  const { user } = thread;
  const lastMine = [...thread.messages].reverse().find((message) => message.is_mine);

  return (
    <>
      <header className="messages-thread-header">
        <Link
          to="/mensajes"
          className="messages-back"
          aria-label="Volver a la lista de mensajes"
        >
          <span aria-hidden="true">←</span>
        </Link>

        <Link to={`/usuario/${user.id}`} className="messages-thread-user">
          <MessageAvatar user={user} />
          <span>@{user.username}</span>
        </Link>

        <div className="messages-thread-actions">
          <button
            type="button"
            className="messages-button"
            onClick={() => setReport(report ? null : { messageId: null })}
            disabled={!thread.has_conversation}
            aria-expanded={Boolean(report)}
          >
            Reportar
          </button>
          <button
            type="button"
            className="messages-button"
            onClick={handleToggleBlock}
            disabled={blocking}
          >
            {thread.blocked_by_me ? "Desbloquear" : "Bloquear"}
          </button>
        </div>

        <MessagesClose inThread />
      </header>

      {report && (
        <ReportForm
          userId={userId}
          messageId={report.messageId}
          onClose={() => setReport(null)}
        />
      )}

      <div
        className="messages-scroll"
        role="log"
        aria-label={`Conversación con @${user.username}`}
        tabIndex={0}
      >
        {thread.messages.length === 0 ? (
          <p className="messages-state">
            Aún no hay mensajes. Escribe el primero para empezar la conversación.
          </p>
        ) : (
          groupMessagesByDay(thread.messages).map((group) => (
            <section key={group.label} aria-label={group.label}>
              <p className="messages-day">{group.label}</p>

              {group.messages.map((message) => (
                <article
                  key={message.id}
                  className={`message-bubble${message.is_mine ? " is-mine" : ""}`}
                >
                  <p className="messages-visually-hidden">
                    {message.is_mine ? "Tú" : `@${user.username}`}
                  </p>
                  <p className="message-bubble-text">{message.content}</p>

                  <footer className="message-bubble-meta">
                    <time dateTime={message.created_at}>
                      {formatMessageTime(message.created_at)}
                    </time>
                    {message.is_mine && message.id === lastMine?.id && (
                      <span>{message.read_at ? "· Leído" : "· Enviado"}</span>
                    )}
                    {message.is_mine ? (
                      <button
                        type="button"
                        className="message-bubble-report"
                        onClick={() => handleDelete(message)}
                      >
                        Eliminar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="message-bubble-report"
                        onClick={() => setReport({ messageId: message.id })}
                      >
                        Reportar
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </section>
          ))
        )}
        <div ref={endRef} />
      </div>

      {thread.can_send ? (
        <MessageComposer
          label={`Mensaje para @${user.username}`}
          placeholder="Escribe un mensaje..."
          maxLength={PRIVATE_MESSAGE_MAX_LENGTH}
          onSend={handleSend}
        >
          {thread.replies_blocked_by_my_privacy && (
            <p className="messages-hint">
              Con tu privacidad actual, @{user.username} no podrá responderte.{" "}
              <Link to="/mensajes/ajustes">Cambiar privacidad</Link>
            </p>
          )}
        </MessageComposer>
      ) : (
        <p className="messages-closed" role="status">
          {thread.cannot_send_reason || "No puedes enviar mensajes a esta persona."}
        </p>
      )}
    </>
  );
}
