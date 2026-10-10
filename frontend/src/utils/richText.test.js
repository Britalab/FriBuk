import { describe, expect, it } from "vitest";
import { inlineToHtml, parseInline, stripInline, toggleInline } from "./richText";

const plain = (text) => ({ text, bold: false, italic: false });
const escape = (value) => value.replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("parseInline", () => {
  it("reconoce cursiva, negrita y ambas", () => {
    expect(parseInline("Dijo *nunca* y **jamás**, ***jamás***.")).toEqual([
      plain("Dijo "),
      { text: "nunca", bold: false, italic: true },
      plain(" y "),
      { text: "jamás", bold: true, italic: false },
      plain(", "),
      { text: "jamás", bold: true, italic: true },
      plain("."),
    ]);
  });

  it("acepta frases con espacios", () => {
    expect(parseInline("**una frase entera**")).toEqual([
      { text: "una frase entera", bold: true, italic: false },
    ]);
  });

  it("deja tal cual los asteriscos que no son marcas", () => {
    for (const text of [
      "***",
      "* * *",
      "2 * 3 * 4",
      "una nota* al pie",
      "*sin cerrar",
      "** espacios **",
      "****",
      "",
    ]) {
      expect(parseInline(text)).toEqual(text ? [plain(text)] : []);
    }
  });

  it("no une marcas de párrafos distintos", () => {
    expect(parseInline("*uno\ndos*")).toEqual([plain("*uno\ndos*")]);
  });
});

describe("stripInline e inlineToHtml", () => {
  it("quita las marcas para los resúmenes", () => {
    expect(stripInline("Dijo *nunca* y **jamás**.")).toBe("Dijo nunca y jamás.");
    expect(stripInline("***")).toBe("***");
  });

  it("escribe el HTML sin dejar pasar el de la autora", () => {
    expect(inlineToHtml("**<b>hola</b>** y *chao*", escape)).toBe(
      "<strong>&lt;b&gt;hola&lt;/b&gt;</strong> y <em>chao</em>"
    );
    expect(inlineToHtml("***x***", escape)).toBe("<strong><em>x</em></strong>");
  });
});

describe("toggleInline", () => {
  it("marca la selección y la deja seleccionada", () => {
    const result = toggleInline("una palabra clave", 4, 11, "bold");

    expect(result.value).toBe("una **palabra** clave");
    expect(result.value.slice(result.start, result.end)).toBe("**palabra**");
  });

  it("no incluye los espacios de los extremos dentro de la marca", () => {
    expect(toggleInline("una palabra clave", 3, 12, "italic").value).toBe(
      "una *palabra* clave"
    );
  });

  it("sin selección deja las marcas con el cursor en medio", () => {
    const result = toggleInline("hola ", 5, 5, "bold");

    expect(result.value).toBe("hola ****");
    expect([result.start, result.end]).toEqual([7, 7]);
  });

  it("quita la marca si la selección ya la tenía", () => {
    const result = toggleInline("una **palabra** clave", 6, 13, "bold");

    expect(result.value).toBe("una palabra clave");
    expect(result.value.slice(result.start, result.end)).toBe("palabra");
  });

  it("la cursiva no confunde una negrita con una cursiva", () => {
    // «palabra» está en negrita: pedir cursiva la agrega, no quita un asterisco.
    expect(toggleInline("**palabra**", 2, 9, "italic").value).toBe("***palabra***");
  });

  it("marca cada párrafo por separado", () => {
    const text = "primero\n\nsegundo";

    expect(toggleInline(text, 0, text.length, "italic").value).toBe(
      "*primero*\n\n*segundo*"
    );
  });
});
