import { useId, useState } from "react";
import { apiErrorDetail, messageTextError } from "../../utils/messages";

// Cuadro para escribir un mensaje de solo texto. Lo usan los privados, los
// avisos de autor y sus respuestas. No tiene selector de emojis ni adjuntos:
// los emojis se escriben con el teclado, como cualquier otro carácter.
export default function MessageComposer({
  label,
  placeholder,
  submitLabel = "Enviar",
  maxLength,
  onSend,
  rows = 1,
  children,
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();
  const length = Array.from(value.trim()).length;
  const nearLimit = length > maxLength * 0.9;

  const submit = async () => {
    if (sending) return;

    const problem = messageTextError(value, maxLength);
    if (problem) {
      setError(problem);
      return;
    }

    setSending(true);
    setError("");

    try {
      await onSend(value.trim());
      setValue("");
    } catch (requestError) {
      setError(
        apiErrorDetail(requestError, "No se pudo enviar. Inténtalo nuevamente.")
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    // Con teclado físico, Enter envía y Mayús + Enter baja de línea. En el
    // teléfono Enter siempre baja de línea: se envía con el botón.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {children}

      <div className="message-composer-row">
        <label className="messages-visually-hidden" htmlFor={fieldId}>
          {label}
        </label>

        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength + 200}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
        />

        <button
          type="submit"
          className="messages-button is-primary"
          disabled={sending || !value.trim()}
        >
          {sending ? "Enviando..." : submitLabel}
        </button>
      </div>

      {(error || nearLimit) && (
        <div className="message-composer-status">
          {error && (
            <p id={`${fieldId}-error`} className="messages-error" role="alert">
              {error}
            </p>
          )}
          {nearLimit && (
            <span
              className={`message-composer-counter${length > maxLength ? " is-over" : ""}`}
              aria-live="polite"
            >
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
