import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useToast } from "../../hooks/useToast";
import MessageAvatar from "./MessageAvatar";
import MessageComposer from "./MessageComposer";
import MessagesClose from "./MessagesClose";
import {
  AUTHOR_POST_MAX_LENGTH,
  AUTHOR_REPLY_MAX_LENGTH,
  apiErrorDetail,
  formatMessageDateTime,
  notifyMessagesChanged,
} from "../../utils/messages";

const REFRESH_INTERVAL_MS = 30000;

function AuthorPost({
  post,
  author,
  isOwn,
  canReply,
  onReply,
  onToggleReplies,
  onDelete,
  onDeleteReply,
}) {
  const [replyTo, setReplyTo] = useState(null);
  const [replying, setReplying] = useState(false);

  // El autor contesta a quien quiera; un seguidor solo le contesta al autor.
  const canWrite = isOwn || (canReply && post.replies_open);
  const canAnswer = (reply) =>
    canWrite && !reply.is_mine && (isOwn || reply.is_author);
  const repliesById = new Map(post.replies.map((reply) => [reply.id, reply]));

  return (
    <article className="author-post">
      <header className="author-post-header">
        <MessageAvatar user={author} size="small" />
        <strong>@{author.username}</strong>
        <time dateTime={post.created_at}>{formatMessageDateTime(post.created_at)}</time>
      </header>

      <p className="author-post-text">{post.content}</p>

      {isOwn && (
        <div className="author-post-controls">
          <button
            type="button"
            className="messages-button"
            onClick={() => onToggleReplies(post)}
            aria-pressed={!post.replies_open}
          >
            {post.replies_open ? "Cerrar respuestas" : "Permitir respuestas"}
          </button>
          <button type="button" className="messages-button" onClick={() => onDelete(post)}>
            Eliminar
          </button>
        </div>
      )}

      {post.replies.length > 0 && (
        <ul className="author-replies" aria-label="Respuestas">
          {post.replies.map((reply) => {
            const target = reply.reply_to_id ? repliesById.get(reply.reply_to_id) : null;

            return (
              <li
                key={reply.id}
                className={`author-reply${reply.is_author ? " is-author" : ""}`}
              >
                <p className="author-reply-meta">
                  <strong>@{reply.user.username}</strong>
                  {reply.is_author && <span className="author-reply-badge">Autor</span>}
                  <time dateTime={reply.created_at}>
                    {formatMessageDateTime(reply.created_at)}
                  </time>
                </p>

                {target && (
                  <p className="author-reply-target">
                    En respuesta a @{target.user.username}
                  </p>
                )}

                <p className="author-reply-text">{reply.content}</p>

                {canAnswer(reply) && (
                  <button
                    type="button"
                    className="author-reply-action"
                    onClick={() => {
                      setReplyTo(reply);
                      setReplying(true);
                    }}
                  >
                    Responder
                  </button>
                )}

                {/* Cada quien borra lo suyo; el autor, cualquier respuesta de su hilo. */}
                {(reply.is_mine || isOwn) && (
                  <button
                    type="button"
                    className="author-reply-action"
                    onClick={() => onDeleteReply(post, reply)}
                  >
                    Eliminar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!post.replies_open && (
        <p className="messages-hint author-post-closed">
          {isOwn
            ? "Cerraste las respuestas de este mensaje."
            : "El autor cerró las respuestas de este mensaje."}
        </p>
      )}

      {canWrite &&
        (replying ? (
          <MessageComposer
            label="Tu respuesta"
            placeholder={
              replyTo ? `Responder a @${replyTo.user.username}...` : "Escribe una respuesta..."
            }
            submitLabel="Responder"
            maxLength={AUTHOR_REPLY_MAX_LENGTH}
            onSend={async (content) => {
              await onReply(post, content, replyTo?.id || null);
              setReplyTo(null);
              setReplying(false);
            }}
          >
            <p className="messages-hint author-reply-context">
              {replyTo
                ? `Respondiendo a @${replyTo.user.username}`
                : `Respondiendo al mensaje de @${author.username}`}
              <button
                type="button"
                className="author-reply-action"
                onClick={() => {
                  setReplyTo(null);
                  setReplying(false);
                }}
              >
                Cancelar
              </button>
            </p>
          </MessageComposer>
        ) : (
          <button
            type="button"
            className="messages-button author-post-reply"
            onClick={() => setReplying(true)}
          >
            Responder
          </button>
        ))}
    </article>
  );
}

// Mensajes de un autor a sus seguidores. Es comunicación autor ↔ seguidores:
// no hay reacciones y un seguidor no le responde a otro seguidor.
export default function AuthorChannel({ authorId }) {
  const { showToast } = useToast();
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repliesOpen, setRepliesOpen] = useState(true);
  const announcedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/messages/authors/${authorId}`);
      setChannel(response.data);
      setError(null);

      // Abrir los mensajes de un autor los marca como leídos. La bandeja
      // y la barra de navegación solo necesitan enterarse la primera vez.
      await api.post(`/messages/authors/${authorId}/read`);
      if (!announcedRef.current) {
        announcedRef.current = true;
        notifyMessagesChanged();
      }
    } catch (requestError) {
      setError({
        status: requestError?.response?.status,
        message: apiErrorDetail(requestError, "No se pudieron cargar los mensajes."),
      });
    } finally {
      setLoading(false);
    }
  }, [authorId]);

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

  const updatePost = (postId, change) => {
    setChannel((current) =>
      current
        ? {
            ...current,
            posts: current.posts.map((post) =>
              post.id === postId ? change(post) : post
            ),
          }
        : current
    );
  };

  const handlePublish = async (content) => {
    const response = await api.post("/messages/author-posts", {
      content,
      replies_open: repliesOpen,
    });

    setChannel((current) =>
      current ? { ...current, posts: [response.data.post, ...current.posts] } : current
    );
    notifyMessagesChanged();
    showToast("Tu mensaje se envió a tus seguidores.");
  };

  const handleReply = async (post, content, replyToId) => {
    const response = await api.post(`/messages/author-posts/${post.id}/replies`, {
      content,
      reply_to_id: replyToId,
    });

    updatePost(post.id, (current) => ({
      ...current,
      replies: [...current.replies, response.data.reply],
    }));
  };

  const handleDeleteReply = async (post, reply) => {
    if (!window.confirm("¿Eliminar esta respuesta? No se puede deshacer.")) return;

    try {
      await api.delete(`/messages/author-replies/${reply.id}`);
      updatePost(post.id, (current) => ({
        ...current,
        replies: current.replies.filter((item) => item.id !== reply.id),
      }));
    } catch (requestError) {
      showToast(apiErrorDetail(requestError, "No se pudo eliminar la respuesta."), "error");
    }
  };

  const handleToggleReplies = async (post) => {
    try {
      const response = await api.patch(`/messages/author-posts/${post.id}`, {
        replies_open: !post.replies_open,
      });
      updatePost(post.id, (current) => ({
        ...current,
        replies_open: response.data.replies_open,
      }));
    } catch (requestError) {
      showToast(apiErrorDetail(requestError, "No se pudo guardar el cambio."), "error");
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm("¿Eliminar este mensaje y sus respuestas? No se puede deshacer.")) {
      return;
    }

    try {
      await api.delete(`/messages/author-posts/${post.id}`);
      setChannel((current) =>
        current
          ? { ...current, posts: current.posts.filter((item) => item.id !== post.id) }
          : current
      );
      notifyMessagesChanged();
    } catch (requestError) {
      showToast(apiErrorDetail(requestError, "No se pudo eliminar el mensaje."), "error");
    }
  };

  if (loading) {
    return <p className="messages-state">Cargando mensajes...</p>;
  }

  if (error && !channel) {
    return (
      <div className="messages-state" role="alert">
        <p>{error.message}</p>
        {error.status === 403 && (
          <Link to={`/usuario/${authorId}`} className="messages-button">
            Ver el perfil del autor
          </Link>
        )}
        <Link to="/mensajes" className="messages-button">Volver a Mensajes</Link>
      </div>
    );
  }

  const { author, posts } = channel;
  const isOwn = channel.is_own;

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

        {isOwn ? (
          <div className="messages-thread-user">
            <MessageAvatar user={author} />
            <span>Mis mensajes a seguidores</span>
          </div>
        ) : (
          <Link to={`/usuario/${author.id}`} className="messages-thread-user">
            <MessageAvatar user={author} />
            <span>@{author.username}</span>
          </Link>
        )}

        <MessagesClose inThread />
      </header>

      <div className="messages-scroll" tabIndex={0} aria-label="Mensajes del autor">
        {isOwn && (
          <section className="author-compose" aria-label="Nuevo mensaje a tus seguidores">
            <MessageComposer
              label="Mensaje para tus seguidores"
              placeholder="Cuéntales algo a quienes te siguen..."
              submitLabel="Publicar"
              maxLength={AUTHOR_POST_MAX_LENGTH}
              rows={3}
              onSend={handlePublish}
            >
              <p className="messages-hint">
                Lo verán las personas que te siguen. Solo ellas pueden responder.
              </p>
            </MessageComposer>

            <label className="author-compose-toggle">
              <input
                type="checkbox"
                checked={repliesOpen}
                onChange={(event) => setRepliesOpen(event.target.checked)}
              />
              <span>Permitir respuestas en el próximo mensaje</span>
            </label>
          </section>
        )}

        {!isOwn && !channel.can_reply && (
          <p className="messages-closed" role="status">
            No puedes responder a los mensajes de este autor.
          </p>
        )}

        {posts.length === 0 ? (
          <p className="messages-state">
            {isOwn
              ? "Aún no has enviado mensajes a tus seguidores."
              : "Este autor todavía no ha enviado mensajes a sus seguidores."}
          </p>
        ) : (
          posts.map((post) => (
            <AuthorPost
              key={post.id}
              post={post}
              author={author}
              isOwn={isOwn}
              canReply={channel.can_reply}
              onReply={handleReply}
              onToggleReplies={handleToggleReplies}
              onDelete={handleDelete}
              onDeleteReply={handleDeleteReply}
            />
          ))
        )}
      </div>
    </>
  );
}
