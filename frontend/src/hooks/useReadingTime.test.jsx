import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useReadingTime from "./useReadingTime";

const post = vi.fn();
vi.mock("../api/client", () => ({ default: { post: (...args) => post(...args) } }));

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset();
  post.mockResolvedValue({ data: { completed: false } });
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useReadingTime", () => {
  it("avisa cada 30 segundos el tiempo leído", () => {
    renderHook(() => useReadingTime({ chapterId: "c1", enabled: true, endRef: { current: null } }));

    vi.advanceTimersByTime(30_000);

    expect(post).toHaveBeenCalledWith("/chapters/c1/reading", { seconds: 30, reached_end: false });
  });

  it("no cuenta con la pestaña oculta", () => {
    renderHook(() => useReadingTime({ chapterId: "c1", enabled: true, endRef: { current: null } }));
    setVisibility("hidden");

    vi.advanceTimersByTime(30_000);

    expect(post).not.toHaveBeenCalled();
  });

  it("no cuenta sin actividad durante más de 2 minutos", () => {
    renderHook(() => useReadingTime({ chapterId: "c1", enabled: true, endRef: { current: null } }));

    vi.advanceTimersByTime(150_000);
    post.mockClear();
    vi.advanceTimersByTime(30_000);

    expect(post).not.toHaveBeenCalled();
  });

  it("sin sesión no registra nada", () => {
    renderHook(() => useReadingTime({ chapterId: "c1", enabled: false, endRef: { current: null } }));

    vi.advanceTimersByTime(60_000);

    expect(post).not.toHaveBeenCalled();
  });
});
