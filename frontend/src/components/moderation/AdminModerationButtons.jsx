import { useCallback, useState } from "react";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import ModerationDialog from "./ModerationDialog";
import {
  MODERATION_NOTE_MAX_LENGTH,
  REMOVAL_REASONS,
  moderationErrorDetail,
} from "../../utils/moderation";

// Acciones de moderación que solo ve un administrador. Ocultarlas no es la
// protección: el backend comprueba el permiso en cada llamada.

export function RemoveButton({ targetType, targetId, label = "Retirar", onRemoved }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(() => setOpen(false), []);

  if (!user?.is_admin) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!reason) {
      setError("Elige el motivo del retiro.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await api.post("/moderation/remove", {
        target_type: targetType,
        target_id: targetId,
        reason,
        note: note.trim() || null,
      });
      setOpen(false);
      showToast("Contenido retirado. Puedes restaurarlo desde el panel.");
      onRemoved?.(response.data.case);
    } catch (requestError) {
      setError(moderationErrorDetail(requestError, "No se pudo retirar el contenido."));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="moderation-admin-button"
        onClick={() => {
          setReason("");
          setNote("");
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </button>

      {open && (
        <ModerationDialog title="Retirar contenido" onClose={close}>
          <form className="moderation-form" onSubmit={handleSubmit}>
            <label className="moderation-field">
              <span>Motivo del retiro</span>
              <select
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError("");
                }}
              >
                <option value="">Elige un motivo</option>
                {REMOVAL_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="moderation-field">
              <span>Nota interna (opcional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={MODERATION_NOTE_MAX_LENGTH}
              />
            </label>

            <p className="moderation-hint">
              El contenido deja de mostrarse, pero se conserva para revisión y
              se puede restaurar. Quien lo publicó verá el motivo general, no
              la nota.
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
                {sending ? "Retirando..." : "Retirar"}
              </button>
            </div>
          </form>
        </ModerationDialog>
      )}
    </>
  );
}

export function RestoreButton({ caseId, label = "Restaurar", onRestored }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const close = useCallback(() => setOpen(false), []);

  if (!user?.is_admin || !caseId) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");

    try {
      const response = await api.post(`/moderation/cases/${caseId}/restore`, {
        note: note.trim() || null,
      });
      setOpen(false);
      showToast("Contenido restaurado.");
      onRestored?.(response.data.case);
    } catch (requestError) {
      setError(moderationErrorDetail(requestError, "No se pudo restaurar el contenido."));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="moderation-admin-button"
        onClick={() => {
          setNote("");
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </button>

      {open && (
        <ModerationDialog title="Restaurar contenido" onClose={close}>
          <form className="moderation-form" onSubmit={handleSubmit}>
            <p className="moderation-hint">
              El contenido volverá a mostrarse. El historial de reportes se
              conserva, pero los reportes anteriores dejan de contar: solo
              reportes nuevos podrían retirarlo otra vez.
            </p>

            <label className="moderation-field">
              <span>Motivo de la restauración (opcional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={MODERATION_NOTE_MAX_LENGTH}
              />
            </label>

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
                {sending ? "Restaurando..." : "Restaurar"}
              </button>
            </div>
          </form>
        </ModerationDialog>
      )}
    </>
  );
}
