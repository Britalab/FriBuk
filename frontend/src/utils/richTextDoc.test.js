import { describe, expect, it } from "vitest";
import { docToText, textToDoc } from "./richTextDoc";

const roundTrip = (text) => docToText(textToDoc(text));
const text = (value, ...marks) =>
  marks.length ? { type: "text", text: value, marks: marks.map((type) => ({ type })) } : { type: "text", text: value };
const paragraph = (content, textAlign = null) => ({
  type: "paragraph",
  attrs: { textAlign },
  ...(content.length ? { content } : {}),
});

describe("abrir y guardar sin cambios deja el mismo texto", () => {
  it("con capítulos escritos antes del editor visual", () => {
    for (const chapter of [
      "",
      "Una línea.",
      "Primer párrafo.\n\nSegundo, con *cursiva*, **negrita** y ***ambas***.\n***\nFin.",
      "2 * 3 = 6 y una nota* al pie",
      "   Sangría con espacios\tal inicio.",
      "— Diálogo con raya.\n- Diálogo con guion.",
      "pa**la**bra a medias",
      "nombre__de__variable",
      "\n\nlíneas vacías al inicio y al final\n\n",
    ]) {
      expect(roundTrip(chapter)).toBe(chapter);
    }
  });

  it("con todo el formato nuevo", () => {
    for (const chapter of [
      "[centro]**Capítulo uno**",
      "Un __lugar__ y __**otro**__ y __***más***__.",
      "[derecha]— Anónimo\n[justificado]Texto largo de libro.",
      "[•]Pan\n[•]**Leche**\n\n[#]Uno\n[#]Dos\ntexto\n[#]Otra lista",
      "[centro][#]Punto centrado\n[centro][•]Viñeta centrada",
    ]) {
      expect(roundTrip(chapter)).toBe(chapter);
    }
  });
});

describe("textToDoc", () => {
  it("agrupa las líneas de lista seguidas en una lista", () => {
    const doc = textToDoc("[#]Uno\n[#]Dos\n[•]Pan");

    expect(doc.content.map((node) => node.type)).toEqual(["orderedList", "bulletList"]);
    expect(doc.content[0].content).toHaveLength(2);
  });

  it("pasa la alineación al párrafo", () => {
    expect(textToDoc("[centro]Hola").content[0].attrs.textAlign).toBe("center");
    expect(textToDoc("Hola").content[0].attrs.textAlign).toBeNull();
  });
});

describe("docToText", () => {
  it("deja los espacios fuera de las marcas", () => {
    const doc = { type: "doc", content: [paragraph([text("una "), text(" palabra ", "bold"), text("clave")])] };

    expect(docToText(doc)).toBe("una  **palabra** clave");
  });

  it("separa con un carácter invisible dos formatos que se tocan", () => {
    const doc = {
      type: "doc",
      content: [paragraph([text("uno", "bold"), text("dos", "italic"), text("tres", "underline"), text("cuatro")])],
    };
    const saved = docToText(doc);

    expect(saved).toBe("**uno**\u2060*dos*\u2060__tres__\u2060cuatro");
    // Y al abrirlo otra vez, cada trozo conserva su formato.
    expect(textToDoc(saved).content[0].content).toEqual(doc.content[0].content);
  });

  it("combina subrayado con negrita y cursiva", () => {
    const doc = {
      type: "doc",
      content: [paragraph([text("a", "bold", "underline"), text("b", "italic", "underline")])],
    };

    expect(docToText(doc)).toBe("__**a**\u2060*b*__");
    expect(textToDoc(docToText(doc)).content[0].content).toEqual(doc.content[0].content);
  });

  it("un punto de lista con varios párrafos o listas dentro queda en líneas", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "bulletList",
        content: [{
          type: "listItem",
          content: [
            paragraph([text("Punto")]),
            paragraph([text("Segundo párrafo")]),
            { type: "orderedList", content: [{ type: "listItem", content: [paragraph([text("Dentro")])] }] },
          ],
        }],
      }],
    };

    expect(docToText(doc)).toBe("[•]Punto\nSegundo párrafo\n[#]Dentro");
  });

  it("un bloque desconocido (pegado de otro sitio) conserva su texto", () => {
    const doc = {
      type: "doc",
      content: [{ type: "heading", content: [text("Título")] }, { type: "blockquote", content: [paragraph([text("Cita")])] }],
    };

    expect(docToText(doc)).toBe("Título\nCita");
  });
});
