import { describe, expect, it } from "vitest";
import { coverCrop, profileUrl } from "./profileQr";

describe("profileUrl", () => {
  it("lleva al perfil público, que no cambia aunque cambie el nombre de usuario", () => {
    expect(profileUrl("https://www.fribuk.com", "abc-123")).toBe(
      "https://www.fribuk.com/usuario/abc-123"
    );
  });
});

describe("coverCrop", () => {
  it("recorta al centro el lado más largo", () => {
    expect(coverCrop(220, 300)).toEqual({ x: 0, y: 40, side: 220 });
    expect(coverCrop(400, 200)).toEqual({ x: 100, y: 0, side: 200 });
    expect(coverCrop(512, 512)).toEqual({ x: 0, y: 0, side: 512 });
  });
});
