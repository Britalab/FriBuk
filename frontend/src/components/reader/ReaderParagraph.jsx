import { memo } from "react";
import { splitByRanges } from "../../utils/textAnchors";

// Un párrafo del capítulo. El texto se muestra siempre como texto plano:
// el indicador de comentarios va fuera de él y nunca modifica el contenido.
function ReaderParagraph({ index, text, count, isActive, ranges, onOpen }) {
  return (
    <p className={`reader-paragraph${isActive ? " is-active" : ""}`}>
      <span className="reader-paragraph-text" data-paragraph-index={index}>
        {ranges
          ? splitByRanges(text, ranges).map((piece, position) => (
              piece.marked
                ? <mark className="reader-anchor-mark" key={position}>{piece.text}</mark>
                : piece.text
            ))
          : text}
      </span>

      {count > 0 && (
        <button
          type="button"
          className="reader-comment-indicator"
          data-comment-indicator={index}
          onClick={() => onOpen(index)}
          aria-expanded={isActive}
          aria-label={
            count === 1
              ? "Ver 1 comentario de este párrafo"
              : `Ver ${count} comentarios de este párrafo`
          }
        >
          <span className="reader-comment-indicator-icon" aria-hidden="true">💬</span>
          <span aria-hidden="true">{count}</span>
        </button>
      )}
    </p>
  );
}

export default memo(ReaderParagraph);
