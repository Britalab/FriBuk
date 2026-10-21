import { describe, expect, it } from "vitest";
import { isSensitiveUrl } from "./metaPixel";

describe("isSensitiveUrl", () => {
  it("no deja pasar los enlaces con códigos de acceso", () => {
    expect(isSensitiveUrl({ pathname: "/restablecer" })).toBe(true);
    expect(isSensitiveUrl({ pathname: "/", hash: "#access_token=abc&type=signup" })).toBe(true);
    expect(isSensitiveUrl({ pathname: "/", search: "?token_hash=abc&type=email" })).toBe(true);
    expect(isSensitiveUrl({ pathname: "/login", search: "?code=abc" })).toBe(true);
  });

  it("deja pasar las páginas normales y los enlaces de los anuncios", () => {
    expect(isSensitiveUrl({ pathname: "/" })).toBe(false);
    expect(isSensitiveUrl({ pathname: "/stories/1", search: "?utm_source=meta&utm_campaign=lectores" })).toBe(false);
    expect(isSensitiveUrl({ pathname: "/forum", search: "?barcode=1" })).toBe(false);
  });
});
