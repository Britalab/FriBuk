// Conversión entre el texto guardado (ver richText.js) y el documento del
// editor visual (Tiptap/ProseMirror, en formato JSON), en los dos sentidos.
//
// Abrir un capítulo y guardarlo sin cambios debe dejar el mismo texto: cada
// línea es un párrafo (o un punto de lista) y vuelve a ser una línea.

import { ALIGN_MARKS, LIST_MARKS, WORD_JOINER, parseBlock, parseInline } from "./richText";

const LIST_NODES = { bullet: "bulletList", ordered: "orderedList" };
const LIST_KINDS = { bulletList: "bullet", orderedList: "ordered" };
const MARKER = /[*_]/;
const WORD = /[\p{L}\p{N}_]/u;

// ---------- texto → documento ----------

function inlineNodes(text) {
  return parseInline(text).map((segment) => {
    const marks = [
      segment.bold && { type: "bold" },
      segment.italic && { type: "italic" },
      segment.underline && { type: "underline" },
    ].filter(Boolean);
    return marks.length
      ? { type: "text", text: segment.text, marks }
      : { type: "text", text: segment.text };
  });
}

function paragraphNode(block) {
  const content = inlineNodes(block.text);
  return {
    type: "paragraph",
    attrs: { textAlign: block.align === "left" ? null : block.align },
    ...(content.length ? { content } : {}),
  };
}

export function textToDoc(text) {
  const content = [];

  for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const block = parseBlock(line);
    const paragraph = paragraphNode(block);

    if (!block.list) {
      content.push(paragraph);
      continue;
    }

    // Las líneas seguidas del mismo tipo de lista van en la misma lista.
    const type = LIST_NODES[block.list];
    const last = content[content.length - 1];
    const item = { type: "listItem", content: [paragraph] };
    if (last?.type === type) {
      last.content.push(item);
    } else {
      content.push({ type, content: [item] });
    }
  }

  return { type: "doc", content };
}

// ---------- documento → texto ----------

function formatOf(node) {
  const types = new Set((node.marks || []).map((mark) => mark.type));
  return { bold: types.has("bold"), italic: types.has("italic"), underline: types.has("underline") };
}

// Rodea `text` con `mark`, dejando fuera los espacios de los extremos: una
// marca debe tocar el texto que rodea.
function wrap(text, mark) {
  const [, lead, core, tail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return core ? `${lead}${mark}${core}${mark}${tail}` : text;
}

// Une trozos ya marcados. Solo donde dos trozos se leerían como uno va un
// separador invisible: dos marcas pegadas (**uno***dos*) o un subrayado
// pegado a una palabra (__uno__dos), que no se reconocería. Junto a un
// espacio o un signo (**así**,) no hace falta.
function join(pieces) {
  return pieces.reduce((result, piece) => {
    if (!result || !piece) return result + piece;
    const before = result[result.length - 1];
    const after = piece[0];
    const touches =
      (MARKER.test(before) && MARKER.test(after)) ||
      (before === "_" && WORD.test(after)) ||
      (after === "_" && WORD.test(before));
    return result + (touches ? WORD_JOINER : "") + piece;
  }, "");
}

function emphasis(run) {
  const count = (run.bold ? 2 : 0) + (run.italic ? 1 : 0);
  return count ? wrap(run.text, "*".repeat(count)) : run.text;
}

function inlineText(nodes = []) {
  // Trozos seguidos con el mismo formato van juntos.
  const runs = [];
  for (const node of nodes) {
    if (node.type !== "text" || !node.text) continue;
    const run = { text: node.text.replaceAll(WORD_JOINER, ""), ...formatOf(node) };
    const last = runs[runs.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.underline === run.underline) {
      last.text += run.text;
    } else {
      runs.push(run);
    }
  }

  // El subrayado envuelve a la negrita y la cursiva: __**así**__.
  const groups = [];
  for (const run of runs) {
    const last = groups[groups.length - 1];
    if (last && last.underline === run.underline) {
      last.runs.push(run);
    } else {
      groups.push({ underline: run.underline, runs: [run] });
    }
  }

  return join(groups.map((group) => {
    const inner = join(group.runs.map(emphasis));
    return group.underline ? wrap(inner, "__") : inner;
  }));
}

function alignPrefix(node) {
  const mark = ALIGN_MARKS[node.attrs?.textAlign];
  return mark ? `[${mark}]` : "";
}

function blockLines(node, lines) {
  if (node.type === "paragraph") {
    lines.push(alignPrefix(node) + inlineText(node.content));
    return;
  }

  const kind = LIST_KINDS[node.type];
  if (kind) {
    for (const item of node.content || []) {
      // El primer párrafo de cada punto lleva la marca de la lista; si un
      // punto tiene más párrafos (o listas dentro), siguen como líneas.
      let marked = false;
      for (const child of item.content || []) {
        if (child.type === "paragraph" && !marked) {
          lines.push(alignPrefix(child) + `[${LIST_MARKS[kind]}]` + inlineText(child.content));
          marked = true;
        } else {
          blockLines(child, lines);
        }
      }
    }
    return;
  }

  // Cualquier otro bloque (por ejemplo, pegado desde otro sitio): su texto.
  if (node.content?.some((child) => child.type === "text")) {
    lines.push(inlineText(node.content));
  } else {
    for (const child of node.content || []) blockLines(child, lines);
  }
}

export function docToText(doc) {
  const lines = [];
  for (const node of doc?.content || []) blockLines(node, lines);
  return lines.join("\n");
}
