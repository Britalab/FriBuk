import { describe, expect, it } from "vitest";
import { buildPreview, escapeHtml, excerpt } from "./storyPreview";

const ORIGIN = "https://www.fribuk.com";

const STORY = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Bajo la última sombra",
  description: "Primera línea.\nSegunda línea.",
  genre: "Fantasía",
  cover_url: "https://cdn.test/portada.jpg",
  author_id: "99999999-2222-3333-4444-555555555555",
  author_username: "autora",
  chapters: [
    { id: "aaaaaaaa-2222-3333-4444-555555555555", title: "Uno" },
    { id: "bbbbbbbb-2222-3333-4444-555555555555", title: "" },
  ],
  chapter: null,
};

describe("excerpt", () => {
  it("deja el texto en una línea y corta sin partir palabras", () => {
    expect(excerpt("  Hola\n\n mundo  ")).toBe("Hola mundo");
    expect(excerpt("uno dos tres cuatro cinco seis", 20)).toBe("uno dos tres cuatro…");
    expect(excerpt(null)).toBe("");
  });
});

describe("buildPreview de una historia", () => {
  const preview = buildPreview(STORY, ORIGIN);

  it("arma título, descripción, imagen y enlace", () => {
    expect(preview.title).toBe("Bajo la última sombra de autora | FriBuk");
    expect(preview.description).toBe("Primera línea. Segunda línea.");
    expect(preview.image).toBe("https://cdn.test/portada.jpg");
    expect(preview.url).toBe(`${ORIGIN}/stories/${STORY.id}`);
    expect(preview.type).toBe("book");
  });

  it("escribe el contenido legible sin JavaScript", () => {
    expect(preview.bodyHtml).toContain("<h1>Bajo la última sombra</h1>");
    expect(preview.bodyHtml).toContain(`<a href="/usuario/${STORY.author_id}">autora</a>`);
    expect(preview.bodyHtml).toContain("<p>Primera línea.</p><p>Segunda línea.</p>");
    expect(preview.bodyHtml).toContain(
      `<a href="/stories/${STORY.id}/chapters/${STORY.chapters[0].id}">Uno</a>`
    );
    // Un capítulo sin título se nombra por su posición.
    expect(preview.bodyHtml).toContain(">Capítulo 2</a>");
  });

  it("incluye datos estructurados válidos", () => {
    const data = JSON.parse(preview.structuredData);

    expect(data["@type"]).toBe("Book");
    expect(data.name).toBe("Bajo la última sombra");
    expect(data.author).toEqual({ "@type": "Person", name: "autora" });
  });

  it("usa el logo y un texto propio si faltan portada y sinopsis", () => {
    const bare = buildPreview(
      { ...STORY, cover_url: null, description: "", author_username: null, chapters: [] },
      ORIGIN
    );

    expect(bare.image).toBe(`${ORIGIN}/logo-fribuk.jpg`);
    expect(bare.title).toBe("Bajo la última sombra | FriBuk");
    expect(bare.description).toBe("Lee «Bajo la última sombra» en FriBuk.");
    expect(bare.bodyHtml).not.toContain("Capítulos");
  });
});

describe("buildPreview de un capítulo", () => {
  const preview = buildPreview(
    {
      ...STORY,
      chapter: {
        id: STORY.chapters[0].id,
        title: "Uno",
        position: 1,
        content: "Era de noche.\n\nNadie respondió.",
        is_truncated: false,
      },
    },
    ORIGIN
  );

  it("describe el capítulo y enlaza a su historia", () => {
    expect(preview.title).toBe("Uno · Bajo la última sombra | FriBuk");
    expect(preview.description).toBe("Era de noche. Nadie respondió.");
    expect(preview.url).toBe(
      `${ORIGIN}/stories/${STORY.id}/chapters/${STORY.chapters[0].id}`
    );
    expect(preview.bodyHtml).toContain("<h1>Uno</h1>");
    expect(preview.bodyHtml).toContain("<p>Era de noche.</p><p>Nadie respondió.</p>");
    expect(preview.bodyHtml).toContain(`<a href="/stories/${STORY.id}">Bajo la última sombra</a>`);
    expect(JSON.parse(preview.structuredData)["@type"]).toBe("Chapter");
  });
});

describe("contenido escrito por usuarios", () => {
  const hostile = '<script>alert("x")</script><img src=x onerror=alert(1)>';
  const preview = buildPreview(
    {
      ...STORY,
      title: hostile,
      description: hostile,
      genre: hostile,
      author_username: hostile,
      chapters: [{ id: STORY.chapters[0].id, title: hostile }],
      chapter: {
        id: STORY.chapters[0].id,
        title: hostile,
        position: 1,
        content: `${hostile}\n</main></div><script>alert(2)</script>`,
        is_truncated: false,
      },
    },
    ORIGIN
  );
  const story = buildPreview(
    {
      ...STORY,
      title: hostile,
      description: hostile,
      genre: hostile,
      author_username: hostile,
      chapters: [{ id: STORY.chapters[0].id, title: hostile }],
    },
    ORIGIN
  );

  it("nunca llega a la página como HTML", () => {
    expect(escapeHtml(hostile)).not.toMatch(/[<>"]/);

    for (const html of [preview.bodyHtml, story.bodyHtml]) {
      expect(html).not.toContain("<script");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("no puede cerrar la etiqueta de los datos estructurados", () => {
    for (const data of [preview.structuredData, story.structuredData]) {
      expect(data).not.toContain("<");
      expect(JSON.parse(data)).toBeTruthy();
    }
  });
});
