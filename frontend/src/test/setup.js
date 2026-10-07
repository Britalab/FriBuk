// Preparación común de las pruebas del frontend (Vitest + jsdom).
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom no trae estas funciones del navegador.
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
