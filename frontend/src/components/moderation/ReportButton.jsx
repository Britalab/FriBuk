import { useCallback, useState } from "react";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import ModerationDialog from "./ModerationDialog";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  moderationErrorDetail,
} from "../../utils/moderation";

// Botón "Reportar" para un contenido: abre un formulario con el motivo.
// Sirve para temas y respuestas del foro y para imágenes (foto de perfil,
// banner y portada). El backend impide reportar dos veces lo mismo.
export default function ReportButton({ targetType, targetId, label = "Reportar" }) {
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

    setSending(true);
    setError("");

    try {
      const response = await api.post("/moderation/reports", {
        target_type: targetType,
        target_id: targetId,
        reason,
        details: reason === "other" ? details.trim() || null : null,
      });
      setReported(true);
      setOpen(false);
      showToast(response.data.message || "Recibimos tu reporte.");
    } catch (requestError) {
      if (requestError?.response?.status === 409) {
        // Ya lo había reportado: no hace falta volver a hacerlo.
        setReported(true);
        setOpen(false);
        showToast("Ya habías reportado este contenido.");
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
        <ModerationDialog title="Reportar contenido" onClose={close}>
          <form className="moderation-form" onSubmit={handleSubmit}>
            <fieldset className="moderation-reasons">
              <legend>¿Por qué lo reportas?</legend>

              {REPORT_REASONS.map((option) => (
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

            {reason === "other" && (
              <label className="moderation-field">
                <span>Cuéntanos brevemente qué ocurre</span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={3}
                  maxLength={REPORT_DETAILS_MAX_LENGTH}
                  placeholder="Opcional"
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
