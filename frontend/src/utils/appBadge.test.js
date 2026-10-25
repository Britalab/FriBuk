import { afterEach, describe, expect, it, vi } from "vitest";
import { closeShownNotifications, isNotificationTag, updateAppBadge } from "./appBadge";

describe("closeShownNotifications", () => {
  afterEach(() => {
    delete navigator.serviceWorker;
  });

  function showNotifications(tags) {
    const shown = tags.map((tag) => ({ tag, close: vi.fn() }));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ getNotifications: () => Promise.resolve(shown) }) },
    });
    return shown;
  }

  it("quita solo los avisos que coinciden", async () => {
    const [notification, message] = showNotifications(["notificacion-1", "mensaje-2"]);

    await closeShownNotifications(isNotificationTag);

    expect(notification.close).toHaveBeenCalled();
    expect(message.close).not.toHaveBeenCalled();
  });

  it("sin filtro quita todos", async () => {
    const shown = showNotifications(["notificacion-1", "mensaje-2", ""]);

    await closeShownNotifications();

    shown.forEach((notification) => expect(notification.close).toHaveBeenCalled());
  });

  it("no falla sin service worker", async () => {
    await expect(closeShownNotifications()).resolves.toBeUndefined();
  });
});

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
