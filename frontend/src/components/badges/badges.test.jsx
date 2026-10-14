import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthorTitle, { FeaturedStoryChip } from "./AuthorTitle";
import AchievementsPanel from "./AchievementsPanel";

const put = vi.fn();
vi.mock("../../api/client", () => ({ default: { put: (...args) => put(...args) } }));

const fundador = { id: "autor_fundador", kind: "title", group: "escritor", name: "Autor Fundador", emoji: "💎", level: 1, level_label: null };
const constante = { id: "autor_constante", kind: "title", group: "escritor", name: "Autor Constante", emoji: "📚", level: 2, level_label: "II" };
const finalizada = { id: "historia_finalizada", kind: "insignia", group: "escritor", name: "Historia Finalizada", emoji: "📖", level: 1, level_label: "I" };

function panel(data) {
  return render(
    <MemoryRouter>
      <AchievementsPanel data={data} onChange={vi.fn()} />
    </MemoryRouter>
  );
}

describe("AuthorTitle", () => {
  it("muestra el título principal y despliega los demás con +N", () => {
    render(<AuthorTitle title={{ main_title: fundador, other_titles: [constante] }} />);

    expect(screen.getByText(/Autor Fundador/)).toBeTruthy();
    expect(screen.queryByText(/Autor Constante II/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ver 1 título más" }));

    expect(screen.getByText(/Autor Constante II/)).toBeTruthy();
  });

  it("no muestra nada sin título", () => {
    const { container } = render(<AuthorTitle title={{ main_title: null, other_titles: [] }} />);
    expect(container.textContent).toBe("");
  });

  it("los títulos temporales muestran su mes", () => {
    const popular = { id: "autor_popular", kind: "title", name: "Autor Popular", emoji: "❤️", level: 1, period: "oct 2026" };
    render(<AuthorTitle title={{ main_title: popular, other_titles: [] }} />);
    expect(screen.getByText(/Autor Popular \(oct 2026\)/)).toBeTruthy();
  });

  it("marca las historias destacadas", () => {
    render(<FeaturedStoryChip story={{ is_featured: true }} />);
    expect(screen.getByText(/Historia Destacada/)).toBeTruthy();
  });
});

describe("AchievementsPanel", () => {
  it("si nunca publicó, oculta las insignias de escritor e invita a escribir", () => {
    panel({
      has_published: false,
      catalog: [
        { ...fundador, earned: false, level: 0 },
        { ...finalizada, earned: false, level: 0, progress: { current: 0, next: 1 } },
      ],
      featured: [],
      display: { main_title: null, featured: [] },
      founders: { author: { total: 100, taken: 3, remaining: 97 } },
    });

    expect(screen.getByText(/Publica tu primera historia/)).toBeTruthy();
    expect(screen.queryByText("Historia Finalizada")).toBeNull();
    expect(screen.queryByText(/Autor Fundador/)).toBeNull();
  });

  it("muestra el progreso, lo no ganado y los cupos de fundador", () => {
    panel({
      has_published: true,
      catalog: [
        { ...fundador, earned: false, level: 0 },
        { ...finalizada, earned: true, progress: { current: 3, next: 5 } },
      ],
      featured: [finalizada],
      display: { main_title: null, featured: [] },
      founders: { author: { total: 100, taken: 3, remaining: 97 } },
    });

    expect(screen.getByText("3/5")).toBeTruthy();
    expect(screen.getByText(/sin ganar/)).toBeTruthy();
    expect(screen.getByText("Quedan 97 de 100 cupos.")).toBeTruthy();
  });

  it("guarda las insignias destacadas", async () => {
    put.mockResolvedValue({ data: { featured: [] } });
    panel({
      has_published: true,
      catalog: [{ ...finalizada, earned: true, progress: { current: 1, next: 5 } }],
      featured: [finalizada],
      display: { main_title: null, featured: [] },
    });

    fireEvent.click(screen.getByLabelText("Destacar en mi perfil"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/me/badges/display", { main_title: null, featured: [] })
    );
  });

  it("muestra las insignias de lector aunque nunca haya publicado", () => {
    panel({
      has_published: false,
      catalog: [
        { id: "lector_fundador", kind: "title", group: "lector", name: "Lector Fundador", emoji: "💎", level: 0, earned: false },
        { id: "maratonista", kind: "insignia", group: "lector", name: "Maratonista", emoji: "🏃", level: 0, earned: false, progress: { current: 2, next: 5 } },
      ],
      featured: [],
      display: { main_title: null, featured: [] },
      founders: { reader: { total: 500, taken: 10, remaining: 490 } },
      reader_progress: { finished_stories: 1, visible_comments: 2, comments_needed: 3 },
    });

    expect(screen.getByText("Maratonista")).toBeTruthy();
    expect(screen.getByText("2/5")).toBeTruthy();
    expect(screen.getByText(/Quedan 490 de 500 cupos/)).toBeTruthy();
    expect(screen.getByText(/comentarios: 2\//)).toBeTruthy();
  });
});
