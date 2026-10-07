// Advertencias de contenido que un autor puede marcar en su historia.
// Son solo un aviso para el lector. Los valores coinciden con los que
// acepta el backend.
export const CONTENT_WARNINGS = [
  { value: "violence", label: "Violencia" },
  { value: "strong_language", label: "Lenguaje fuerte" },
  { value: "sensitive_topics", label: "Temas sensibles" },
];

// Nombres de las advertencias guardadas, en el orden de la lista.
export function contentWarningLabels(values) {
  if (!Array.isArray(values)) return [];

  return CONTENT_WARNINGS.filter(({ value }) => values.includes(value)).map(
    ({ label }) => label
  );
}
