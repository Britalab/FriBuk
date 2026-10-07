// Textos de la moderación de contenido. Los valores coinciden con los que
// acepta el backend (backend/moderation.py), que es quien aplica las reglas.

export const REPORT_REASONS = [
  { value: "prohibited", label: "Contenido prohibido" },
  { value: "sexual", label: "Contenido sexual" },
  { value: "graphic_violence", label: "Violencia gráfica" },
  { value: "harassment", label: "Acoso" },
  { value: "spam", label: "Spam" },
  { value: "copyright", label: "Copyright" },
  { value: "other", label: "Otro" },
];

// Al retirar, el administrador puede usar además este motivo, que es el
// que queda registrado en los retiros automáticos.
export const REMOVAL_REASONS = [
  ...REPORT_REASONS,
  { value: "many_reports", label: "Alto número de reportes" },
];

export const REPORT_DETAILS_MAX_LENGTH = 300;
export const MODERATION_NOTE_MAX_LENGTH = 500;

export const CASE_STATUS_LABELS = {
  open: "Pendiente",
  removed: "Retirado",
  restored: "Restaurado",
  reviewed: "Revisado",
};

export const CASE_ACTION_LABELS = {
  removed: "Retirado",
  auto_removed: "Retirado automáticamente",
  restored: "Restaurado",
  reviewed: "Reportes revisados",
};

export const CASE_FILTERS = [
  { value: "open", label: "Pendientes" },
  { value: "removed", label: "Retirados" },
  { value: "all", label: "Todos" },
];

export function moderationErrorDetail(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

export function formatModerationDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
