import { useCallback, useState } from "react";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import ModerationDialog from "./ModerationDialog";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  USER_REPORT_DETAILS_MIN_LENGTH,
  USER_REPORT_REASONS,
  moderationErrorDetail,
} from "../../utils/moderation";

// Botón "Reportar": abre un formulario con el motivo. Sirve para temas y
// respuestas del foro, para imágenes (foto de perfil, banner y portada) y
// para una persona (targetType "user"), que tiene sus propios motivos y
// siempre pide una explicación. El backend impide reportar dos veces lo mismo.
export default function ReportButton({ targetType, targetId, label = "Reportar" }) {
  const isUser = targetType === "user";
  const reasons = isUser ? USER_REPORT_REASONS : REPORT_REASONS;
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(() => setOpen(false), []);

  const handleOpen = () => {
    if (!user) {
      showToast("Inicia sesión para reportar contenido.", "error");
      return;
    }
    setReason("");
    setDetails("");
    setError("");
    setOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!reason) {
      setError("Elige un motivo.");
      return;
    }

    if (isUser && details.trim().length < USER_REPORT_DETAILS_MIN_LENGTH) {
      setError("Cuéntanos qué ocurrió, con algo más de detalle.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await api.post("/moderation/reports", {
        target_type: targetType,
        target_id: targetId,
        reason,
        details: isUser || reason === "other" ? details.trim() || null : null,
      });
      setReported(true);
      setOpen(false);
      showToast(response.data.message || "Recibimos tu reporte.");
    } catch (requestError) {
      if (requestError?.response?.status === 409) {
        // Ya lo había reportado: no hace falta volver a hacerlo.
        setReported(true);
        setOpen(false);
        showToast(
          isUser
            ? "Ya habías reportado a esta persona."
            : "Ya habías reportado este contenido."
        );
      } else {
        setError(moderationErrorDetail(requestError, "No se pudo enviar el reporte."));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="moderation-report-button"
        onClick={handleOpen}
        disabled={reported}
      >
        <span aria-hidden="true">⚑</span>
        {reported ? "Reportado" : label}
      </button>

      {open && (
        <ModerationDialog
          title={isUser ? "Reportar usuario" : "Reportar contenido"}
          onClose={close}
        >
          <form className="moderation-form" onSubmit={handleSubmit}>
            <fieldset className="moderation-reasons">
              <legend>
                {isUser ? "¿Por qué reportas a esta persona?" : "¿Por qué lo reportas?"}
              </legend>

              {reasons.map((option) => (
                <label
                  key={option.value}
                  className={`moderation-reason${
                    reason === option.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => {
                      setReason(option.value);
                      setError("");
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            {(isUser || reason === "other") && (
              <label className="moderation-field">
                <span>
                  {isUser
                    ? "Cuéntanos qué ocurrió y dónde (obligatorio)"
                    : "Cuéntanos brevemente qué ocurre"}
                </span>
                <textarea
                  value={details}
                  onChange={(event) => {
                    setDetails(event.target.value);
                    setError("");
                  }}
                  rows={3}
                  maxLength={REPORT_DETAILS_MAX_LENGTH}
                  placeholder={
                    isUser
                      ? "Por ejemplo: en qué historia, tema del foro o mensaje pasó."
                      : "Opcional"
                  }
                />
              </label>
            )}

            <p className="moderation-hint">
              El equipo de FriBuk revisará el reporte. Nadie más sabrá que lo
              enviaste.
            </p>

            {error && <p className="moderation-error" role="alert">{error}</p>}

            <div className="moderation-form-actions">
              <button
                type="button"
                className="moderation-button"
                onClick={close}
                disabled={sending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="moderation-button is-primary"
                disabled={sending}
              >
                {sending ? "Enviando..." : "Enviar reporte"}
              </button>
            </div>
          </form>
        </ModerationDialog>
      )}
    </>
  );
}
