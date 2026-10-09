import { describe, expect, it } from "vitest";
import { anchorMatchesText, paragraphAnchor } from "./textAnchors";

describe("paragraphAnchor", () => {
  it("abarca el párrafo completo", () => {
    const text = "Juanito le dijo que sí. Ella sonrió.";

    expect(paragraphAnchor(text, 4, 600)).toEqual({
      paragraphIndex: 4,
      startOffset: 0,
      endOffset: text.length,
      quote: text,
    });
  });

  it("no incluye los espacios de los extremos", () => {
    const anchor = paragraphAnchor("   Hola, mundo.  \r", 0, 600);

    expect(anchor.quote).toBe("Hola, mundo.");
    expect(anchor.startOffset).toBe(3);
    expect(anchor.endOffset).toBe(15);
  });

  it("no hay nada que comentar en un párrafo vacío", () => {
    expect(paragraphAnchor("", 0, 600)).toBeNull();
    expect(paragraphAnchor("   ", 0, 600)).toBeNull();
    expect(paragraphAnchor(undefined, 0, 600)).toBeNull();
  });

  it("de un párrafo muy largo cita el comienzo, sin partir palabras", () => {
    const text = "uno dos tres cuatro cinco";
    const anchor = paragraphAnchor(text, 0, 10);

    expect(anchor.quote).toBe("uno dos");
    expect(anchor.endOffset).toBe(7);
  });

  it("cuenta las posiciones como el servidor, un emoji vale uno", () => {
    const text = "😀 Hola 😀";
    const anchor = paragraphAnchor(text, 0, 600);

    expect(anchor.endOffset).toBe(8);
    // El resultado coincide con el texto al leerlo de vuelta.
    expect(anchorMatchesText(text, {
      start_offset: anchor.startOffset,
      end_offset: anchor.endOffset,
      quote: anchor.quote,
    })).toBe(true);
  });
});
