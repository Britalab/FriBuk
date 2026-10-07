// Catálogo de «Mi espacio»: temas, colores de acento, emojis y fondos.
// El backend valida contra los mismos identificadores (backend/profile_catalog.py);
// si se agrega o quita algo aquí, hay que reflejarlo allí y en styles/profile-themes.css.

export const MAX_EMOJI_DECORATIONS = 3;
export const MAX_AMBIENT_DECORATIONS = 1;
export const DEFAULT_THEME_ID = "fribuk";

// surface: "auto" sigue el modo claro/oscuro del sitio; "light" y "dark" son fijos.
// accents: colores de acento que mantienen un contraste legible con ese tema.
export const THEMES = [
  {"id": "fribuk", "name": "FriBuk", "surface": "auto", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "gotico", "name": "Gótico", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "fantasia", "name": "Fantasía", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "minimalista", "name": "Minimalista", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "naturaleza", "name": "Naturaleza", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "romance", "name": "Romance", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "espacial", "name": "Espacial", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "vintage", "name": "Vintage", "surface": "light", "accents": ["rojo", "ambar", "lima", "verde", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "comics", "name": "Cómics", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "cyberpunk", "name": "Cyberpunk", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "dark-academia", "name": "Dark Academia", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "y2k", "name": "Y2K", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "cottagecore", "name": "Cottagecore", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "art-deco", "name": "Art déco", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "retro", "name": "Retro", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "kawaii", "name": "Kawaii", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "horror", "name": "Horror", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "steampunk", "name": "Steampunk", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "urbano", "name": "Urbano", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "neon", "name": "Neon / Synthwave", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "fairycore", "name": "Fairycore", "surface": "light", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
  {"id": "noir", "name": "Misterio / Noir", "surface": "dark", "accents": ["rojo", "naranja", "ambar", "lima", "verde", "turquesa", "cielo", "azul", "violeta", "magenta", "rosa", "grafito"]},
];

export const ACCENTS = [
  {"id": "rojo", "name": "Rojo"},
  {"id": "naranja", "name": "Naranja"},
  {"id": "ambar", "name": "Ámbar"},
  {"id": "lima", "name": "Lima"},
  {"id": "verde", "name": "Verde"},
  {"id": "turquesa", "name": "Turquesa"},
  {"id": "cielo", "name": "Cielo"},
  {"id": "azul", "name": "Azul"},
  {"id": "violeta", "name": "Violeta"},
  {"id": "magenta", "name": "Magenta"},
  {"id": "rosa", "name": "Rosa"},
  {"id": "grafito", "name": "Grafito"},
];

// Emojis de OpenMoji (https://openmoji.org, licencia CC BY-SA 4.0). El id es
// el código del emoji y también el nombre de su archivo en public/openmoji/.
export const EMOJI_CATEGORIES = [
  {"id": "corazones", "name": "Corazones y brillo"},
  {"id": "cielo", "name": "Cielo"},
  {"id": "naturaleza", "name": "Naturaleza"},
  {"id": "animales", "name": "Animales"},
  {"id": "fantasia", "name": "Fantasía"},
  {"id": "oscuro", "name": "Oscuro"},
  {"id": "lectura", "name": "Lectura y ocio"},
];

export const EMOJIS = [
  {"id": "2764", "name": "Corazón rojo", "category": "corazones"},
  {"id": "1F5A4", "name": "Corazón negro", "category": "corazones"},
  {"id": "1F49C", "name": "Corazón morado", "category": "corazones"},
  {"id": "1F495", "name": "Dos corazones", "category": "corazones"},
  {"id": "1F494", "name": "Corazón roto", "category": "corazones"},
  {"id": "2728", "name": "Brillos", "category": "corazones"},
  {"id": "1F31F", "name": "Estrella brillante", "category": "corazones"},
  {"id": "1F525", "name": "Fuego", "category": "corazones"},
  {"id": "1F308", "name": "Arcoíris", "category": "corazones"},
  {"id": "1F319", "name": "Luna", "category": "cielo"},
  {"id": "2B50", "name": "Estrella", "category": "cielo"},
  {"id": "2600", "name": "Sol", "category": "cielo"},
  {"id": "26A1", "name": "Rayo", "category": "cielo"},
  {"id": "2744", "name": "Copo de nieve", "category": "cielo"},
  {"id": "1FA90", "name": "Planeta", "category": "cielo"},
  {"id": "1F98B", "name": "Mariposa", "category": "naturaleza"},
  {"id": "1F338", "name": "Flor de cerezo", "category": "naturaleza"},
  {"id": "1F339", "name": "Rosa", "category": "naturaleza"},
  {"id": "1F33B", "name": "Girasol", "category": "naturaleza"},
  {"id": "1F340", "name": "Trébol", "category": "naturaleza"},
  {"id": "1F344", "name": "Hongo", "category": "naturaleza"},
  {"id": "1F342", "name": "Hojas de otoño", "category": "naturaleza"},
  {"id": "1F431", "name": "Gato", "category": "animales"},
  {"id": "1F408-200D-2B1B", "name": "Gato negro", "category": "animales"},
  {"id": "1F43A", "name": "Lobo", "category": "animales"},
  {"id": "1F98A", "name": "Zorro", "category": "animales"},
  {"id": "1F430", "name": "Conejo", "category": "animales"},
  {"id": "1F989", "name": "Búho", "category": "animales"},
  {"id": "1F40D", "name": "Serpiente", "category": "animales"},
  {"id": "1F409", "name": "Dragón", "category": "fantasia"},
  {"id": "1F984", "name": "Unicornio", "category": "fantasia"},
  {"id": "1F9DA", "name": "Hada", "category": "fantasia"},
  {"id": "1F52E", "name": "Bola de cristal", "category": "fantasia"},
  {"id": "1F451", "name": "Corona", "category": "fantasia"},
  {"id": "2694", "name": "Espadas", "category": "fantasia"},
  {"id": "1F3F0", "name": "Castillo", "category": "fantasia"},
  {"id": "1FA84", "name": "Varita mágica", "category": "fantasia"},
  {"id": "1F480", "name": "Calavera", "category": "oscuro"},
  {"id": "1F47B", "name": "Fantasma", "category": "oscuro"},
  {"id": "1F987", "name": "Murciélago", "category": "oscuro"},
  {"id": "1F577", "name": "Araña", "category": "oscuro"},
  {"id": "1F56F", "name": "Vela", "category": "oscuro"},
  {"id": "1F4DA", "name": "Libros", "category": "lectura"},
  {"id": "1F4D6", "name": "Libro abierto", "category": "lectura"},
  {"id": "1F58B", "name": "Pluma", "category": "lectura"},
  {"id": "2615", "name": "Café", "category": "lectura"},
  {"id": "1F3A7", "name": "Audífonos", "category": "lectura"},
  {"id": "1F3A8", "name": "Paleta de arte", "category": "lectura"},
  {"id": "1F3AE", "name": "Videojuegos", "category": "lectura"},
  {"id": "1F353", "name": "Fresa", "category": "lectura"},
];

// Fondos sutiles de la página del perfil (solo 1 a la vez).
export const AMBIENTS = [
  {"id": "lluvia", "name": "Lluvia"},
  {"id": "nieve", "name": "Nieve"},
  {"id": "olas", "name": "Olas"},
  {"id": "telaranas", "name": "Telarañas"},
  {"id": "vhs", "name": "VHS"},
  {"id": "digital", "name": "Digital"},
];

// Opción que muestra los emojis elegidos también como pegatinas en la cabecera.
export const STICKERS_ID = "pegatinas";

const THEMES_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));
const EMOJIS_BY_ID = new Map(EMOJIS.map((item) => [item.id, item]));
const AMBIENT_IDS = new Set(AMBIENTS.map((item) => item.id));

export function getTheme(themeId) {
  return THEMES_BY_ID.get(themeId) || THEMES_BY_ID.get(DEFAULT_THEME_ID);
}

export function getEmoji(emojiId) {
  return EMOJIS_BY_ID.get(emojiId) || null;
}

export function emojiUrl(emojiId) {
  return `/openmoji/${emojiId}.svg`;
}

export function isAmbient(decorationId) {
  return AMBIENT_IDS.has(decorationId);
}

export function emptyCustomization() {
  return { theme: DEFAULT_THEME_ID, decorations: [], colors: {} };
}

// Devuelve siempre una configuración válida, descartando lo que no esté en el catálogo.
// `decorations` guarda juntos los emojis (en el orden elegido), el fondo y la
// opción de pegatinas.
export function normalizeCustomization(customization) {
  const theme = getTheme(customization?.theme);
  const decorations = [];
  let emojis = 0;
  let ambients = 0;

  for (const id of Array.isArray(customization?.decorations) ? customization.decorations : []) {
    if (decorations.includes(id)) continue;
    if (isAmbient(id)) {
      if (ambients >= MAX_AMBIENT_DECORATIONS) continue;
      ambients += 1;
    } else if (getEmoji(id)) {
      if (emojis >= MAX_EMOJI_DECORATIONS) continue;
      emojis += 1;
    } else if (id !== STICKERS_ID) {
      continue;
    }
    decorations.push(id);
  }

  const accent = customization?.colors?.accent;
  return {
    theme: theme.id,
    decorations,
    colors: theme.accents.includes(accent) ? { accent } : {},
  };
}
