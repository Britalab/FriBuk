// Pruebas de las pantallas de moderación. El backend se reemplaza por
// respuestas simuladas: aquí se comprueba qué se muestra y qué se envía;
// los permisos y los umbrales los hace cumplir y los prueba el backend.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../api/client";
import { RemoveButton, RestoreButton } from "./AdminModerationButtons";
import { ModerationNotice, MyModerationNotices } from "./ModerationNotices";
import ModerationPanel from "./ModerationPanel";
import ReportButton from "./ReportButton";

vi.mock("../../api/client", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const auth = { user: null };
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => auth,
}));

const READER = { id: "lector-id", username: "lector", is_admin: false };
const ADMIN = { id: "admin-id", username: "moderadora", is_admin: true };
const XSS_TEXT = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function renderInRouter(element) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

function moderationCase(overrides = {}) {
  return {
    id: "case-1",
    target_type: "forum_topic",
    target_label: "Tema del foro",
    target_id: "topic-1",
    link: "/forum/topic-1",
    status: "open",
    owner: { id: "autora-id", username: "autora" },
    content: { title: "Mi tema", text: "Contenido del tema", image_url: null },
    report_count: 3,
    reasons: [
      { reason: "sexual", label: "Contenido sexual", count: 2 },
      { reason: "other", label: "Otro", count: 1 },
    ],
    explanations: ["Mira la imagen"],
    last_report_at: new Date().toISOString(),
    removal: null,
    history: [],
    ...overrides,
  };
}

beforeEach(() => {
  auth.user = READER;
  api.post.mockResolvedValue({ data: { message: "Gracias. Recibimos tu reporte." } });
});

describe("ReportButton", () => {
  it("pide un motivo y envía el reporte una sola vez", async () => {
    render(<ReportButton targetType="forum_topic" targetId="topic-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Reportar/ }));

    const dialog = screen.getByRole("dialog", { name: "Reportar contenido" });
    expect(dialog).not.toBeNull();
    // Los siete motivos, sin el que es exclusivo del retiro.
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.queryByRole("radio", { name: "Alto número de reportes" })).toBeNull();

    // Sin motivo no se envía nada.
    fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Elige un motivo.");

    fireEvent.click(screen.getByRole("radio", { name: "Violencia gráfica" }));
    // La explicación solo aparece con "Otro".
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/moderation/reports", {
        target_type: "forum_topic",
        target_id: "topic-1",
        reason: "graphic_violence",
        details: null,
      })
    );

    const button = await screen.findByRole("button", { name: /Reportado/ });
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("con el motivo Otro permite una explicación breve", async () => {
    render(<ReportButton targetType="avatar" targetId="autora-id" label="Reportar foto" />);

    fireEvent.click(screen.getByRole("button", { name: /Reportar foto/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Otro" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  No es su foto  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/moderation/reports", {
        target_type: "avatar",
        target_id: "autora-id",
        reason: "other",
        details: "No es su foto",
      })
    );
  });

  it("si ya lo había reportado, lo indica sin mostrar un error", async () => {
    api.post.mockRejectedValue({
      response: { status: 409, data: { detail: "Ya reportaste este contenido." } },
    });
    render(<ReportButton targetType="forum_reply" targetId="reply-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Reportar/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));

    const button = await screen.findByRole("button", { name: /Reportado/ });
    expect(button.disabled).toBe(true);
  });

  it("muestra el motivo cuando el backend rechaza el reporte", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 429,
        data: { detail: "Enviaste muchos reportes en poco tiempo." },
      },
    });
    render(<ReportButton targetType="forum_topic" targetId="topic-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Reportar/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Acoso" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enviaste muchos reportes en poco tiempo.");
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("sin sesión pide iniciar sesión en vez de abrir el formulario", () => {
    auth.user = null;
    render(<ReportButton targetType="forum_topic" targetId="topic-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Reportar/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      "Inicia sesión para reportar contenido.",
      "error"
    );
  });
});

describe("Acciones de administración", () => {
  it("no se muestran a un usuario normal", () => {
    const { container } = render(
      <>
        <RemoveButton targetType="forum_topic" targetId="topic-1" />
        <RestoreButton caseId="case-1" />
      </>
    );

    expect(container.querySelector("button")).toBeNull();
  });

  it("el admin retira eligiendo un motivo, incluido Alto número de reportes", async () => {
    auth.user = ADMIN;
    const onRemoved = vi.fn();
    api.post.mockResolvedValue({ data: { case: { id: "case-1" } } });
    render(
      <RemoveButton targetType="story_cover" targetId="story-1" onRemoved={onRemoved} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    expect(screen.getByRole("dialog", { name: "Retirar contenido" })).not.toBeNull();
    // Ocho motivos más la opción vacía inicial.
    expect(screen.getAllByRole("option")).toHaveLength(9);

    // Sin motivo no se retira.
    const submit = screen.getAllByRole("button", { name: "Retirar" }).pop();
    fireEvent.click(submit);
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "many_reports" },
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Revisado a mano" },
    });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/moderation/remove", {
        target_type: "story_cover",
        target_id: "story-1",
        reason: "many_reports",
        note: "Revisado a mano",
      })
    );
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith({ id: "case-1" }));
  });

  it("el admin restaura con un motivo opcional", async () => {
    auth.user = ADMIN;
    const onRestored = vi.fn();
    api.post.mockResolvedValue({ data: { case: { id: "case-1" } } });
    render(<RestoreButton caseId="case-1" onRestored={onRestored} />);

    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Fue un error" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Restaurar" }).pop());

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/moderation/cases/case-1/restore", {
        note: "Fue un error",
      })
    );
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
  });
});

describe("Avisos de moderación", () => {
  it("muestra el motivo general del retiro y nada si no hay retiro", () => {
    const { container, rerender } = render(<ModerationNotice moderation={null} />);
    expect(container.textContent).toBe("");

    rerender(
      <ModerationNotice
        moderation={{
          removed: true,
          automatic: true,
          message: "Tu tema del foro fue retirado por alto número de reportes.",
        }}
      />
    );

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain(
      "Tu tema del foro fue retirado por alto número de reportes."
    );
    expect(notice.textContent).toContain("pendiente de revisión");
  });

  it("lista en el perfil lo que le retiraron a la persona", async () => {
    api.get.mockResolvedValue({
      data: {
        notices: [
          {
            id: "case-1",
            target_type: "story_cover",
            title: "Mi historia",
            message: "La portada de tu historia fue retirada por contenido sexual.",
          },
        ],
      },
    });

    render(<MyModerationNotices />);

    expect(
      await screen.findByText(/La portada de tu historia fue retirada por contenido sexual\./)
    ).not.toBeNull();
    expect(screen.getByText(/Mi historia/)).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith("/me/moderation");
  });

  it("sin avisos no muestra la sección", async () => {
    api.get.mockResolvedValue({ data: { notices: [] } });
    const { container } = render(<MyModerationNotices />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});

describe("ModerationPanel", () => {
  beforeEach(() => {
    auth.user = ADMIN;
  });

  it("muestra el contenido reportado, sus motivos y cuántos reportes tiene", async () => {
    api.get.mockResolvedValue({
      data: { cases: [moderationCase()], auto_remove_threshold: 5 },
    });

    renderInRouter(<ModerationPanel />);

    expect(await screen.findByText("Mi tema")).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith("/moderation/cases?status=open");
    expect(screen.getByText("Tema del foro")).not.toBeNull();
    expect(screen.getByRole("link", { name: "@autora" }).getAttribute("href")).toBe(
      "/usuario/autora-id"
    );
    expect(screen.getByText("Contenido sexual · 2")).not.toBeNull();
    expect(screen.getByText("Mira la imagen")).not.toBeNull();
    expect(screen.getByText("Pendiente")).not.toBeNull();
    expect(screen.getByText(/Con 5 reportes de personas distintas/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Ver en el sitio" }).getAttribute("href")).toBe(
      "/forum/topic-1"
    );
    // Un caso pendiente se puede retirar o marcar como revisado.
    expect(screen.getByRole("button", { name: "Retirar" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Restaurar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/moderation/cases/case-1/review", {})
    );
  });

  it("en un caso retirado ofrece restaurar y muestra el motivo y el historial", async () => {
    api.get.mockResolvedValue({
      data: {
        cases: [
          moderationCase({
            status: "removed",
            report_count: 5,
            removal: {
              reason: "many_reports",
              reason_label: "Alto número de reportes",
              automatic: true,
              confirmed: false,
              removed_at: new Date().toISOString(),
            },
            history: [
              {
                action: "auto_removed",
                reason_label: "Alto número de reportes",
                note: null,
                actor: null,
                created_at: new Date().toISOString(),
              },
            ],
          }),
        ],
        auto_remove_threshold: 5,
      },
    });

    renderInRouter(<ModerationPanel />);

    expect(await screen.findByText("Retirado")).not.toBeNull();
    expect(screen.getByText(/\(automático\)/)).not.toBeNull();
    expect(screen.getByText("Retirado automáticamente")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Restaurar" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retirar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar como revisado" })).toBeNull();

    // Un retiro automático espera la revisión: se puede confirmar.
    expect(screen.getByText(/Pendiente de tu revisión/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar retiro" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/moderation/cases/case-1/confirm", {})
    );
  });

  it("un retiro ya revisado no ofrece confirmarlo otra vez", async () => {
    const removal = {
      reason_label: "Contenido sexual",
      removed_at: new Date().toISOString(),
    };
    api.get.mockResolvedValue({
      data: {
        cases: [
          // Retirado por la administración.
          moderationCase({
            id: "case-manual",
            status: "removed",
            removal: { ...removal, reason: "sexual", automatic: false, confirmed: true },
          }),
          // Retiro automático que ya fue confirmado.
          moderationCase({
            id: "case-confirmado",
            status: "removed",
            removal: { ...removal, reason: "many_reports", automatic: true, confirmed: true },
          }),
        ],
        auto_remove_threshold: 5,
      },
    });

    renderInRouter(<ModerationPanel />);

    expect((await screen.findAllByRole("button", { name: "Restaurar" })).length).toBe(2);
    expect(screen.queryByRole("button", { name: "Confirmar retiro" })).toBeNull();
    expect(screen.queryByText(/Pendiente de tu revisión/)).toBeNull();
  });

  it("muestra el HTML de un reporte como texto, sin interpretarlo", async () => {
    api.get.mockResolvedValue({
      data: {
        cases: [
          moderationCase({
            content: { title: XSS_TEXT, text: XSS_TEXT, image_url: null },
            explanations: [XSS_TEXT],
          }),
        ],
        auto_remove_threshold: 5,
      },
    });

    const { container } = renderInRouter(<ModerationPanel />);

    expect((await screen.findAllByText(XSS_TEXT)).length).toBe(3);
    expect(container.querySelector(".moderation-case img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("cambia de lista con los filtros y avisa si no hay permiso", async () => {
    api.get.mockResolvedValue({ data: { cases: [], auto_remove_threshold: 5 } });

    renderInRouter(<ModerationPanel />);

    expect(await screen.findByText("No hay casos en esta lista.")).not.toBeNull();

    api.get.mockRejectedValue({ response: { status: 403 } });
    fireEvent.click(screen.getByRole("button", { name: "Retirados" }));

    expect(
      await screen.findByText("No tienes permisos para ver la moderación.")
    ).not.toBeNull();
    expect(api.get).toHaveBeenLastCalledWith("/moderation/cases?status=removed");
  });
});
