import { memo } from "react";
import FormattedText from "./FormattedText";
import { blockAttributes } from "../../utils/richText";

// Un párrafo del capítulo. El texto se muestra siempre como texto plano:
// el indicador de comentarios va fuera de él y nunca modifica el contenido.
// El indicador solo aparece cuando el párrafo ya tiene comentarios, para no
// interrumpir la lectura; se comenta con doble clic o doble toque.
// La alineación y la lista (con su número, si es numerada) van en el párrafo.
function ReaderParagraph({ index, text, number, count, isActive, onOpen }) {
  const block = blockAttributes(text, number);

  return (
    <p
      className={["reader-paragraph", block.className, isActive && "is-active"].filter(Boolean).join(" ")}
      style={block.style}
      data-number={block.number}
    >
      <span className="reader-paragraph-text" data-paragraph-index={index}>
        {isActive
          ? <mark className="reader-anchor-mark"><FormattedText text={text} /></mark>
          : <FormattedText text={text} />}
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
