import { describe, expect, it } from "vitest";
import {
  fandomList,
  feedFilterLink,
  popularTags,
  storyFandom,
  storyHasFandom,
  storyHasTag,
  storyMatchesSearch,
} from "./storySearch";

const draco = {
  title: "Bajo la última sombra",
  description: "Dos rivales obligados a trabajar juntos.",
  author_username: "ana",
  work_type: "fanfic",
  original_work: "Harry Potter",
  original_author: "J. K. Rowling",
  tags: ["enemies to lovers", "Slow Burn", "magia"],
};
const original = {
  title: "Donde termina el invierno",
  description: "Una fantasía sobre dragones.",
  author_username: "sofia",
  work_type: "original",
  original_work: "",
  tags: ["slow burn", "dragones"],
};
const otherFanfic = {
  title: "El torneo",
  description: "",
  author_username: "pedro",
  work_type: "fanfic",
  original_work: "harry potter ",
  tags: [],
};
const stories = [draco, original, otherFanfic];

describe("storyMatchesSearch", () => {
  it("busca en título, descripción y autor, sin importar tildes ni mayúsculas", () => {
    expect(storyMatchesSearch(draco, "ULTIMA sombra")).toBe(true);
    expect(storyMatchesSearch(original, "fantasia")).toBe(true);
    expect(storyMatchesSearch(original, "sofia")).toBe(true);
    expect(storyMatchesSearch(original, "vampiros")).toBe(false);
  });

  it("también encuentra por tropo y por fandom", () => {
    expect(storyMatchesSearch(draco, "enemies to lovers")).toBe(true);
    expect(storyMatchesSearch(draco, "harry potter")).toBe(true);
    expect(storyMatchesSearch(draco, "rowling")).toBe(true);
    expect(storyMatchesSearch(original, "enemies to lovers")).toBe(false);
  });

  it("sin texto, todas coinciden", () => {
    expect(stories.every((story) => storyMatchesSearch(story, "  "))).toBe(true);
    // Una historia sin etiquetas ni campos opcionales no rompe la búsqueda.
    expect(storyMatchesSearch({ title: "Sola" }, "sola")).toBe(true);
  });
});

describe("filtros por etiqueta y fandom", () => {
  it("la etiqueta debe coincidir completa, no solo en parte", () => {
    expect(storyHasTag(draco, "slow burn")).toBe(true);
    expect(storyHasTag(original, "SLOW BURN")).toBe(true);
    expect(storyHasTag(draco, "slow")).toBe(false);
    expect(storyHasTag(otherFanfic, "slow burn")).toBe(false);
    expect(storyHasTag(otherFanfic, "")).toBe(true);
  });

  it("el fandom solo existe en obras basadas en otra", () => {
    expect(storyFandom(draco)).toBe("Harry Potter");
    expect(storyFandom(original)).toBe("");
    expect(storyFandom({ work_type: "original", original_work: "Algo" })).toBe("");

    expect(storyHasFandom(draco, "harry potter")).toBe(true);
    expect(storyHasFandom(otherFanfic, "Harry Potter")).toBe(true);
    expect(storyHasFandom(original, "Harry Potter")).toBe(false);
    expect(storyHasFandom(original, "")).toBe(true);
  });
});

describe("tropos populares y lista de fandoms", () => {
  it("cuenta cada etiqueta una vez por historia y junta sus variantes", () => {
    expect(popularTags(stories)).toEqual([
      { name: "Slow Burn", count: 2 },
      { name: "dragones", count: 1 },
      { name: "enemies to lovers", count: 1 },
      { name: "magia", count: 1 },
    ]);
    expect(popularTags(stories, 1)).toHaveLength(1);
    expect(popularTags([{ tags: ["magia", "Magia", "MAGIA"] }])).toEqual([
      { name: "magia", count: 1 },
    ]);
  });

  it("agrupa los fandoms aunque estén escritos distinto", () => {
    expect(fandomList(stories)).toEqual([{ name: "Harry Potter", count: 2 }]);
    expect(fandomList([original])).toEqual([]);
  });
});

describe("feedFilterLink", () => {
  it("arma la dirección del inicio con el filtro", () => {
    expect(feedFilterLink({ tag: "slow burn" })).toBe("/?etiqueta=slow+burn");
    expect(feedFilterLink({ fandom: "Harry Potter" })).toBe("/?fandom=Harry+Potter");
    expect(feedFilterLink({})).toBe("/");
  });
});
