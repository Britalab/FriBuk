// Utilidades para vincular comentarios con fragmentos del texto de un capítulo.
//
// El backend cuenta las posiciones en caracteres Unicode (code points) y el
// navegador en unidades UTF-16: un emoji ocupa 1 en el backend y 2 aquí.
// Estas funciones convierten entre ambas formas.

const SURROGATES = /[\uD800-\uDFFF]/;
const WHITESPACE = /\s/;
const MAX_PARAGRAPHS_PER_SELECTION = 50;

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

// Divide un párrafo en trozos marcados y sin marcar. Los rangos llegan en
// caracteres Unicode y pueden solaparse.
export function splitByRanges(text, ranges) {
  const sorted = ranges
    .map((range) => [
      toUtf16Offset(text, range.start),
      toUtf16Offset(text, range.end),
    ])
    .filter(([start, end]) => start >= 0 && end > start && end <= text.length)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const pieces = [];
  let position = 0;
  for (const [start, end] of merged) {
    if (start > position) {
      pieces.push({ text: text.slice(position, start), marked: false });
    }
    pieces.push({ text: text.slice(start, end), marked: true });
    position = end;
  }
  if (position < text.length) {
    pieces.push({ text: text.slice(position), marked: false });
  }

  return pieces;
}

function offsetWithin(element, node, offset) {
  const probe = document.createRange();
  probe.selectNodeContents(element);
  probe.setEnd(node, offset);
  return probe.toString().length;
}

function anchorInParagraph(element, range) {
  const text = element.textContent || "";
  let start = element.contains(range.startContainer)
    ? offsetWithin(element, range.startContainer, range.startOffset)
    : 0;
  let end = element.contains(range.endContainer)
    ? offsetWithin(element, range.endContainer, range.endOffset)
    : text.length;

  while (start < end && WHITESPACE.test(text[start])) start += 1;
  while (end > start && WHITESPACE.test(text[end - 1])) end -= 1;

  if (start >= end) return null;

  return {
    paragraphIndex: Number(element.dataset.paragraphIndex),
    startOffset: toCodePointOffset(text, start),
    endOffset: toCodePointOffset(text, end),
    quote: text.slice(start, end),
  };
}

// Fin de frase: la puntuación de cierre y las comillas o paréntesis que la sigan.
const SENTENCE_END = /[.!?…]+["'»”’)\]]*(?=\s|$)/g;

function caretFromPoint(x, y) {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  return null;
}

// Anclaje de la frase que está bajo un punto de la pantalla, dentro de un
// párrafo. Se usa al tocar el texto en un teléfono, donde seleccionar con
// precisión es incómodo. Una frase más larga que `maxLength` se recorta.
export function readSentenceAnchor(element, x, y, maxLength) {
  const caret = caretFromPoint(x, y);
  if (!caret || !element.contains(caret.node)) return null;

  const text = element.textContent || "";
  // Un toque al final del párrafo cuenta como su última frase.
  const position = Math.min(
    offsetWithin(element, caret.node, caret.offset),
    text.trimEnd().length - 1
  );

  let start = 0;
  let end = text.length;
  for (const match of text.matchAll(SENTENCE_END)) {
    const sentenceEnd = match.index + match[0].length;
    if (position < sentenceEnd) {
      end = sentenceEnd;
      break;
    }
    start = sentenceEnd;
  }

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
    paragraphIndex: Number(element.dataset.paragraphIndex),
    startOffset: toCodePointOffset(text, start),
    endOffset: toCodePointOffset(text, end),
    quote,
  };
}

// Lee la selección actual del navegador y la convierte en un anclaje.
// Un comentario pertenece a un solo párrafo: si la selección abarca varios,
// se usa la parte que cae en el primero que tenga texto seleccionado.
export function readSelectionAnchor(container) {
  const selection = window.getSelection ? window.getSelection() : null;

  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!range.intersectsNode(container)) return null;

  const startNode = range.startContainer;
  const startElement = startNode.nodeType === 1 ? startNode : startNode.parentElement;
  let element = startElement ? startElement.closest("[data-paragraph-index]") : null;

  if (!element || !container.contains(element)) {
    element = Array.from(
      container.querySelectorAll("[data-paragraph-index]")
    ).find((candidate) => range.intersectsNode(candidate));
  }

  for (
    let checked = 0;
    element && checked < MAX_PARAGRAPHS_PER_SELECTION;
    checked += 1
  ) {
    if (!range.intersectsNode(element)) return null;

    const anchor = anchorInParagraph(element, range);
    if (anchor) {
      return { ...anchor, rect: range.getBoundingClientRect() };
    }

    const nextIndex = Number(element.dataset.paragraphIndex) + 1;
    element = container.querySelector(`[data-paragraph-index="${nextIndex}"]`);
  }

  return null;
}
