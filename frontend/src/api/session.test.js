import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_EXPIRED_EVENT,
  clearSession,
  getAccessToken,
  getRefreshToken,
  isTokenExpiring,
  refreshSession,
  storeSession,
  tokenExpiry,
} from "./session";

// Token con el formato de uno real: solo importa su fecha de vencimiento.
function tokenExpiringAt(seconds) {
  const payload = btoa(JSON.stringify({ exp: seconds }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `cabecera.${payload}.firma`;
}

const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

beforeEach(() => {
  localStorage.clear();
});

describe("vencimiento del token", () => {
  it("lee la fecha de vencimiento del token", () => {
    expect(tokenExpiry(tokenExpiringAt(NOW_SECONDS + 3600))).toBe(NOW_SECONDS + 3600);
    expect(tokenExpiry("no-es-un-token")).toBeNull();
    expect(tokenExpiry("")).toBeNull();
  });

  it("considera por vencer un token al que le queda menos de un minuto", () => {
    expect(isTokenExpiring(tokenExpiringAt(NOW_SECONDS + 3600), NOW_MS)).toBe(false);
    expect(isTokenExpiring(tokenExpiringAt(NOW_SECONDS + 30), NOW_MS)).toBe(true);
    expect(isTokenExpiring(tokenExpiringAt(NOW_SECONDS - 500), NOW_MS)).toBe(true);
    // Si no se puede leer, no se asume nada: decide el servidor.
    expect(isTokenExpiring("no-es-un-token", NOW_MS)).toBe(false);
  });
});

describe("refreshSession", () => {
  it("guarda la sesión nueva y devuelve el token de acceso", async () => {
    storeSession({ access_token: "viejo", refresh_token: "renovacion-1" });
    const request = vi.fn().mockResolvedValue({
      access_token: "nuevo",
      refresh_token: "renovacion-2",
    });

    const token = await refreshSession(request);

    expect(token).toBe("nuevo");
    expect(request).toHaveBeenCalledWith("renovacion-1");
    expect(getAccessToken()).toBe("nuevo");
    expect(getRefreshToken()).toBe("renovacion-2");
  });

  it("varias peticiones a la vez comparten una sola renovación", async () => {
    storeSession({ access_token: "viejo", refresh_token: "renovacion-1" });
    const request = vi.fn().mockResolvedValue({
      access_token: "nuevo",
      refresh_token: "renovacion-2",
    });

    const tokens = await Promise.all([
      refreshSession(request),
      refreshSession(request),
      refreshSession(request),
    ]);

    expect(tokens).toEqual(["nuevo", "nuevo", "nuevo"]);
    expect(request).toHaveBeenCalledTimes(1);

    // Terminada la primera, una renovación posterior vuelve a llamar.
    await refreshSession(request);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("sin token de renovación no llama al backend", async () => {
    storeSession({ access_token: "viejo" });
    const request = vi.fn();

    expect(await refreshSession(request)).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("viejo");
  });

  it("si la renovación ya no es válida, cierra la sesión y avisa", async () => {
    storeSession({ access_token: "viejo", refresh_token: "renovacion-vencida" });
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    const token = await refreshSession(
      vi.fn().mockRejectedValue({ response: { status: 401 } })
    );

    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
    expect(token).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("un fallo de red no cierra la sesión", async () => {
    storeSession({ access_token: "viejo", refresh_token: "renovacion-1" });
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    const offline = await refreshSession(vi.fn().mockRejectedValue(new Error("sin red")));
    const serverDown = await refreshSession(
      vi.fn().mockRejectedValue({ response: { status: 503 } })
    );

    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
    expect(offline).toBeNull();
    expect(serverDown).toBeNull();
    expect(getAccessToken()).toBe("viejo");
    expect(getRefreshToken()).toBe("renovacion-1");
    expect(expired).not.toHaveBeenCalled();
  });

  it("cerrar sesión borra los dos tokens", () => {
    storeSession({ access_token: "a", refresh_token: "b" });
    clearSession();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
