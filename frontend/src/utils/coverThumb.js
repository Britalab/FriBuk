// Miniatura de una portada: la misma dirección con «-thumb.jpg» en lugar de
// la extensión (el backend la guarda así al subir la portada). Las tarjetas
// muestran la portada chica, así que la miniatura pesa unas 4 veces menos.
// Las imágenes que no son portadas subidas a FriBuk se dejan igual.
const COVERS_PATH = "/storage/v1/object/public/story-covers/";

export function coverThumbUrl(url) {
  if (!url || !url.includes(COVERS_PATH)) return url;

  const path = url.split("?")[0];
  const nameStart = path.lastIndexOf("/") + 1;
  const dot = path.lastIndexOf(".");
  const stem = dot > nameStart ? path.slice(0, dot) : path;
  return `${stem}-thumb.jpg`;
}
