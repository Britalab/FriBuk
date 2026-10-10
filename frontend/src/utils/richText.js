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

const MARKERS = { bold: "**", italic: "*" };

// Aplica o quita una marca en la selección de un cuadro de texto. Devuelve
// el texto nuevo y la selección que debe quedar. Sin selección, deja las
// marcas con el cursor en medio. Una selección de varios párrafos se marca
// párrafo por párrafo, porque una marca no cruza saltos de línea.
export function toggleInline(value, start, end, kind) {
  const marker = MARKERS[kind];
  const size = marker.length;

  if (start === end) {
    return {
      value: value.slice(0, start) + marker + marker + value.slice(end),
      start: start + size,
      end: start + size,
    };
  }

  const selected = value.slice(start, end);

  // Ya estaba marcada (las marcas dentro o justo fuera de la selección).
  const outside =
    value.slice(start - size, start) === marker &&
    value.slice(end, end + size) === marker &&
    (kind === "bold" || (value[start - size - 1] !== "*" && value[end + size] !== "*"));

  if (outside) {
    return {
      value: value.slice(0, start - size) + selected + value.slice(end + size),
      start: start - size,
      end: end - size,
    };
  }

  const wrapped = selected
    .split("\n")
    .map((line) => {
      const text = line.trim();
      if (!text) return line;

      const lead = line.slice(0, line.indexOf(text));
      const tail = line.slice(lead.length + text.length);
      return `${lead}${marker}${text}${marker}${tail}`;
    })
    .join("\n");

  return {
    value: value.slice(0, start) + wrapped + value.slice(end),
    start,
    end: start + wrapped.length,
  };
}
