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
  // Pulsa el botón sobre lo que quedó seleccionado tras la pulsación anterior.
  const press = (state, kind) => toggleInline(state.value, state.start, state.end, kind);
  const selected = (state) => state.value.slice(state.start, state.end);

  it("marca la selección y la deja seleccionada", () => {
    const result = toggleInline("una palabra clave", 4, 11, "bold");

    expect(result.value).toBe("una **palabra** clave");
    expect(selected(result)).toBe("**palabra**");
  });

  it("pulsar otra vez quita las marcas en vez de sumarlas", () => {
    let state = { value: "una palabra clave", start: 4, end: 11 };

    state = press(state, "bold");
    expect(state.value).toBe("una **palabra** clave");

    state = press(state, "bold");
    expect(state.value).toBe("una palabra clave");
    expect(selected(state)).toBe("palabra");

    // Y lo mismo todas las veces que se repita.
    for (let times = 0; times < 4; times += 1) state = press(state, "italic");
    expect(state.value).toBe("una palabra clave");
  });

  it("da igual si se seleccionó la palabra o la palabra con sus marcas", () => {
    expect(toggleInline("una **palabra** clave", 6, 13, "bold").value).toBe(
      "una palabra clave"
    );
    expect(toggleInline("una **palabra** clave", 4, 15, "bold").value).toBe(
      "una palabra clave"
    );
    expect(toggleInline("una *palabra* clave", 4, 13, "italic").value).toBe(
      "una palabra clave"
    );
  });

  it("negrita y cursiva se combinan y se quitan por separado", () => {
    let state = { value: "palabra", start: 0, end: 7 };

    state = press(state, "bold");
    state = press(state, "italic");
    expect(state.value).toBe("***palabra***");

    state = press(state, "bold");
    expect(state.value).toBe("*palabra*");

    state = press(state, "italic");
    expect(state.value).toBe("palabra");
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

  it("sin selección, pulsar otra vez borra las marcas vacías", () => {
    let state = { value: "hola ", start: 5, end: 5 };

    state = press(state, "bold");
    state = press(state, "bold");
    expect(state).toEqual({ value: "hola ", start: 5, end: 5 });

    // Negrita y luego cursiva: tres asteriscos por lado; se quitan de a una.
    state = press(press(state, "bold"), "italic");
    expect(state.value).toBe("hola ******");
    expect(state.start).toBe(8);

    state = press(state, "bold");
    expect(state.value).toBe("hola **");
    state = press(state, "italic");
    expect(state.value).toBe("hola ");
  });

  it("marca cada párrafo por separado, y los desmarca juntos", () => {
    const text = "primero\n\nsegundo";
    const marked = toggleInline(text, 0, text.length, "italic");

    expect(marked.value).toBe("*primero*\n\n*segundo*");
    expect(press(marked, "italic").value).toBe(text);
  });

  it("no toca un separador de escena", () => {
    expect(toggleInline("***", 0, 3, "bold").value).toBe("***");
    expect(toggleInline("uno\n***\ndos", 0, 11, "bold").value).toBe(
      "**uno**\n***\n**dos**"
    );
  });
});
