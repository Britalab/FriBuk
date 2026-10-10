import { useRef, useState } from "react";
import FormattedText from "../reader/FormattedText";
import { toggleInline } from "../../utils/richText";

// Cuadro de texto del capítulo, con botones de negrita y cursiva y una vista
// previa. El capítulo sigue siendo texto simple: destacar es rodear el texto
// con asteriscos (ver utils/richText.js).
export default function ChapterTextEditor({ id, value, onChange, placeholder, rows = 20 }) {
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef(null);

  const applyFormat = (kind) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = toggleInline(
      value,
      textarea.selectionStart ?? value.length,
      textarea.selectionEnd ?? value.length,
      kind
    );

    onChange(result.value);

    // El cursor vuelve a su lugar cuando el texto nuevo ya está en pantalla.
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(result.start, result.end);
    });
  };

  const handleKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

    // Ctrl+B y Ctrl+I. Los atajos de Word en español (Ctrl+N y Ctrl+K) los
    // usa el propio navegador y no se pueden tomar.
    const key = event.key.toLowerCase();
    const kind = key === "b" ? "bold" : key === "i" ? "italic" : null;
    if (!kind) return;

    event.preventDefault();
    applyFormat(kind);
  };

  return (
    <div className="chapter-text-editor">
      <div className="chapter-text-toolbar">
        <button
          type="button"
          className="chapter-text-tool"
          // Mantiene la selección del texto al pulsar el botón.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat("bold")}
          disabled={previewing}
          aria-label="Negrita"
          title="Negrita (Ctrl+B)"
        >
          <strong aria-hidden="true">N</strong>
        </button>

        <button
          type="button"
          className="chapter-text-tool"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat("italic")}
          disabled={previewing}
          aria-label="Cursiva"
          title="Cursiva (Ctrl+I)"
        >
          <em aria-hidden="true">K</em>
        </button>

        <button
          type="button"
          className="chapter-text-preview-toggle"
          onClick={() => setPreviewing((current) => !current)}
          aria-pressed={previewing}
        >
          {previewing ? "Seguir escribiendo" : "Vista previa"}
        </button>
      </div>

      {/* El cuadro de texto se oculta en vez de quitarse: así conserva el
          cursor y el historial de deshacer al volver de la vista previa. */}
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        hidden={previewing}
      />

      {previewing && (
        <div className="chapter-text-preview" aria-label="Vista previa del capítulo">
          {value.trim() ? (
            value.split("\n").map((paragraph, index) => (
              <p key={index}>
                <FormattedText text={paragraph} />
              </p>
            ))
          ) : (
            <p className="chapter-text-preview-empty">
              Todavía no hay texto para mostrar.
            </p>
          )}
        </div>
      )}

      <p className="form-help">
        Para destacar, selecciona el texto y pulsa <strong>N</strong> (negrita)
        o <em>K</em> (cursiva). Verás asteriscos alrededor: así se guarda, y
        quienes lean lo verán destacado.
      </p>
    </div>
  );
}
