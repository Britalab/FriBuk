import { describe, expect, it } from "vitest";
import { FAQ } from "../src/data/faq";
import { buildFaqPage } from "./faqPage";

const ORIGIN = "https://www.fribuk.com";

describe("preguntas frecuentes", () => {
  it("cada pregunta tiene su respuesta y no se repite", () => {
    expect(FAQ.length).toBeGreaterThan(5);

    for (const item of FAQ) {
      expect(item.question.trim()).not.toBe("");
      expect(item.answer.trim().length).toBeGreaterThan(20);
      if (item.link) {
        expect(item.link.to.startsWith("/")).toBe(true);
        expect(item.link.label.trim()).not.toBe("");
      }
    }

    expect(new Set(FAQ.map((item) => item.question)).size).toBe(FAQ.length);
  });

  it("la versión para buscadores trae todas las preguntas", () => {
    const page = buildFaqPage(ORIGIN);
    const data = JSON.parse(page.structuredData);

    expect(page.url).toBe(`${ORIGIN}/preguntas-frecuentes`);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(FAQ.length);
    expect(data.mainEntity[0]).toEqual({
      "@type": "Question",
      name: FAQ[0].question,
      acceptedAnswer: { "@type": "Answer", text: FAQ[0].answer },
    });

    for (const item of FAQ) {
      expect(page.bodyHtml).toContain(`<h2>${item.question}</h2>`);
    }
  });

  it("escribe el texto como texto, no como HTML", () => {
    const page = buildFaqPage(ORIGIN, [
      { question: "<b>¿Sí?</b>", answer: "<script>alert(1)</script>" },
    ]);

    expect(page.bodyHtml).not.toContain("<script");
    expect(page.bodyHtml).toContain("&lt;b&gt;");
    expect(page.structuredData).not.toContain("<");
  });
});
