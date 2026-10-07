import { useEffect, useId, useRef } from "react";
import "../../styles/moderation.css";

// Ventana de los formularios de moderación (reportar, retirar, restaurar).
// Se cierra con Escape, con el botón o tocando fuera.
export default function ModerationDialog({ title, onClose, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector("input, select, textarea, button");
    (firstField || dialog)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // El foco vuelve al botón que abrió la ventana.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className="moderation-dialog-layer">
      <button
        type="button"
        className="moderation-dialog-backdrop"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
      />

      <section
        className="moderation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="moderation-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="moderation-dialog-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}
