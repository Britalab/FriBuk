// Advertencias de contenido que un autor puede marcar en su historia.
// Son solo un aviso para el lector: no bloquean ni filtran historias.
// Los valores coinciden con los que acepta el backend y la base de datos.
export const CONTENT_WARNING_GROUPS = [
  {
    title: "Violencia",
    warnings: [
      { value: "graphic_violence", label: "Violencia gráfica o gore" },
      { value: "domestic_abuse", label: "Abuso y violencia doméstica" },
      { value: "torture_kidnapping", label: "Tortura o secuestro" },
    ],
  },
  {
    title: "Contenido sexual",
    warnings: [
      { value: "explicit_sex", label: "Contenido sexual explícito" },
      { value: "sexual_violence", label: "Violencia sexual" },
    ],
  },
  {
    title: "Salud mental",
    warnings: [
      { value: "suicide_self_harm", label: "Suicidio y autolesión" },
      { value: "eating_disorders", label: "Trastornos alimentarios" },
    ],
  },
  {
    title: "Sustancias",
    warnings: [{ value: "drugs_addiction", label: "Drogas y adicciones" }],
  },
  {
    title: "Otros",
    warnings: [
      { value: "animal_harm", label: "Muerte o maltrato animal" },
      { value: "discrimination", label: "Discriminación y discurso de odio" },
      { value: "pregnancy_child_loss", label: "Pérdida gestacional o infantil" },
      { value: "strong_language", label: "Lenguaje fuerte" },
    ],
  },
];

// Advertencias de la primera versión. Ya no se ofrecen al crear una
// historia, pero las historias que las tenían las conservan y las muestran.
export const LEGACY_CONTENT_WARNINGS = [
  { value: "violence", label: "Violencia" },
  { value: "sensitive_topics", label: "Temas sensibles" },
];

// Todas, en el orden en que se muestran.
export const CONTENT_WARNINGS = [
  ...CONTENT_WARNING_GROUPS.flatMap((group) => group.warnings),
  ...LEGACY_CONTENT_WARNINGS,
];

// Grupos para el formulario. Una advertencia antigua solo aparece si la
// historia ya la tenía marcada, para que su autora pueda quitarla.
export function contentWarningGroups(selected) {
  const values = Array.isArray(selected) ? selected : [];
  const legacy = LEGACY_CONTENT_WARNINGS.filter(({ value }) => values.includes(value));

  return legacy.length > 0
    ? [...CONTENT_WARNING_GROUPS, { title: "Anteriores", warnings: legacy }]
    : CONTENT_WARNING_GROUPS;
}

// Nombres de las advertencias guardadas, en el orden de la lista.
export function contentWarningLabels(values) {
  if (!Array.isArray(values)) return [];

  return CONTENT_WARNINGS.filter(({ value }) => values.includes(value)).map(
    ({ label }) => label
  );
}
