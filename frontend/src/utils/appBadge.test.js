import { afterEach, describe, expect, it, vi } from "vitest";
import { updateAppBadge } from "./appBadge";

describe("updateAppBadge", () => {
  afterEach(() => {
    delete navigator.setAppBadge;
    delete navigator.clearAppBadge;
  });

  it("muestra el número cuando hay pendientes y lo quita cuando no", () => {
    navigator.setAppBadge = vi.fn(() => Promise.resolve());
    navigator.clearAppBadge = vi.fn(() => Promise.resolve());

    updateAppBadge(3);
    expect(navigator.setAppBadge).toHaveBeenCalledWith(3);

    updateAppBadge(0);
    expect(navigator.clearAppBadge).toHaveBeenCalled();
  });

  it("no falla si el sistema lo rechaza o no lo admite", async () => {
    expect(() => updateAppBadge(2)).not.toThrow();

    navigator.setAppBadge = vi.fn(() => Promise.reject(new Error("sin permiso")));
    navigator.clearAppBadge = vi.fn();
    updateAppBadge(2);
    await Promise.resolve();
  });
});
