import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppPresence } from "./useAppPresence";
import api from "../api/client";

vi.mock("../api/client", () => ({
  default: { post: vi.fn(), defaults: { baseURL: "https://api.test" } },
}));
vi.mock("../api/session", () => ({ getAccessToken: () => "token" }));

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  api.post.mockResolvedValue({});
  globalThis.fetch = vi.fn(() => Promise.resolve({}));
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAppPresence", () => {
  it("avisa que está usando FriBuk al abrirla y cada 30 segundos", () => {
    renderHook(() => useAppPresence("u1"));
    expect(api.post).toHaveBeenCalledWith("/push/presence", { active: true });

    vi.advanceTimersByTime(30000);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("avisa al salir y deja de avisar mientras no está en pantalla", () => {
    renderHook(() => useAppPresence("u1"));
    setVisibility("hidden");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.test/push/presence",
      expect.objectContaining({ keepalive: true, body: JSON.stringify({ active: false }) })
    );
    vi.advanceTimersByTime(60000);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("sin sesión no avisa nada", () => {
    renderHook(() => useAppPresence(null));
    expect(api.post).not.toHaveBeenCalled();
  });
});
