import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CoverImage from "./CoverImage";

const COVER = "https://x.supabase.co/storage/v1/object/public/story-covers/u1/abc.jpg";

describe("CoverImage", () => {
  it("pide la miniatura con carga diferida", () => {
    render(<CoverImage src={COVER} alt="Portada" />);
    const image = screen.getByAltText("Portada");
    expect(image.getAttribute("src")).toBe(COVER.replace(".jpg", "-thumb.jpg"));
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("usa la portada completa si no hay miniatura", () => {
    render(<CoverImage src={COVER} alt="Portada" />);
    const image = screen.getByAltText("Portada");
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe(COVER);
    // Si la portada completa también falla, no vuelve a intentar.
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe(COVER);
  });
});
