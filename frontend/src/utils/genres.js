// Géneros de FriBuk. Es una sola lista para todo el sitio: la que se elige
// al crear o editar una historia y la que filtra el inicio. Así el género de
// una historia siempre coincide con alguno de los filtros.
//
// Los primeros son los que el inicio muestra como botones; el resto queda
// bajo «Más».
export const GENRES = [
  "Romance",
  "Fantasía",
  "Romantasy",
  "Ciencia ficción",
  "Misterio",
  "Thriller",
  "Policial",
  "Terror",
  "Suspenso",
  "Acción",
  "Aventura",
  "Drama",
  "Comedia",
  "Distopía",
  "Ficción contemporánea",
  "Histórico",
  "Juvenil",
  "New Adult",
  "Realista",
  "Realismo mágico",
  "Paranormal",
  "Sobrenatural",
  "Vampiros",
  "Hombres lobo",
  "Mitología",
  "Fantasía urbana",
  "Fantasía oscura",
  "Postapocalíptica",
  "Cyberpunk",
  "Steampunk",
  "LGBTIQ+",
  "Omegaverse",
  "Fanfiction",
  "Poesía",
  "Cuento",
  "Fábula",
  "Infantil",
  "Slice of Life",
  "No ficción",
  "Otro",
];

// Opciones para el selector de una historia. Si la historia ya tenía un
// género escrito a mano que no está en la lista, se conserva como opción
// para que editarla no lo borre.
export function genreOptions(currentGenre) {
  const current = (currentGenre || "").trim();
  const known = GENRES.some(
    (genre) => genre.toLowerCase() === current.toLowerCase()
  );

  return current && !known ? [current, ...GENRES] : GENRES;
}
