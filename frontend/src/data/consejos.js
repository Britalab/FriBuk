// Consejos para escribir, de tía FriBuk (/consejos).
//
// Los consejos están en la base de datos (tabla writing_tips, ver
// backend/tips.py) y los edita la cuenta admin desde el sitio
// (/consejos/nuevo y /consejos/editar/<slug>). Aquí va lo que comparten
// las páginas: la firma, las poses de tía FriBuk y cómo mostrar fechas,
// números y direcciones.
//
// El texto de cada sección usa el formato del editor de capítulos
// (ver utils/richText.js). La voz es la de tía FriBuk: sabia, mordaz,
// exigente y cariñosa a su manera; unas 600 palabras por consejo, con
// subtítulos en forma de pregunta. El cierre «En resumen» es opcional:
// depende del tema.

export const TIPS_AUTHOR = "tía FriBuk";

// Poses de tía FriBuk, en public/tia-fribuk/ (las mismas que acepta el
// backend). Para cambiar una imagen basta con reemplazar su archivo (WebP
// con fondo transparente).
export const TIP_POSES = [
  { id: "retrato", label: "Retrato" },
  { id: "sonrie", label: "Sonríe" },
  { id: "pensativa", label: "Pensativa" },
  { id: "explica", label: "Explica" },
  { id: "senala", label: "Señala" },
  { id: "brazos-cruzados", label: "Brazos cruzados" },
  { id: "completa", label: "Cuerpo entero" },
];

// Largo recomendado de la descripción para Google (más se corta).
export const TIP_DESCRIPTION_RECOMMENDED = 160;

export function tipImage(pose) {
  return `/tia-fribuk/tia-fribuk-${pose}.webp`;
}

// Número que se muestra en la tarjeta: 01, 02...
export function tipNumber(position) {
  return String(position ?? 0).padStart(2, "0");
}

// Dirección a partir del título: «¿Cómo crear un personaje?» →
// «como-crear-un-personaje». Las tildes se quitan (\p{M} son sus marcas).
export function slugify(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");
}

// La fecha se guarda como AAAA-MM-DD: se lee como día local, no como
// medianoche UTC (que en América ya es el día anterior).
export function formatTipDate(date) {
  if (!date) return "";
  const [year, month, day] = String(date).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
