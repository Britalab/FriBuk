import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PushSettings from "./PushSettings";
import { keyToBytes } from "../utils/push";
import api from "../api/client";

const showToast = vi.fn();
vi.mock("../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../api/client", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

let subscription;
const pushManager = {
  getSubscription: vi.fn(async () => subscription),
  subscribe: vi.fn(async () => {
    subscription = {
      endpoint: "https://push.example.com/abc",
      toJSON: () => ({ endpoint: "https://push.example.com/abc", keys: { p256dh: "k", auth: "a" } }),
      unsubscribe: vi.fn(async () => {
        subscription = null;
      }),
    };
    return subscription;
  }),
};

function setBrowser({ permission = "default", requestResult = "granted" } = {}) {
  window.PushManager = function PushManager() {};
  window.Notification = {
    permission,
    requestPermission: vi.fn(async () => {
      window.Notification.permission = requestResult;
      return requestResult;
    }),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn(async () => ({ pushManager })),
      register: vi.fn(),
      ready: Promise.resolve({ pushManager }),
    },
    configurable: true,
  });
}

beforeEach(() => {
  subscription = null;
  showToast.mockClear();
  api.get.mockResolvedValue({ data: { public_key: "AQAB" } });
  api.post.mockResolvedValue({ data: {} });
});

afterEach(() => {
  delete window.PushManager;
  delete window.Notification;
  delete navigator.serviceWorker;
  vi.clearAllMocks();
});

describe("PushSettings", () => {
  it("activa los avisos y guarda la suscripción del dispositivo", async () => {
    setBrowser();
    render(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Activar avisos" }));

    await screen.findByRole("button", { name: "Desactivar avisos" });
    expect(window.Notification.requestPermission).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith("/push/subscriptions", {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "k", auth: "a" },
    });
  });

  it("desactiva los avisos en este dispositivo", async () => {
    setBrowser({ permission: "granted" });
    await pushManager.subscribe();
    const current = subscription;
    render(<PushSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Desactivar avisos" }));

    await screen.findByRole("button", { name: "Activar avisos" });
    expect(api.post).toHaveBeenCalledWith("/push/unsubscribe", {
      endpoint: "https://push.example.com/abc",
    });
    expect(current.unsubscribe).toHaveBeenCalled();
  });

  it("explica cómo reactivarlos si se bloquearon", async () => {
    setBrowser({ permission: "denied" });
    render(<PushSettings />);

    expect(await screen.findByText(/Bloqueaste los avisos/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("no muestra nada si el servidor aún no tiene claves", async () => {
    setBrowser();
    api.get.mockResolvedValue({ data: { public_key: null } });
    const { container } = render(<PushSettings />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});

describe("keyToBytes", () => {
  it("convierte la clave en base64 URL a bytes", () => {
    expect(Array.from(keyToBytes("AQAB"))).toEqual([1, 0, 1]);
    expect(Array.from(keyToBytes("-_8"))).toEqual([251, 255]);
  });
});
