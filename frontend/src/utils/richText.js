// Formato del texto de los capítulos y de las descripciones de historias.
//
// Se escribe con un editor visual (components/story/RichTextEditor.jsx),
// pero se guarda como texto simple, una línea por párrafo, con marcas:
//
//     *cursiva*     **negrita**     ***negrita y cursiva***     __subrayado__
//
// Las marcas deben tocar el texto que rodean y cerrarse en el mismo párrafo.
// Cualquier otro asterisco se muestra tal cual: un separador de escena
// (***), una nota al pie (*) o una multiplicación (2 * 3). El subrayado
// envuelve a las otras: __**así**__.
//
// Al inicio de la línea pueden ir, en este orden, la alineación y la lista:
//
//     [centro] [derecha] [justificado]      [•] viñeta     [#] numerada
//
// por ejemplo «[centro][#]Primer punto». Sin marca, el párrafo va a la
// izquierda. Las líneas [#] seguidas forman una lista: se numeran solas.
//
// Así los capítulos antiguos siguen igual y los comentarios, que se anclan
// a cada párrafo (cada línea), no se mueven.

// Separador invisible entre dos trozos con formatos distintos que se tocan
// (**uno***dos* sería ambiguo; con él no). No se muestra nunca.
export const WORD_JOINER = "\u2060";

const MARKED = /(\*{1,3})(?=[^\s*])([^*\n]*?[^\s*])\1(?!\*)/g;
const UNDERLINED = /(?<![\p{L}\p{N}_])__(?=[^\s_])([^\n]*?[^\s_])__(?![\p{L}\p{N}_])/gu;
const BLOCK_PREFIX = /^(?:\[(centro|derecha|justificado)\])?(?:\[(•|#)\])?/;

export const ALIGN_MARKS = { center: "centro", right: "derecha", justify: "justificado" };
const ALIGN_BY_MARK = Object.fromEntries(
  Object.entries(ALIGN_MARKS).map(([align, mark]) => [mark, align])
);
export const LIST_MARKS = { bullet: "•", ordered: "#" };

const sameFormat = (a, b) =>
  a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;

function parseEmphasis(source, underline, segments) {
  const push = (segment) => {
    segment.text = segment.text.replaceAll(WORD_JOINER, "");
    if (!segment.text) return;
    const last = segments[segments.length - 1];
    if (last && sameFormat(last, segment)) {
      last.text += segment.text;
    } else {
      segments.push(segment);
    }
  };

  let position = 0;
  for (const match of source.matchAll(MARKED)) {
    push({ text: source.slice(position, match.index), bold: false, italic: false, underline });
    push({
      text: match[2],
      bold: match[1].length >= 2,
      italic: match[1].length !== 2,
      underline,
    });
    position = match.index + match[0].length;
  }
  push({ text: source.slice(position), bold: false, italic: false, underline });
}

// Divide un párrafo en trozos: { text, bold, italic, underline }.
export function parseInline(text) {
  const source = String(text ?? "");
  const segments = [];
  let position = 0;

  for (const match of source.matchAll(UNDERLINED)) {
    parseEmphasis(source.slice(position, match.index), false, segments);
    parseEmphasis(match[1], true, segments);
    position = match.index + match[0].length;
  }
  parseEmphasis(source.slice(position), false, segments);
  return segments;
}

// Alineación, lista y texto de una línea.
export function parseBlock(line) {
  const source = String(line ?? "");
  const match = source.match(BLOCK_PREFIX);
  const list = match[2] === "•" ? "bullet" : match[2] === "#" ? "ordered" : null;

  return {
    align: ALIGN_BY_MARK[match[1]] || "left",
    list,
    text: source.slice(match[0].length),
  };
}

// Número de cada línea de una lista numerada (null en las demás). Las
// líneas [#] seguidas son una sola lista.
export function listNumbers(lines) {
  let count = 0;
  return lines.map((line) => {
    if (parseBlock(line).list !== "ordered") {
      count = 0;
      return null;
    }
    count += 1;
    return count;
  });
}

// Clase, estilo y número de un párrafo según su alineación y su lista. Lo
// usan el lector de capítulos y FormattedBlocks (ver estilos .rich-list-item).
export function blockAttributes(line, number = null) {
  const block = parseBlock(line);
  return {
    className:
      block.list === "bullet" ? "rich-list-item is-bullet"
        : block.list === "ordered" ? "rich-list-item is-ordered"
        : undefined,
    style: block.align === "left" ? undefined : { textAlign: block.align },
    // El número se muestra con CSS: no forma parte del texto.
    number: block.list === "ordered" ? `${number}.` : undefined,
  };
}

function listLabel(list, number) {
  if (list === "bullet") return "• ";
  if (list === "ordered") return `${number}. `;
  return "";
}

// El mismo texto sin marcas, para descripciones y resúmenes. Las listas se
// conservan como «• » y «1. ».
export function stripInline(text) {
  const lines = String(text ?? "").split("\n");
  const numbers = listNumbers(lines);

  return lines
    .map((line, index) => {
      const block = parseBlock(line);
      const plain = parseInline(block.text).map((segment) => segment.text).join("");
      return listLabel(block.list, numbers[index]) + plain;
    })
    .join("\n");
}

// HTML del texto de un párrafo. `escape` protege lo escrito por la autora.
export function inlineToHtml(text, escape) {
  return parseInline(text)
    .map((segment) => {
      let html = escape(segment.text);
      if (segment.italic) html = `<em>${html}</em>`;
      if (segment.bold) html = `<strong>${html}</strong>`;
      if (segment.underline) html = `<u>${html}</u>`;
      return html;
    })
    .join("");
}

// HTML de un párrafo completo, con su alineación y su viñeta o número.
export function lineToHtml(line, escape, number = null) {
  const block = parseBlock(line);
  const style = block.align === "left" ? "" : ` style="text-align:${block.align}"`;
  return `<p${style}>${escape(listLabel(block.list, number))}${inlineToHtml(block.text, escape)}</p>`;
}
