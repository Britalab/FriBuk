import { memo } from "react";

// Un párrafo del capítulo. El texto se muestra siempre como texto plano:
// el botón de comentarios va fuera de él y nunca modifica el contenido.
// Se comenta el párrafo completo, desde ese botón.
function ReaderParagraph({ index, text, count, isActive, canComment, onOpen }) {
  // Las líneas en blanco entre párrafos no se comentan.
  const showButton = count > 0 || (canComment && text.trim() !== "");

  return (
    <p className={`reader-paragraph${isActive ? " is-active" : ""}`}>
      <span className="reader-paragraph-text" data-paragraph-index={index}>
        {isActive
          ? <mark className="reader-anchor-mark">{text}</mark>
          : text}
      </span>

      {showButton && (
        <button
          type="button"
          className={`reader-comment-indicator${count === 0 ? " is-empty" : ""}`}
          data-comment-indicator={index}
          onClick={() => onOpen(index)}
          aria-expanded={isActive}
          aria-label={
            count === 0
              ? "Comentar este párrafo"
              : count === 1
              ? "Ver 1 comentario de este párrafo"
              : `Ver ${count} comentarios de este párrafo`
          }
          title={count === 0 ? "Comentar este párrafo" : undefined}
        >
          <span className="reader-comment-indicator-icon" aria-hidden="true">💬</span>
          {count > 0 && <span aria-hidden="true">{count}</span>}
        </button>
      )}
    </p>
  );
}

export default memo(ReaderParagraph);
