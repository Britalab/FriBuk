import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ReaderCommentHint from "./ReaderCommentHint";

const hint = () => screen.queryByRole("status");

describe("ReaderCommentHint", () => {
  beforeEach(() => localStorage.clear());

  it("sale una sola vez", () => {
    const first = render(<ReaderCommentHint dismissed={false} />);
    expect(hint()).not.toBeNull();
    first.unmount();

    render(<ReaderCommentHint dismissed={false} />);
    expect(hint()).toBeNull();
  });

  it("se cierra con la equis", () => {
    render(<ReaderCommentHint dismissed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(hint()).toBeNull();
  });

  it("se cierra al comentar un párrafo y no vuelve", () => {
    const { rerender } = render(<ReaderCommentHint dismissed={false} />);
    rerender(<ReaderCommentHint dismissed />);
    expect(hint()).toBeNull();
    rerender(<ReaderCommentHint dismissed={false} />);
    expect(hint()).toBeNull();
  });
});
