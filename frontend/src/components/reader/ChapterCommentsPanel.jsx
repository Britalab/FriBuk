import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../hooks/useToast";
import {
  CHAPTER_REACTIONS,
  MAX_CHAPTER_COMMENT_EMOJIS,
  MAX_CHAPTER_COMMENT_LENGTH,
  QUICK_CHAPTER_REACTIONS,
} from "./chapterReactions";
import { countEmojis } from "../../utils/emoji";

const COLLAPSED_REPLIES = 2;

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Formulario compartido para comentar, responder y editar. Sin `onCancel`
// no muestra el botón de cancelar (el formulario fijo del final del capítulo).
export function CommentForm({
  label,
  placeholder,
  submitLabel,
  initialValue = "",
  autoFocus = true,
  onSubmit,
  onCancel,
}) {
  const [value, setValue] = useState(initialValue);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef(null);
  const fieldId = useId();
  const emojiCount = countEmojis(value);
  const tooManyEmojis = emojiCount > MAX_CHAPTER_COMMENT_EMOJIS;
  const emojisLeft = Math.max(0, MAX_CHAPTER_COMMENT_EMOJIS - emojiCount);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !autoFocus) return;

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [autoFocus]);

  // Escribe un emoji donde está el cursor. Los emojis también se pueden
  // escribir con el teclado; este selector es solo un atajo.
  const insertEmoji = (emoji) => {
    const textarea = textareaRef.current;
    if (!textarea || emojisLeft === 0) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);

    if (next.length > MAX_CHAPTER_COMMENT_LENGTH) return;

    setValue(next);
    setError("");

    // El cursor queda justo después del emoji insertado.
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const content = value.trim();
    if (!content || sending || tooManyEmojis) return;

    setSending(true);
    setError("");

    try {
      await onSubmit(content);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  return (
    <form className="reader-comment-form" onSubmit={handleSubmit}>
      <label className="reader-visually-hidden" htmlFor={fieldId}>
        {label}
      </label>

      <textarea
        id={fieldId}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
        }}
        placeholder={placeholder}
        maxLength={MAX_CHAPTER_COMMENT_LENGTH}
        rows={3}
        aria-invalid={tooManyEmojis}
      />

      {tooManyEmojis && (
        <p className="reader-comment-error" role="alert">
          Un comentario puede incluir hasta {MAX_CHAPTER_COMMENT_EMOJIS} emojis
          (llevas {emojiCount}). Quita {emojiCount - MAX_CHAPTER_COMMENT_EMOJIS} para
          publicarlo.
        </p>
      )}

      {error && (
        <p className="reader-comment-error" role="alert">{error}</p>
      )}

      {emojiPickerOpen && (
        <div
          className="reader-emoji-picker"
          role="group"
          aria-label="Insertar un emoji en el comentario"
        >
          {CHAPTER_REACTIONS.map(({ value: name, emoji, label }) => (
            <button
              key={name}
              type="button"
              // Mantiene el cursor y el teclado del teléfono en el texto.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertEmoji(emoji)}
              disabled={emojisLeft === 0}
              aria-label={`Insertar ${label}`}
              title={label}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}

          <p className="reader-emoji-picker-note" role="status">
            {emojisLeft === 0
              ? `Ya usaste los ${MAX_CHAPTER_COMMENT_EMOJIS} emojis de este comentario.`
              : `Puedes repetirlos. Te quedan ${emojisLeft} de ${MAX_CHAPTER_COMMENT_EMOJIS}.`}
          </p>
        </div>
      )}

      <div className="reader-comment-form-actions">
        <button
          type="button"
          className="reader-emoji-toggle"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setEmojiPickerOpen((open) => !open)}
          aria-expanded={emojiPickerOpen}
          aria-label="Insertar emoji"
          title="Insertar emoji"
        >
          <span aria-hidden="true">😊</span>
        </button>

        <span className="reader-comment-counter" aria-hidden="true">
          {value.length}/{MAX_CHAPTER_COMMENT_LENGTH}
          {emojiCount > 0 && (
            <span className={tooManyEmojis ? "is-over" : ""}>
              {" · "}{emojiCount}/{MAX_CHAPTER_COMMENT_EMOJIS} emojis
            </span>
          )}
        </span>

        {onCancel && (
          <button
            type="button"
            className="reader-comment-button"
            onClick={onCancel}
            disabled={sending}
          >
            Cancelar
          </button>
        )}

        <button
          type="submit"
          className="reader-comment-button is-primary"
          disabled={sending || tooManyEmojis || !value.trim()}
        >
          {sending ? "Enviando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ReactionBar({ comment, onToggle }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const containerRef = useRef(null);
  const moreButtonRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setPickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [pickerOpen]);

  const counts = comment.reactions || {};
  // Las frecuentes más las que ya recibió este comentario.
  const visible = CHAPTER_REACTIONS.filter(({ value }) => (
    QUICK_CHAPTER_REACTIONS.includes(value) ||
    counts[value] > 0 ||
    comment.my_reaction === value
  ));

  const react = async (value) => {
    if (sending) return;

    setPickerOpen(false);
    setSending(true);
    await onToggle(comment, value);
    setSending(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && pickerOpen) {
      // Cierra solo el selector, no el panel de comentarios.
      event.stopPropagation();
      setPickerOpen(false);
      moreButtonRef.current?.focus();
    }
  };

  return (
    <div
      className="reader-reactions"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {visible.map(({ value, emoji, label }) => {
        const count = counts[value] || 0;
        const isMine = comment.my_reaction === value;

        return (
          <button
            key={value}
            type="button"
            className={`reader-reaction${isMine ? " is-mine" : ""}`}
            onClick={() => react(value)}
            disabled={sending}
            aria-pressed={isMine}
            aria-label={`${label}: ${count}`}
            title={label}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span aria-hidden="true">{count}</span>}
          </button>
        );
      })}

      <button
        type="button"
        ref={moreButtonRef}
        className="reader-reaction reader-reaction-more"
        onClick={() => setPickerOpen((open) => !open)}
        aria-expanded={pickerOpen}
        aria-label="Más reacciones"
        title="Más reacciones"
      >
        <span aria-hidden="true">···</span>
      </button>

      {pickerOpen && (
        <div
          className="reader-reaction-picker"
          role="group"
          aria-label="Todas las reacciones"
        >
          {CHAPTER_REACTIONS.map(({ value, emoji, label }) => (
            <button
              key={value}
              type="button"
              className={comment.my_reaction === value ? "is-mine" : ""}
              onClick={() => react(value)}
              disabled={sending}
              aria-pressed={comment.my_reaction === value}
              aria-label={label}
              title={label}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment, actions, isAuthenticated, onReply }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleReaction = async (target, reaction) => {
    if (!isAuthenticated) {
      showToast("Inicia sesión para reaccionar a un comentario.", "error");
      return;
    }

    try {
      await actions.toggleReaction(target, reaction);
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      comment.is_own
        ? "¿Eliminar tu comentario? También se eliminarán sus respuestas."
        : "¿Retirar este comentario? Dejará de ser visible para todos."
    );
    if (!confirmed) return;

    setDeleting(true);

    try {
      await actions.deleteComment(comment.id);
    } catch (err) {
      showToast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <article className={`reader-comment${comment.parent_id ? " is-reply" : ""}`}>
      <header className="reader-comment-meta">
        <Link to={`/usuario/${comment.user_id}`} className="reader-comment-author">
          {comment.username}
        </Link>
        <time dateTime={comment.created_at}>{formatDate(comment.created_at)}</time>
        {comment.edited_at && <span>· editado</span>}
      </header>

      {editing ? (
        <CommentForm
          label="Editar comentario"
          placeholder="Escribe tu comentario..."
          submitLabel="Guardar"
          initialValue={comment.content}
          onCancel={() => setEditing(false)}
          onSubmit={async (content) => {
            await actions.updateComment(comment.id, content);
            setEditing(false);
          }}
        />
      ) : (
        <p className="reader-comment-content">{comment.content}</p>
      )}

      <ReactionBar comment={comment} onToggle={handleReaction} />

      {!editing && (onReply || comment.can_edit || comment.can_delete) && (
        <div className="reader-comment-actions">
          {onReply && (
            <button type="button" onClick={onReply}>Responder</button>
          )}
          {comment.can_edit && (
            <button type="button" onClick={() => setEditing(true)}>Editar</button>
          )}
          {comment.can_delete && (
            <button type="button" onClick={handleDelete} disabled={deleting}>
              {comment.is_own ? "Eliminar" : "Retirar"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function CommentThread({ comment, replies, actions, isAuthenticated }) {
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hiddenCount = expanded ? 0 : Math.max(0, replies.length - COLLAPSED_REPLIES);
  const visibleReplies = hiddenCount > 0 ? replies.slice(-COLLAPSED_REPLIES) : replies;

  return (
    <div className="reader-comment-thread">
      <CommentItem
        comment={comment}
        actions={actions}
        isAuthenticated={isAuthenticated}
        onReply={isAuthenticated ? () => setReplying(true) : null}
      />

      {(replies.length > 0 || replying) && (
        <div className="reader-comment-replies">
          {hiddenCount > 0 && (
            <button
              type="button"
              className="reader-comment-more-replies"
              onClick={() => setExpanded(true)}
            >
              Ver {hiddenCount} {hiddenCount === 1 ? "respuesta anterior" : "respuestas anteriores"}
            </button>
          )}

          {visibleReplies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              actions={actions}
              isAuthenticated={isAuthenticated}
            />
          ))}

          {replying && (
            <CommentForm
              label={`Responder a ${comment.username}`}
              placeholder={`Responder a ${comment.username}...`}
              submitLabel="Responder"
              onCancel={() => setReplying(false)}
              onSubmit={async (content) => {
                await actions.createReply(comment.id, content);
                setExpanded(true);
                setReplying(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Agrupa los comentarios que citan exactamente el mismo fragmento.
function groupByFragment(threads) {
  const groups = new Map();

  for (const thread of threads) {
    const key = `${thread.paragraph_index}:${thread.start_offset}:${thread.end_offset}:${thread.quote}`;
    if (!groups.has(key)) {
      groups.set(key, { key, quote: thread.quote, start: thread.start_offset, threads: [] });
    }
    groups.get(key).threads.push(thread);
  }

  return Array.from(groups.values());
}

// Panel de comentarios: lateral en escritorio y bandeja inferior en móvil.
// No bloquea la página: el capítulo se puede seguir leyendo con él abierto.
export default function ChapterCommentsPanel({
  mode,
  threads,
  repliesByParent,
  draft,
  isAuthenticated,
  actions,
  onSubmitDraft,
  onStartDraft,
  onCancelDraft,
  onClose,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const isOrphans = mode === "orphans";
  const groups = groupByFragment(threads);
  const total = threads.reduce(
    (sum, thread) => sum + 1 + (repliesByParent.get(thread.id)?.length || 0),
    0
  );

  // En escritorio el panel empieza justo debajo de la barra de navegación.
  useLayoutEffect(() => {
    const navbar = document.querySelector(".navbar");
    if (navbar && panelRef.current) {
      panelRef.current.style.setProperty(
        "--reader-panel-top",
        `${Math.round(navbar.getBoundingClientRect().height)}px`
      );
    }
  }, []);

  useEffect(() => {
    // Con un borrador abierto, el foco va al cuadro de texto.
    if (!draft) panelRef.current?.focus({ preventScroll: true });
  }, [mode, draft]);

  return (
    <aside
      className="reader-comments-panel"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // No se descarta por accidente un texto a medio escribir.
        if (event.target.tagName === "TEXTAREA" && event.target.value.trim()) return;
        onClose();
      }}
    >
      <header className="reader-comments-header">
        <h2 id={titleId}>
          {isOrphans ? "Comentarios de texto editado" : "Comentarios"}
          {total > 0 && <span className="reader-comments-total">{total}</span>}
        </h2>

        <button
          type="button"
          className="reader-comments-close"
          onClick={onClose}
          aria-label="Cerrar comentarios"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="reader-comments-body">
        {isOrphans && (
          <p className="reader-comments-note">
            Estos comentarios se escribieron sobre fragmentos que el autor
            modificó o eliminó. Se muestran con el texto original que citaban.
          </p>
        )}

        {draft && (
          <section className="reader-comment-group">
            <blockquote className="reader-comment-quote">{draft.quote}</blockquote>
            <CommentForm
              key={`${draft.paragraphIndex}:${draft.startOffset}:${draft.endOffset}`}
              label="Tu comentario sobre este párrafo"
              placeholder="¿Qué te hizo sentir esta parte?"
              submitLabel="Publicar"
              onCancel={onCancelDraft}
              onSubmit={onSubmitDraft}
            />
          </section>
        )}

        {!isOrphans && !draft && isAuthenticated && groups.length > 0 && (
          <button
            type="button"
            className="reader-comment-button is-primary reader-comment-start"
            onClick={onStartDraft}
          >
            Comentar este párrafo
          </button>
        )}

        {groups.map((group) => (
          <section className="reader-comment-group" key={group.key}>
            <blockquote className="reader-comment-quote">{group.quote}</blockquote>

            {group.threads.map((thread) => (
              <CommentThread
                key={thread.id}
                comment={thread}
                replies={repliesByParent.get(thread.id) || []}
                actions={actions}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </section>
        ))}

        {!draft && groups.length === 0 && (
          <p className="reader-comments-note">
            Todavía no hay comentarios en este párrafo.
          </p>
        )}

        {!isAuthenticated && !isOrphans && (
          <p className="reader-comments-note">
            <Link to="/login">Inicia sesión</Link> para comentar, responder y reaccionar.
          </p>
        )}
      </div>
    </aside>
  );
}
