import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareButton from "./ShareButton";

const showToast = vi.fn();
vi.mock("../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const STORY_URL = `${window.location.origin}/stories/abc`;

function setDevice({ touch, share, writeText }) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: touch });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

function clickShare() {
  render(<ShareButton path="/stories/abc" title="Mi historia" text="«Mi historia» en FriBuk" />);
  fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
}

beforeEach(() => {
  showToast.mockClear();
});

afterEach(() => {
  delete window.matchMedia;
  delete navigator.share;
  delete navigator.clipboard;
});

describe("ShareButton", () => {
  it("en el teléfono abre el menú de compartir del sistema", async () => {
    const share = vi.fn().mockResolvedValue();
    const writeText = vi.fn();
    setDevice({ touch: true, share, writeText });

    clickShare();

    await waitFor(() => expect(share).toHaveBeenCalledWith({
      title: "Mi historia",
      text: "«Mi historia» en FriBuk",
      url: STORY_URL,
    }));
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("cerrar el menú sin compartir no copia ni avisa nada", async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error("cancelado"), { name: "AbortError" })
    );
    const writeText = vi.fn();
    setDevice({ touch: true, share, writeText });

    clickShare();

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("en el computador copia el enlace y lo avisa", async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue();
    setDevice({ touch: false, share, writeText });

    clickShare();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(STORY_URL));
    expect(share).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Enlace copiado"));
  });

  it("si el menú del sistema falla, copia el enlace", async () => {
    const share = vi.fn().mockRejectedValue(new Error("no disponible"));
    const writeText = vi.fn().mockResolvedValue();
    setDevice({ touch: true, share, writeText });
    vi.spyOn(console, "error").mockImplementation(() => {});

    clickShare();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(STORY_URL));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Enlace copiado"));
  });

  it("si no se puede copiar, lo dice", async () => {
    setDevice({ touch: false, share: undefined, writeText: null });
    document.execCommand = vi.fn().mockReturnValue(false);

    clickShare();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("No se pudo copiar"),
      "error"
    ));
    delete document.execCommand;
  });
});
