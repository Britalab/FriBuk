import { describe, expect, it } from "vitest";
import {
  CONTENT_WARNING_GROUPS,
  CONTENT_WARNINGS,
  contentWarningGroups,
  contentWarningLabels,
} from "./contentWarnings";

describe("advertencias de contenido", () => {
  it("no repite valores ni nombres", () => {
    const values = CONTENT_WARNINGS.map(({ value }) => value);
    const labels = CONTENT_WARNINGS.map(({ label }) => label);

    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("ofrece las doce advertencias actuales, en cinco grupos", () => {
    expect(CONTENT_WARNING_GROUPS.map((group) => group.title)).toEqual([
      "Violencia", "Contenido sexual", "Salud mental", "Sustancias", "Otros",
    ]);
    expect(CONTENT_WARNING_GROUPS.flatMap((group) => group.warnings)).toHaveLength(12);
  });

  it("no ofrece las antiguas a una historia nueva", () => {
    const offered = contentWarningGroups([])
      .flatMap((group) => group.warnings)
      .map(({ value }) => value);

    expect(offered).not.toContain("sensitive_topics");
    expect(offered).not.toContain("violence");
    expect(contentWarningGroups(null)).toBe(CONTENT_WARNING_GROUPS);
  });

  it("deja quitar una antigua a la historia que ya la tenía", () => {
    const groups = contentWarningGroups(["sensitive_topics", "explicit_sex"]);
    const last = groups[groups.length - 1];

    expect(last.title).toBe("Anteriores");
    expect(last.warnings).toEqual([
      { value: "sensitive_topics", label: "Temas sensibles" },
    ]);
  });

  it("nombra las advertencias guardadas, también las antiguas", () => {
    expect(
      contentWarningLabels(["sensitive_topics", "strong_language", "explicit_sex"])
    ).toEqual(["Contenido sexual explícito", "Lenguaje fuerte", "Temas sensibles"]);
    expect(contentWarningLabels(["desconocida"])).toEqual([]);
    expect(contentWarningLabels(null)).toEqual([]);
  });
});
