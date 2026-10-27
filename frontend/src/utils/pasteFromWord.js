// Listas pegadas desde Word de escritorio.
//
// Word no copia sus listas como listas: copia párrafos con el estilo
// «mso-list» que empiezan con la viñeta o el número escritos como texto
// (dentro de un elemento con «mso-list:Ignore»). Aquí se convierten en
// listas de verdad, para que al pegar queden igual que en Word.

const ORDERED_MARKER = /^\s*(\d+|[a-z]|[ivxlcdm]+)[.)]/i;

function isWordListParagraph(node) {
  return (
    node?.nodeType === 1 &&
    node.tagName === "P" &&
    /mso-list\s*:/i.test(node.getAttribute("style") || "") &&
    !/mso-list\s*:\s*ignore/i.test(node.getAttribute("style") || "")
  );
}

// Quita la viñeta o el número escritos y dice qué tipo de lista es.
function takeMarker(paragraph) {
  const marker = paragraph.querySelector('[style*="mso-list:ignore" i]');
  let text = "";

  if (marker) {
    // Lo que lo envuelve solo para darle la fuente de la viñeta, también.
    let outer = marker;
    while (outer.parentElement !== paragraph && outer.parentElement.textContent === marker.textContent) {
      outer = outer.parentElement;
    }
    text = outer.textContent;
    outer.remove();
  } else {
    // Sin la marca de Word: la viñeta es el comienzo del texto.
    const first = paragraph.firstChild;
    const match = first?.textContent?.match(/^\s*([·•o§▪\-–]|\d+[.)]|[a-z][.)])\s+/i);
    if (match && first.nodeType === 3) {
      text = match[0];
      first.textContent = first.textContent.slice(match[0].length);
    } else if (match && first.nodeType === 1 && first.textContent === match[0].replace(/\s+$/, "")) {
      text = first.textContent;
      first.remove();
    }
  }

  return ORDERED_MARKER.test(text) ? "ol" : "ul";
}

export function wordListsToHtml(html) {
  if (!/mso-list/i.test(html) || typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = [...doc.body.querySelectorAll("p")].filter(isWordListParagraph);

  for (const paragraph of paragraphs) {
    if (!paragraph.isConnected) continue;
    const type = takeMarker(paragraph);
    const item = doc.createElement("li");
    const content = doc.createElement("p");
    if (paragraph.style.textAlign) content.style.textAlign = paragraph.style.textAlign;
    content.append(...paragraph.childNodes);
    item.append(content);

    // Se suma a la lista de justo antes si es del mismo tipo.
    let previous = paragraph.previousSibling;
    while (previous?.nodeType === 3 && !previous.textContent.trim()) previous = previous.previousSibling;
    if (previous?.nodeType === 1 && previous.tagName === type.toUpperCase() && previous.dataset.fromWord) {
      previous.append(item);
      paragraph.remove();
    } else {
      const list = doc.createElement(type);
      list.dataset.fromWord = "1";
      list.append(item);
      paragraph.replaceWith(list);
    }
  }

  return doc.body.innerHTML;
}
