// Pruebas de las dos pantallas para recuperar la contraseña. El backend se
// reemplaza por respuestas simuladas.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../api/client";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

vi.mock("../api/client", () => ({
  default: { post: vi.fn() },
}));

const showToast = vi.fn();
vi.mock("../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const logout = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ logout }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  useNavigate: () => navigate,
}));

function renderInRouter(element) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

function openLink(hash) {
  window.history.replaceState(null, "", `/restablecer${hash}`);
  return renderInRouter(<ResetPassword />);
}

function fillPasswords(first, second) {
  fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
    target: { value: first },
  });
  fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
    target: { value: second },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("ForgotPassword", () => {
  it("pide el enlace y muestra el mensaje del backend", async () => {
    api.post.mockResolvedValue({
      data: { message: "Si ese correo tiene una cuenta, te enviamos un enlace." },
    });
    renderInRouter(<ForgotPassword />);

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "  ana@example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/password-recovery", {
        email: "ana@example.com",
      })
    );
    expect(
      (await screen.findByRole("status")).textContent
    ).toBe("Si ese correo tiene una cuenta, te enviamos un enlace.");
    // Enviado el enlace, el formulario ya no se muestra.
    expect(screen.queryByRole("button", { name: "Enviar enlace" })).toBeNull();
  });

  it("muestra el motivo cuando hay demasiados intentos", async () => {
    api.post.mockRejectedValue({
      response: { status: 429, data: { detail: "Pediste el enlace demasiadas veces." } },
    });
    renderInRouter(<ForgotPassword />);

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Pediste el enlace demasiadas veces."
    );
  });
});

describe("ResetPassword", () => {
  it("con el código del enlace cambia la contraseña al enviar el formulario", async () => {
    api.post.mockResolvedValue({ data: { message: "Tu contraseña se cambió." } });
    openLink("?token_hash=codigo-del-correo&type=recovery");

    // Abrir la página no gasta el código: no se llama al backend todavía.
    expect(screen.getByLabelText("Contraseña nueva")).not.toBeNull();
    expect(api.post).not.toHaveBeenCalled();

    fillPasswords("clave-nueva-123", "clave-nueva-123");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/password-update", {
        token_hash: "codigo-del-correo",
        password: "clave-nueva-123",
      })
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/login", { replace: true })
    );
  });

  it("un código que no es de recuperación no muestra el formulario", () => {
    openLink("?token_hash=codigo-de-registro&type=signup");

    expect(screen.queryByLabelText("Contraseña nueva")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("ya no es válido");
  });

  it("con un enlace del formato anterior también cambia la contraseña", async () => {
    api.post.mockResolvedValue({ data: { message: "Tu contraseña se cambió." } });
    openLink("#access_token=token-de-recuperacion&type=recovery&refresh_token=x");

    // El token no queda a la vista en la dirección.
    expect(window.location.hash).toBe("");

    fillPasswords("clave-nueva-123", "clave-nueva-123");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/password-update", {
        access_token: "token-de-recuperacion",
        password: "clave-nueva-123",
      })
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/login", { replace: true })
    );
    expect(logout).toHaveBeenCalled();
  });

  it("no envía nada si la contraseña es corta o no coincide", () => {
    openLink("#access_token=token-de-recuperacion&type=recovery");

    fillPasswords("corta", "corta");
    expect(screen.getByRole("alert").textContent).toContain("al menos 8 caracteres");

    fillPasswords("clave-nueva-123", "clave-distinta-456");
    expect(screen.getByRole("alert").textContent).toContain("no coinciden");

    expect(api.post).not.toHaveBeenCalled();
  });

  it("sin enlace válido no muestra el formulario y ofrece pedir otro", () => {
    for (const hash of [
      "",
      "#access_token=token-normal&type=signup",
      "#error=access_denied&error_code=otp_expired",
    ]) {
      const { unmount } = openLink(hash);

      expect(screen.queryByLabelText("Contraseña nueva")).toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("ya no es válido");
      expect(
        screen.getByRole("link", { name: "Pedir un enlace nuevo" }).getAttribute("href")
      ).toBe("/recuperar");
      unmount();
    }
  });

  it("si el backend rechaza el enlace, lo avisa y ofrece pedir otro", async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { detail: "El enlace ya no es válido." } },
    });
    openLink("#access_token=token-vencido&type=recovery");

    fillPasswords("clave-nueva-123", "clave-nueva-123");

    expect(await screen.findByRole("link", { name: "Pedir un enlace nuevo" })).not.toBeNull();
    expect(screen.queryByLabelText("Contraseña nueva")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
