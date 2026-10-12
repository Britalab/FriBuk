import { useCallback, useEffect, useRef, useState } from "react";
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

// Formulario para reportar: pide el motivo y lo envía. Sirve para temas y
// respuestas del foro, para imágenes (foto de perfil, banner y portada) y
// para una persona (targetType "user"), que tiene sus propios motivos y
// siempre pide una explicación. El backend impide reportar dos veces lo mismo.
export function ReportDialog({ targetType, targetId, onClose, onReported }) {
  const { showToast } = useToast();
  const isUser = targetType === "user";
  const reasons = isUser ? USER_REPORT_REASONS : REPORT_REASONS;
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

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
      showToast(response.data.message || "Recibimos tu reporte.");
      onReported();
    } catch (requestError) {
      if (requestError?.response?.status === 409) {
        // Ya lo había reportado: no hace falta volver a hacerlo.
        showToast(
          isUser
            ? "Ya habías reportado a esta persona."
            : "Ya habías reportado este contenido."
        );
        onReported();
      } else {
        setError(moderationErrorDetail(requestError, "No se pudo enviar el reporte."));
        setSending(false);
      }
    }
  };

  return (
    <ModerationDialog
      title={isUser ? "Reportar usuario" : "Reportar contenido"}
      onClose={onClose}
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
            onClick={onClose}
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
  );
}

// Botón "Reportar" para un solo contenido.
export default function ReportButton({ targetType, targetId, label = "Reportar" }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  const handleOpen = () => {
    if (!user) {
      showToast("Inicia sesión para reportar contenido.", "error");
      return;
    }
    setOpen(true);
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
        <ReportDialog
          targetType={targetType}
          targetId={targetId}
          onClose={close}
          onReported={() => {
            setReported(true);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

// Un solo botón "Reportar" que despliega qué se quiere reportar. Se usa en
// el perfil público, donde hay varias cosas reportables y tres botones
// ocupaban demasiado en el teléfono.
// `options`: [{ targetType, label }], todas sobre el mismo `targetId`.
export function ReportMenu({ targetId, options }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reported, setReported] = useState([]);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  const closeDialog = useCallback(() => setSelected(null), []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    if (!user) {
      showToast("Inicia sesión para reportar contenido.", "error");
      return;
    }
    setMenuOpen((current) => !current);
  };

  return (
    <div className="moderation-report-menu" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className="moderation-report-button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span aria-hidden="true">⚑</span>
        Reportar
        <span aria-hidden="true">▾</span>
      </button>

      {menuOpen && (
        <div className="moderation-report-options" role="menu" aria-label="¿Qué quieres reportar?">
          {options.map((option) => {
            const done = reported.includes(option.targetType);

            return (
              <button
                key={option.targetType}
                type="button"
                role="menuitem"
                disabled={done}
                onClick={() => {
                  setMenuOpen(false);
                  setSelected(option.targetType);
                }}
              >
                {option.label}
                {done && <span> · reportado</span>}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ReportDialog
          // Cada tipo empieza con su formulario vacío.
          key={selected}
          targetType={selected}
          targetId={targetId}
          onClose={closeDialog}
          onReported={() => {
            setReported((current) => [...current, selected]);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
