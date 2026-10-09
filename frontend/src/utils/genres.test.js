import { describe, expect, it } from "vitest";
import { GENRES, genreOptions } from "./genres";

describe("GENRES", () => {
  it("no tiene géneros repetidos", () => {
    const normalized = GENRES.map((genre) => genre.toLowerCase());
    expect(new Set(normalized).size).toBe(GENRES.length);
  });

  it("empieza por los géneros que el inicio muestra como botones", () => {
    expect(GENRES.slice(0, 3)).toEqual(["Romance", "Fantasía", "Romantasy"]);
    expect(GENRES).toContain("Fanfiction");
    expect(GENRES).toContain("Otro");
  });
});

describe("genreOptions", () => {
  it("ofrece la lista del sitio para una historia nueva", () => {
    expect(genreOptions("")).toBe(GENRES);
    expect(genreOptions(null)).toBe(GENRES);
    expect(genreOptions("Romance")).toBe(GENRES);
    // Las mayúsculas no cuentan como un género distinto.
    expect(genreOptions("romance")).toBe(GENRES);
  });

  it("conserva un género antiguo escrito a mano para no perderlo al editar", () => {
    const options = genreOptions("  Novela gráfica ");

    expect(options[0]).toBe("Novela gráfica");
    expect(options).toHaveLength(GENRES.length + 1);
  });
});
