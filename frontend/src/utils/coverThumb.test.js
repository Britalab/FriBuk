import { describe, expect, it } from "vitest";
import { coverThumbUrl } from "./coverThumb";

const BASE = "https://x.supabase.co/storage/v1/object/public/story-covers";

describe("coverThumbUrl", () => {
  it("cambia la extensión por -thumb.jpg", () => {
    expect(coverThumbUrl(`${BASE}/u1/abc.jpg`)).toBe(`${BASE}/u1/abc-thumb.jpg`);
    expect(coverThumbUrl(`${BASE}/u1/abc.png?v=2`)).toBe(`${BASE}/u1/abc-thumb.jpg`);
  });

  it("deja igual lo que no es una portada subida", () => {
    expect(coverThumbUrl("/logo-fribuk.jpg")).toBe("/logo-fribuk.jpg");
    expect(coverThumbUrl(null)).toBe(null);
  });
});
