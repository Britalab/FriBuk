import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InstallBanner from "./InstallBanner";
import {
  detectPlatform,
  dismissInstall,
  isInstallDismissed,
  openInChromeLink,
} from "../utils/installApp";

const showToast = vi.fn();
vi.mock("../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it("reconoce cada tipo de dispositivo", () => {
    expect(detectPlatform({ userAgent: IPHONE })).toBe("ios");
    expect(detectPlatform({ userAgent: ANDROID })).toBe("android");
    expect(detectPlatform({ userAgent: WINDOWS })).toBe("desktop");
  });

  it("un iPad que se presenta como Mac sigue siendo iOS", () => {
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";

    expect(detectPlatform({ userAgent: ipad, maxTouchPoints: 5 })).toBe("ios");
    expect(detectPlatform({ userAgent: ipad, maxTouchPoints: 0 })).toBe("desktop");
  });

  it("distingue el navegador que viene dentro de otra app", () => {
    expect(detectPlatform({ userAgent: `${ANDROID} Instagram 350.0.0.0` })).toBe("in-app-android");
    expect(detectPlatform({ userAgent: `${IPHONE} [FBAN/FBIOS;FBAV/480.0]` })).toBe("in-app-ios");
    expect(detectPlatform({ userAgent: `${ANDROID} musical_ly_2023 BytedanceWebview` })).toBe("in-app-android");
  });

  it("si ya se abrió como app, está instalada", () => {
    expect(detectPlatform({ userAgent: ANDROID, standalone: true })).toBe("installed");
  });
});

describe("openInChromeLink", () => {
  it("conserva la página y deja la dirección normal como respaldo", () => {
    const link = openInChromeLink("https://www.fribuk.com/stories/abc?x=1");

    expect(link).toMatch(/^intent:\/\/www\.fribuk\.com\/stories\/abc\?x=1#Intent;scheme=https;package=com\.android\.chrome;/);
    expect(link).toContain(
      `S.browser_fallback_url=${encodeURIComponent("https://www.fribuk.com/stories/abc?x=1")};end`
    );
  });
});

describe("recordar que se cerró la invitación", () => {
  beforeEach(() => localStorage.clear());

  it("dura un mes", () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    expect(isInstallDismissed(now)).toBe(false);
    dismissInstall(now);
    expect(isInstallDismissed(now + 29 * day)).toBe(true);
    expect(isInstallDismissed(now + 31 * day)).toBe(false);
  });
});

describe("InstallBanner", () => {
  function setDevice({ userAgent, touch = true }) {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    window.matchMedia = vi.fn((query) => ({
      matches: query === "(pointer: coarse)" ? touch : false,
    }));
  }

  function renderAt(path) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <InstallBanner />
      </MemoryRouter>
    );
  }

  // Lo que Chrome avisa en Android cuando el sitio se puede instalar.
  function offerInstall(outcome = "accepted") {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  }

  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    showToast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
  });

  it("en iPhone lleva a los pasos de instalación", () => {
    setDevice({ userAgent: IPHONE });
    renderAt("/");

    expect(screen.getByRole("link", { name: "Ver cómo" }).getAttribute("href")).toBe("/instalar");
  });

  it("dentro de Instagram en Android ofrece abrir Chrome", () => {
    setDevice({ userAgent: `${ANDROID} Instagram 350.0.0.0` });
    renderAt("/stories/abc");

    expect(screen.getByRole("link", { name: "Abrir en Chrome" }).getAttribute("href"))
      .toMatch(/^intent:\/\//);
  });

  it("no aparece en el computador ni mientras se lee un capítulo", () => {
    setDevice({ userAgent: WINDOWS, touch: false });
    const desktop = renderAt("/");
    expect(desktop.container.innerHTML).toBe("");
    desktop.unmount();

    setDevice({ userAgent: IPHONE });
    expect(renderAt("/stories/abc/chapters/1").container.innerHTML).toBe("");
  });

  it("al cerrarla no vuelve a aparecer", () => {
    setDevice({ userAgent: IPHONE });
    const first = renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar invitación" }));
    expect(first.container.innerHTML).toBe("");
    first.unmount();

    expect(renderAt("/").container.innerHTML).toBe("");
  });

  it("en Android instala con un toque cuando el navegador lo permite", async () => {
    setDevice({ userAgent: ANDROID });
    const view = renderAt("/");
    // Sin el aviso del navegador no hay nada que ofrecer.
    expect(view.container.innerHTML).toBe("");

    const event = offerInstall();
    fireEvent.click(screen.getByRole("button", { name: "Instalar" }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalled());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("instalada")
    ));
    // El aviso ya se usó: la invitación desaparece.
    expect(view.container.innerHTML).toBe("");
  });
});
