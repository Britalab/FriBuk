import { describe, expect, it } from "vitest";
import { buildProfilePreview } from "./profilePreview";

const ORIGIN = "https://www.fribuk.com";
const API = "https://api.fribuk.com";

const PROFILE = {
  id: "99999999-2222-3333-4444-555555555555",
  username: "autora",
  display_name: "Ana Autora",
  bio: "Escribo fantasía.\nY a veces poesía.",
  avatar_version: "1700",
  stories: [{ id: "11111111-2222-3333-4444-555555555555", title: "Bajo la última sombra" }],
};

describe("buildProfilePreview", () => {
  const preview = buildProfilePreview(PROFILE, ORIGIN, API);

  it("muestra el nombre, la biografía y la foto pequeña", () => {
    expect(preview.title).toBe("Ana Autora (@autora) | FriBuk");
    expect(preview.description).toBe("Escribo fantasía. Y a veces poesía.");
    expect(preview.image).toBe(`${API}/seo/users/${PROFILE.id}/avatar.jpg?v=1700`);
    expect(preview.card).toBe("summary");
    expect(preview.url).toBe(`${ORIGIN}/usuario/${PROFILE.id}`);
  });

  it("escribe el perfil legible sin JavaScript", () => {
    expect(preview.bodyHtml).toContain("<h1>Ana Autora</h1>");
    expect(preview.bodyHtml).toContain(
      `<a href="/stories/${PROFILE.stories[0].id}">Bajo la última sombra</a>`
    );
  });

  it("incluye datos estructurados de un perfil", () => {
    const data = JSON.parse(preview.structuredData);

    expect(data["@type"]).toBe("ProfilePage");
    expect(data.mainEntity).toMatchObject({ "@type": "Person", name: "Ana Autora" });
  });

  it("sin foto ni biografía usa el logo y un texto propio", () => {
    const bare = buildProfilePreview(
      { ...PROFILE, display_name: null, bio: null, avatar_version: null },
      ORIGIN,
      API
    );

    expect(bare.title).toBe("@autora | FriBuk");
    expect(bare.image).toBe(`${ORIGIN}/logo-fribuk.jpg`);
    expect(bare.description).toBe("Perfil de autora en FriBuk · 1 historia.");
  });

  it("lo que escribe la persona nunca llega como HTML", () => {
    const tricky = buildProfilePreview(
      {
        ...PROFILE,
        display_name: '<img src=x onerror="alert(1)">',
        bio: "</script><script>alert(1)</script>",
        stories: [{ id: "x", title: "<b>negrita</b>" }],
      },
      ORIGIN,
      API
    );

    expect(tricky.bodyHtml).not.toContain("<img");
    expect(tricky.bodyHtml).not.toContain("<script");
    expect(tricky.bodyHtml).not.toContain("<b>");
    expect(tricky.structuredData).not.toContain("</script");
  });
});
