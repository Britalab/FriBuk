import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import UpdateNotice from "./UpdateNotice";
import { hasNewVersion } from "../utils/appVersion";

function response(body, ok = true) {
  return { ok, json: async () => body };
}

describe("hasNewVersion", () => {
  it("detecta una versión publicada distinta de la cargada", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ version: "nueva" }));

    expect(await hasNewVersion("actual", fetchImpl)).toBe(true);
    // Se pide sin usar copias guardadas.
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^\/version\.json\?t=\d+$/);
    expect(fetchImpl.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });

  it("no avisa si la versión es la misma", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ version: "actual" }));

    expect(await hasNewVersion("actual", fetchImpl)).toBe(false);
  });

  it("ante cualquier duda, no avisa", async () => {
    const offline = vi.fn().mockRejectedValue(new Error("sin red"));
    const missing = vi.fn().mockResolvedValue(response({}, false));
    const malformed = vi.fn().mockResolvedValue(response({ version: 42 }));
    const empty = vi.fn().mockResolvedValue(response({ version: "" }));

    expect(await hasNewVersion("actual", offline)).toBe(false);
    expect(await hasNewVersion("actual", missing)).toBe(false);
    expect(await hasNewVersion("actual", malformed)).toBe(false);
    expect(await hasNewVersion("actual", empty)).toBe(false);
  });

  it("en desarrollo, sin versión propia, ni siquiera consulta", async () => {
    const fetchImpl = vi.fn();

    expect(await hasNewVersion("", fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("UpdateNotice", () => {
  async function returnToTab() {
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
  }

  it("no muestra nada mientras no haya una versión nueva", async () => {
    const check = vi.fn().mockResolvedValue(false);
    const { container } = render(
      <UpdateNotice currentVersion="actual" checkForUpdate={check} />
    );

    await returnToTab();

    expect(check).toHaveBeenCalledWith("actual");
    expect(container.textContent).toBe("");
  });

  it("avisa al volver a la pestaña si se publicó una versión nueva", async () => {
    const check = vi.fn().mockResolvedValue(true);
    render(<UpdateNotice currentVersion="actual" checkForUpdate={check} />);

    await returnToTab();

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Hay una versión nueva de FriBuk.");
    // No recarga sola: ofrece el botón y avisa de guardar antes.
    expect(notice.textContent).toContain("guárdalo antes de recargar");
    expect(screen.getByRole("button", { name: "Recargar" })).not.toBeNull();
  });

  it("se puede cerrar sin recargar", async () => {
    const check = vi.fn().mockResolvedValue(true);
    const { container } = render(
      <UpdateNotice currentVersion="actual" checkForUpdate={check} />
    );

    await returnToTab();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    expect(container.textContent).toBe("");
  });

  it("en desarrollo no consulta nada", async () => {
    const check = vi.fn();
    render(<UpdateNotice currentVersion="" checkForUpdate={check} />);

    await returnToTab();

    expect(check).not.toHaveBeenCalled();
  });
});
