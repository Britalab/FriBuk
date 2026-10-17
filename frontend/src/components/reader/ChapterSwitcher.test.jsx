import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ChapterSwitcher from "./ChapterSwitcher";

const CHAPTERS = [
  { id: "c1", title: "El comienzo" },
  { id: "c2", title: "La tormenta" },
  { id: "c3", title: "El regreso" },
];

function renderSwitcher(currentIndex) {
  render(
    <MemoryRouter>
      <ChapterSwitcher storyId="s1" chapters={CHAPTERS} currentIndex={currentIndex} />
    </MemoryRouter>
  );
}

describe("ChapterSwitcher", () => {
  it("lleva al capítulo anterior y al siguiente", () => {
    renderSwitcher(1);

    expect(
      screen.getByRole("link", { name: "Capítulo anterior: El comienzo" })
    ).toHaveProperty("pathname", "/stories/s1/chapters/c1");
    expect(
      screen.getByRole("link", { name: "Capítulo siguiente: El regreso" })
    ).toHaveProperty("pathname", "/stories/s1/chapters/c3");
  });

  it("en el primer capítulo no ofrece volver atrás", () => {
    renderSwitcher(0);

    expect(screen.queryByRole("link", { name: /Capítulo anterior/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Capítulo siguiente/ })).toBeTruthy();
  });

  it("abre el índice con el capítulo actual marcado y se cierra con Escape", () => {
    Element.prototype.scrollIntoView = () => {};
    renderSwitcher(1);

    const toggle = screen.getByRole("button", { name: /2 de 3/ });
    fireEvent.click(toggle);

    const index = screen.getByRole("navigation", { name: "Índice de capítulos" });
    const links = index.querySelectorAll("a");
    expect(links).toHaveLength(3);
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Índice de capítulos" })).toBeNull();
  });
});
