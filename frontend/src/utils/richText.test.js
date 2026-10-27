import { describe, expect, it } from "vitest";
import {
  inlineToHtml,
  lineToHtml,
  listNumbers,
  parseBlock,
  parseInline,
  stripInline,
} from "./richText";

const plain = (text) => ({ text, bold: false, italic: false, underline: false });
const marked = (text, format) => ({ ...plain(text), ...format });
const escape = (value) => value.replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("parseInline", () => {
  it("reconoce cursiva, negrita y ambas", () => {
    expect(parseInline("Dijo *nunca* y **jamás**, ***jamás***.")).toEqual([
      plain("Dijo "),
      marked("nunca", { italic: true }),
      plain(" y "),
      marked("jamás", { bold: true }),
      plain(", "),
      marked("jamás", { bold: true, italic: true }),
      plain("."),
    ]);
  });

  it("acepta frases con espacios", () => {
    expect(parseInline("**una frase entera**")).toEqual([
      marked("una frase entera", { bold: true }),
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

describe("subrayado", () => {
  it("se reconoce y puede envolver negrita y cursiva", () => {
    expect(parseInline("Un __lugar__ y __**otro**__.")).toEqual([
      plain("Un "),
      marked("lugar", { underline: true }),
      plain(" y "),
      marked("otro", { bold: true, underline: true }),
      plain("."),
    ]);
    expect(inlineToHtml("__**x**__", escape)).toBe("<u><strong>x</strong></u>");
  });

  it("deja tal cual los guiones bajos que no son marcas", () => {
    for (const text of ["nombre__de__variable", "__ espacios __", "____", "un_guion_bajo"]) {
      expect(parseInline(text)).toEqual([plain(text)]);
    }
  });

  it("el separador invisible no se muestra", () => {
    expect(parseInline("**uno**\u2060*dos*")).toEqual([
      marked("uno", { bold: true }),
      marked("dos", { italic: true }),
    ]);
  });
});

describe("alineación y listas", () => {
  it("lee la alineación y la lista al inicio de la línea", () => {
    expect(parseBlock("[centro]Título")).toEqual({ align: "center", list: null, text: "Título" });
    expect(parseBlock("[justificado][#]Uno")).toEqual({ align: "justify", list: "ordered", text: "Uno" });
    expect(parseBlock("[•]Pan")).toEqual({ align: "left", list: "bullet", text: "Pan" });
    // Una línea normal, aunque tenga corchetes, no cambia.
    expect(parseBlock("[Nota] texto")).toEqual({ align: "left", list: null, text: "[Nota] texto" });
  });

  it("numera las listas seguidas y empieza de nuevo tras otro párrafo", () => {
    expect(listNumbers(["[#]a", "[#]b", "texto", "[#]c", "[•]d"])).toEqual([1, 2, null, 1, null]);
  });

  it("sin marcas para los resúmenes, conservando viñetas y números", () => {
    expect(stripInline("[centro]**Hola**\n[#]uno\n[#]__dos__\n[•]tres")).toBe(
      "Hola\n1. uno\n2. dos\n• tres"
    );
  });

  it("escribe el párrafo con su alineación y su número", () => {
    expect(lineToHtml("[derecha][#]*Fin*", escape, 3)).toBe(
      '<p style="text-align:right">3. <em>Fin</em></p>'
    );
    expect(lineToHtml("<b>", escape)).toBe("<p>&lt;b&gt;</p>");
  });
});
