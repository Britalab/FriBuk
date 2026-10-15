import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommentThread } from "./ChapterCommentsPanel";

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const root = {
  id: "c1", user_id: "u1", username: "Paulina", content: "Me encantó",
  created_at: "2026-10-15T00:00:00Z", reactions: [], is_own: false,
};
const reply = {
  ...root, id: "r1", parent_id: "c1", user_id: "u2", username: "brity", content: "¡Gracias!",
};

function renderThread(actions = { createReply: vi.fn(async () => {}) }, path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <CommentThread comment={root} replies={[reply]} actions={actions} isAuthenticated />
    </MemoryRouter>
  );
  return actions;
}

describe("CommentThread", () => {
  it("se puede contestar una respuesta: nombra a quien la escribió", async () => {
    const actions = renderThread();

    const buttons = screen.getAllByRole("button", { name: "Responder" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    const field = screen.getByLabelText("Responder a brity");
    expect(field.value).toBe("@brity ");

    fireEvent.change(field, { target: { value: "@brity ¡De nada!" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Responder" }).at(-1));

    // La respuesta se agrega a la misma conversación, sin anidar.
    await waitFor(() =>
      expect(actions.createReply).toHaveBeenCalledWith("c1", "@brity ¡De nada!")
    );
  });

  it("contestar el comentario principal empieza vacío", () => {
    renderThread();

    fireEvent.click(screen.getAllByRole("button", { name: "Responder" })[0]);
    expect(screen.getByLabelText("Responder a Paulina").value).toBe("");
  });

  it("marca el comentario con su id para poder abrirlo desde un aviso", () => {
    renderThread(undefined, "/?comentario=r1");
    expect(document.querySelector('[data-comment-id="r1"]')).not.toBeNull();
  });
});
