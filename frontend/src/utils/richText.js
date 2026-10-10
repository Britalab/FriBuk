// Negrita y cursiva dentro del texto de un capítulo.
//
// El capítulo se guarda como texto simple. Para destacar se rodea el texto
// con asteriscos, como en WhatsApp o Discord:
//
//     *cursiva*     **negrita**     ***negrita y cursiva***
//
// Las marcas deben tocar el texto que rodean y cerrarse en el mismo párrafo.
// Cualquier otro asterisco se muestra tal cual: un separador de escena
// (***), una nota al pie (*) o una multiplicación (2 * 3).

const MARKED = /(\*{1,3})(?=[^\s*])([^*\n]*?[^\s*])\1(?!\*)/g;

// Divide un párrafo en trozos: { text, bold, italic }.
export function parseInline(text) {
  const source = String(text ?? "");
  const segments = [];
  let position = 0;

  const pushPlain = (value) => {
    if (!value) return;
    const last = segments[segments.length - 1];
    if (last && !last.bold && !last.italic) {
      last.text += value;
    } else {
      segments.push({ text: value, bold: false, italic: false });
    }
  };

  for (const match of source.matchAll(MARKED)) {
    pushPlain(source.slice(position, match.index));
    segments.push({
      text: match[2],
      bold: match[1].length >= 2,
      italic: match[1].length !== 2,
    });
    position = match.index + match[0].length;
  }

  pushPlain(source.slice(position));
  return segments;
}

// El mismo texto sin las marcas, para descripciones y resúmenes.
export function stripInline(text) {
  return parseInline(text).map((segment) => segment.text).join("");
}

// HTML del párrafo. `escape` protege el texto escrito por la autora.
export function inlineToHtml(text, escape) {
  return parseInline(text)
    .map((segment) => {
      let html = escape(segment.text);
      if (segment.italic) html = `<em>${html}</em>`;
      if (segment.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join("");
}

const MAX_MARKS = 3;

// Asteriscos seguidos al final de `before` y al inicio de `after`.
function countTrailing(value) {
  let count = 0;
  while (count < value.length && value[value.length - 1 - count] === "*") count += 1;
  return count;
}

function countLeading(value) {
  let count = 0;
  while (count < value.length && value[count] === "*") count += 1;
  return count;
}

// Con n asteriscos a cada lado: 1 es cursiva, 2 negrita y 3 las dos.
function hasFormat(marks, kind) {
  return kind === "bold" ? marks >= 2 : marks % 2 === 1;
}

function marksAfterToggle(marks, kind, turnOn) {
  const bold = kind === "bold" ? turnOn : marks >= 2;
  const italic = kind === "italic" ? turnOn : marks % 2 === 1;
  return (bold ? 2 : 0) + (italic ? 1 : 0);
}

// Un párrafo (o parte de él) separado en espacios, marcas y texto.
function splitLine(line) {
  const text = line.trim();
  const lead = line.slice(0, line.indexOf(text));
  const tail = line.slice(lead.length + text.length);
  const marks = Math.min(countLeading(text), countTrailing(text), MAX_MARKS);
  const core = text.slice(marks, text.length - marks);

  // Una línea vacía o hecha solo de asteriscos (***) no se destaca.
  return core.replace(/\*/g, "").trim() ? { lead, tail, marks, core } : null;
}

// Aplica o quita negrita o cursiva en la selección de un cuadro de texto.
// Devuelve el texto nuevo y la selección que debe quedar.
//
// Pulsar el mismo botón dos veces deja el texto como estaba: las marcas se
// quitan, no se acumulan. Una selección de varios párrafos se marca párrafo
// por párrafo, porque una marca no cruza saltos de línea.
export function toggleInline(value, start, end, kind) {
  // Sin selección: marcas vacías con el cursor en medio, o se quitan si el
  // cursor ya está entre unas marcas vacías.
  if (start === end) {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const marks = Math.min(countTrailing(before), countLeading(after), MAX_MARKS);
    const next = marksAfterToggle(marks, kind, !hasFormat(marks, kind));
    const cursor = start - marks + next;

    return {
      value:
        before.slice(0, before.length - marks) +
        "*".repeat(next * 2) +
        after.slice(marks),
      start: cursor,
      end: cursor,
    };
  }

  // Las marcas pegadas a la selección cuentan como parte de ella: da igual
  // si se seleccionó «palabra» o «**palabra**».
  let from = start;
  let to = end;
  for (let extra = 0; extra < MAX_MARKS && value[from - 1] === "*"; extra += 1) from -= 1;
  for (let extra = 0; extra < MAX_MARKS && value[to] === "*"; extra += 1) to += 1;

  const lines = value.slice(from, to).split("\n");
  const parts = lines.map(splitLine);
  const first = parts.find(Boolean);

  if (!first) return { value, start, end };

  // Todo lo seleccionado queda igual: con el formato, o sin él.
  const turnOn = !hasFormat(first.marks, kind);
  const result = lines
    .map((line, index) => {
      const part = parts[index];
      if (!part) return line;

      const marks = "*".repeat(marksAfterToggle(part.marks, kind, turnOn));
      return `${part.lead}${marks}${part.core}${marks}${part.tail}`;
    })
    .join("\n");

  return {
    value: value.slice(0, from) + result + value.slice(to),
    start: from,
    end: from + result.length,
  };
}
