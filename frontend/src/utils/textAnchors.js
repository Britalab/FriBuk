// Utilidades para vincular comentarios con el texto de un capítulo.
//
// El backend cuenta las posiciones en caracteres Unicode (code points) y el
// navegador en unidades UTF-16: un emoji ocupa 1 en el backend y 2 aquí.
// Estas funciones convierten entre ambas formas.

const SURROGATES = /[\uD800-\uDFFF]/;
const WHITESPACE = /\s/;

export function toCodePointOffset(text, utf16Offset) {
  const head = text.slice(0, utf16Offset);
  return SURROGATES.test(head) ? Array.from(head).length : utf16Offset;
}

export function toUtf16Offset(text, codePointOffset) {
  if (!SURROGATES.test(text)) return codePointOffset;
  return Array.from(text).slice(0, codePointOffset).join("").length;
}

// Verdadero si el comentario sigue apuntando al texto que cita.
export function anchorMatchesText(text, comment) {
  if (
    typeof text !== "string" ||
    !Number.isInteger(comment.start_offset) ||
    !Number.isInteger(comment.end_offset)
  ) {
    return false;
  }

  const start = toUtf16Offset(text, comment.start_offset);
  const end = toUtf16Offset(text, comment.end_offset);
  return end > start && text.slice(start, end) === comment.quote;
}

// Anclaje de un párrafo completo: se comenta por párrafo, no por palabra.
// La cita guardada tiene un largo máximo, así que de un párrafo más largo
// se cita el comienzo. Devuelve null para un párrafo vacío.
export function paragraphAnchor(text, paragraphIndex, maxLength) {
  if (typeof text !== "string") return null;

  let start = 0;
  let end = text.length;
  while (start < end && WHITESPACE.test(text[start])) start += 1;
  while (end > start && WHITESPACE.test(text[end - 1])) end -= 1;

  if (start >= end) return null;

  let quote = text.slice(start, end);
  const characters = Array.from(quote);
  if (characters.length > maxLength) {
    quote = characters.slice(0, maxLength).join("");
    // Se corta en el último espacio para no partir una palabra.
    const lastSpace = quote.search(/\s\S*$/);
    if (lastSpace > 0) quote = quote.slice(0, lastSpace);
    quote = quote.trimEnd();
    end = start + quote.length;
  }

  return {
    paragraphIndex,
    startOffset: toCodePointOffset(text, start),
    endOffset: toCodePointOffset(text, end),
    quote,
  };
}
