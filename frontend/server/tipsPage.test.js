import { describe, expect, it } from "vitest";
import { buildLlmsText } from "./llmsText";
import { buildTipPage, buildTipsIndexPage } from "./tipsPage";

const ORIGIN = "https://www.fribuk.com";

const TIP = {
  id: "1",
  slug: "como-crear-tension-narrativa",
  position: 8,
  title: "¿Cómo crear tensión narrativa?",
  description: "Cómo hacer que el lector diga «un capítulo más».",
  summary: "Obstáculos, secretos y relojes corriendo.",
  pose: "senala",
  status: "published",
  published_at: "2026-10-27",
  updated_at: "2026-10-28T09:00:00+00:00",
  sections: [
    { heading: "", text: "La tensión es **algo en juego**." },
    { heading: "En resumen", text: "[•]Responde una pregunta y abre otra." },
  ],
};

describe("consejos para buscadores", () => {
  it("el índice lista cada consejo publicado como entrada del blog", () => {
    const page = buildTipsIndexPage(ORIGIN, [TIP]);
    const data = JSON.parse(page.structuredData);

    expect(page.url).toBe(`${ORIGIN}/consejos`);
    expect(page.image).toBe(`${ORIGIN}/tia-fribuk/tia-fribuk-compartir.jpg`);
    expect(data["@type"]).toBe("Blog");
    expect(data.author.name).toBe("tía FriBuk");
    expect(data.blogPost).toEqual([
      {
        "@type": "BlogPosting",
        headline: TIP.title,
        url: `${ORIGIN}/consejos/${TIP.slug}`,
        datePublished: "2026-10-27",
      },
    ]);
    expect(page.bodyHtml).toContain(`<a href="/consejos/${TIP.slug}">${TIP.title}</a>`);
    expect(page.bodyHtml).toContain(TIP.summary);
  });

  it("cada consejo es un artículo con autora, fechas y su texto completo", () => {
    const page = buildTipPage(ORIGIN, TIP);
    const [post, breadcrumbs] = JSON.parse(page.structuredData)["@graph"];

    expect(page.title).toBe(`${TIP.title} | Consejos de tía FriBuk`);
    expect(page.description).toBe(TIP.description);
    expect(page.type).toBe("article");
    expect(post).toMatchObject({
      "@type": "BlogPosting",
      headline: TIP.title,
      url: `${ORIGIN}/consejos/${TIP.slug}`,
      datePublished: "2026-10-27",
      dateModified: TIP.updated_at,
      inLanguage: "es",
      author: { "@type": "Person", name: "tía FriBuk" },
      publisher: { "@type": "Organization", name: "FriBuk" },
    });
    expect(post.wordCount).toBeGreaterThan(5);
    expect(breadcrumbs.itemListElement.map((item) => item.name)).toEqual([
      "FriBuk",
      "Consejos para escribir",
      TIP.title,
    ]);

    // El formato del editor se convierte en HTML.
    expect(page.bodyHtml).toContain("<h1>¿Cómo crear tensión narrativa?</h1>");
    expect(page.bodyHtml).toContain("<strong>algo en juego</strong>");
    expect(page.bodyHtml).toContain("<h2>En resumen</h2>");
    expect(page.bodyHtml).not.toContain("<h2></h2>");
  });

  it("sin descripción, usa el comienzo del resumen", () => {
    const page = buildTipPage(ORIGIN, { ...TIP, description: "" });
    expect(page.description).toBe(TIP.summary);
  });

  it("escribe el texto como texto, no como HTML", () => {
    const page = buildTipPage(ORIGIN, {
      ...TIP,
      title: "<b>Hola</b>",
      sections: [{ heading: "<script>x</script>", text: "<img src=x>" }],
    });

    expect(page.bodyHtml).not.toContain("<script");
    expect(page.bodyHtml).not.toContain("<img");
    expect(page.bodyHtml).toContain("&lt;b&gt;Hola&lt;/b&gt;");
    expect(page.structuredData).not.toContain("<");
  });
});

describe("llms.txt", () => {
  it("presenta FriBuk y enlaza cada consejo publicado", () => {
    const text = buildLlmsText(ORIGIN, [TIP]);

    expect(text.startsWith("# FriBuk\n")).toBe(true);
    expect(text).toContain(`- [Foro](${ORIGIN}/forum)`);
    expect(text).toContain(`- [Todos los consejos](${ORIGIN}/consejos)`);
    expect(text).toContain(
      `- [${TIP.title}](${ORIGIN}/consejos/${TIP.slug}): ${TIP.description}`
    );
  });

  it("sin consejos sigue presentando el sitio", () => {
    const text = buildLlmsText(ORIGIN, []);
    expect(text).toContain("## Páginas principales");
    expect(text).toContain(`${ORIGIN}/consejos`);
  });
});
