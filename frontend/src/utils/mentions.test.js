import { describe, expect, it } from "vitest";
import { appendMention, splitMentions } from "./mentions";

describe("splitMentions", () => {
  it("separa las menciones del resto del texto", () => {
    expect(splitMentions("Hola @alice, mira esto.")).toEqual([
      { text: "Hola " },
      { text: "@alice", username: "alice" },
      { text: ", mira esto." },
    ]);
  });

  it("reconoce una mención al inicio y varias seguidas", () => {
    expect(splitMentions("@ana_1 @bob.lee gracias")).toEqual([
      { text: "@ana_1", username: "ana_1" },
      { text: " " },
      { text: "@bob.lee", username: "bob.lee" },
      { text: " gracias" },
    ]);
  });

  it("deja fuera el punto final de la frase", () => {
    expect(splitMentions("Gracias, @bob.lee.")).toEqual([
      { text: "Gracias, " },
      { text: "@bob.lee", username: "bob.lee" },
      { text: "." },
    ]);
  });

  it("acepta nombres con tildes y eñes", () => {
    expect(splitMentions("@maría_ñ")).toEqual([
      { text: "@maría_ñ", username: "maría_ñ" },
    ]);
  });

  it("no confunde un correo ni un @ suelto con una mención", () => {
    for (const text of ["ana@correo.com", "precio @ 5", "@ab", "", "sin nada"]) {
      expect(splitMentions(text)).toEqual(text ? [{ text }] : []);
    }
  });
});

describe("appendMention", () => {
  it("agrega la mención con un espacio para seguir escribiendo", () => {
    expect(appendMention("", "alice")).toBe("@alice ");
    expect(appendMention("   ", "alice")).toBe("@alice ");
    expect(appendMention("Hola", "alice")).toBe("Hola @alice ");
    expect(appendMention("Hola ", "alice")).toBe("Hola @alice ");
  });
});
