// Pruebas de las pantallas de Mensajes. El backend se reemplaza por
// respuestas simuladas: lo que se comprueba aquí es qué se muestra y qué se
// envía; las reglas de permiso las hace cumplir y las prueba el backend.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "../../api/client";
import AuthorChannel from "./AuthorChannel";
import MessageComposer from "./MessageComposer";
import MessageSettings from "./MessageSettings";
import MessagesInbox from "./MessagesInbox";
import PrivateThread from "./PrivateThread";

vi.mock("../../api/client", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const ANA = { id: "ana-id", username: "ana", avatar_url: null };
const BOB = { id: "bob-id", username: "bob", avatar_url: null };
const AUTHOR = { id: "autora-id", username: "autora", avatar_url: null };
const NOW = new Date().toISOString();

function renderInRouter(element) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

function privateThread(overrides = {}) {
  return {
    user: BOB,
    has_conversation: true,
    messages: [],
    can_send: true,
    cannot_send_reason: null,
    blocked_by_me: false,
    replies_blocked_by_my_privacy: false,
    ...overrides,
  };
}

function mockGet(routes) {
  api.get.mockImplementation((url) => {
    if (url in routes) return Promise.resolve({ data: routes[url] });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
}

beforeEach(() => {
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

describe("MessageComposer", () => {
  it("no envía mensajes vacíos y envía el texto sin espacios sobrantes", async () => {
    const onSend = vi.fn().mockResolvedValue();
    render(
      <MessageComposer label="Mensaje" maxLength={50} onSend={onSend} />
    );

    const field = screen.getByLabelText("Mensaje");
    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button.disabled).toBe(true);

    fireEvent.change(field, { target: { value: "    " } });
    expect(button.disabled).toBe(true);

    fireEvent.change(field, { target: { value: "  Hola Bob  " } });
    fireEvent.click(button);

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Hola Bob"));
    await waitFor(() => expect(field.value).toBe(""));
  });

  it("rechaza un texto demasiado largo sin llamar al backend", () => {
    const onSend = vi.fn();
    render(<MessageComposer label="Mensaje" maxLength={10} onSend={onSend} />);

    fireEvent.change(screen.getByLabelText("Mensaje"), {
      target: { value: "a".repeat(11) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("10");
  });

  it("muestra el motivo que devuelve el backend y conserva el texto", async () => {
    const onSend = vi.fn().mockRejectedValue({
      response: { data: { detail: "Esta persona no recibe mensajes privados." } },
    });
    render(<MessageComposer label="Mensaje" maxLength={50} onSend={onSend} />);

    const field = screen.getByLabelText("Mensaje");
    fireEvent.change(field, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Esta persona no recibe mensajes privados.");
    expect(field.value).toBe("Hola");
  });
});

describe("PrivateThread", () => {
  it("muestra la conversación y marca como leído lo recibido", async () => {
    mockGet({
      "/messages/private/bob-id": privateThread({
        messages: [
          { id: "1", is_mine: true, content: "Hola, ¿cómo estás?", created_at: NOW, read_at: NOW },
          { id: "2", is_mine: false, content: "Bien, ¿y tú?", created_at: NOW, read_at: null },
        ],
      }),
    });

    renderInRouter(<PrivateThread userId="bob-id" />);

    expect(await screen.findByText("Hola, ¿cómo estás?")).not.toBeNull();
    expect(screen.getByText("Bien, ¿y tú?")).not.toBeNull();
    expect(screen.getByText("· Leído")).not.toBeNull();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/messages/private/bob-id/read")
    );
  });

  it("no marca nada como leído si no hay mensajes nuevos", async () => {
    mockGet({
      "/messages/private/bob-id": privateThread({
        messages: [
          { id: "1", is_mine: true, content: "Hola", created_at: NOW, read_at: null },
        ],
      }),
    });

    renderInRouter(<PrivateThread userId="bob-id" />);

    expect(await screen.findByText("· Enviado")).not.toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("permite eliminar un mensaje propio, pero no uno recibido", async () => {
    mockGet({
      "/messages/private/bob-id": privateThread({
        messages: [
          { id: "1", is_mine: true, content: "Me arrepentí", created_at: NOW, read_at: null },
          { id: "2", is_mine: false, content: "De Bob", created_at: NOW, read_at: NOW },
        ],
      }),
    });
    window.confirm = vi.fn(() => true);

    renderInRouter(<PrivateThread userId="bob-id" />);

    await screen.findByText("Me arrepentí");
    const deleteButtons = screen.getAllByRole("button", { name: "Eliminar" });
    expect(deleteButtons).toHaveLength(1);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/messages/private/bob-id/1")
    );
    await waitFor(() => expect(screen.queryByText("Me arrepentí")).toBeNull());
    expect(screen.getByText("De Bob")).not.toBeNull();
  });

  it("muestra el HTML de un mensaje como texto, sin interpretarlo", async () => {
    const attack = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    mockGet({
      "/messages/private/bob-id": privateThread({
        messages: [
          { id: "1", is_mine: false, content: attack, created_at: NOW, read_at: NOW },
        ],
      }),
    });

    const { container } = renderInRouter(<PrivateThread userId="bob-id" />);

    expect(await screen.findByText(attack)).not.toBeNull();
    expect(container.querySelector(".message-bubble img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("sin permiso para escribir, muestra el motivo en vez del cuadro de texto", async () => {
    mockGet({
      "/messages/private/bob-id": privateThread({
        can_send: false,
        cannot_send_reason: "Esta persona solo recibe mensajes de las personas que sigue.",
      }),
    });

    renderInRouter(<PrivateThread userId="bob-id" />);

    expect(
      await screen.findByText(
        "Esta persona solo recibe mensajes de las personas que sigue."
      )
    ).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("con un bloqueo propio ofrece desbloquear y no deja escribir", async () => {
    mockGet({
      "/messages/private/bob-id": privateThread({
        can_send: false,
        cannot_send_reason: "Bloqueaste a esta persona. Desbloquéala para poder escribirle.",
        blocked_by_me: true,
      }),
    });

    renderInRouter(<PrivateThread userId="bob-id" />);

    fireEvent.click(await screen.findByRole("button", { name: "Desbloquear" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/users/bob-id/block")
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("envía un reporte con el motivo y el mensaje elegido", async () => {
    mockGet({
      "/messages/private/bob-id": privateThread({
        messages: [
          { id: "m1", is_mine: false, content: "Mensaje molesto", created_at: NOW, read_at: NOW },
        ],
      }),
    });
    api.post.mockResolvedValue({ data: { message: "Reporte enviado." } });

    renderInRouter(<PrivateThread userId="bob-id" />);

    await screen.findByText("Mensaje molesto");
    // "Reportar" de la cabecera y "Reportar" del mensaje: se usa el del mensaje.
    const reportButtons = screen.getAllByRole("button", { name: "Reportar" });
    fireEvent.click(reportButtons[reportButtons.length - 1]);

    fireEvent.change(screen.getByLabelText("¿Por qué reportas este mensaje?"), {
      target: { value: "Me está insultando" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/messages/private/bob-id/report", {
        reason: "Me está insultando",
        message_id: "m1",
      })
    );
  });
});

describe("AuthorChannel", () => {
  const channel = (overrides = {}) => ({
    author: AUTHOR,
    is_own: false,
    can_reply: true,
    posts: [
      {
        id: "p1",
        content: "¡Nuevo capítulo publicado!",
        created_at: NOW,
        replies_open: true,
        replies: [
          {
            id: "r1", user: ANA, is_author: false, is_mine: true,
            reply_to_id: null, content: "¡Voy a leerlo!", created_at: NOW,
          },
          {
            id: "r2", user: BOB, is_author: false, is_mine: false,
            reply_to_id: null, content: "Me encantó el anterior.", created_at: NOW,
          },
          {
            id: "r3", user: AUTHOR, is_author: true, is_mine: false,
            reply_to_id: "r1", content: "¡Gracias, Ana!", created_at: NOW,
          },
        ],
      },
    ],
    ...overrides,
  });

  it("un seguidor puede responder al mensaje y al autor, no a otro seguidor", async () => {
    mockGet({ "/messages/authors/autora-id": channel() });

    renderInRouter(<AuthorChannel authorId="autora-id" />);

    expect(await screen.findByText("¡Nuevo capítulo publicado!")).not.toBeNull();
    expect(screen.getByText("Me encantó el anterior.")).not.toBeNull();
    expect(screen.getByText("En respuesta a @ana")).not.toBeNull();

    // Un botón para responder al mensaje y otro para responderle al autor;
    // ninguno junto a la respuesta de Bob.
    expect(screen.getAllByRole("button", { name: "Responder" })).toHaveLength(2);
    const bobReply = screen.getByText("Me encantó el anterior.").closest("li");
    expect(bobReply.querySelector("button")).toBeNull();

    // Solo puede eliminar su propia respuesta.
    window.confirm = vi.fn(() => true);
    const deleteButtons = screen.getAllByRole("button", { name: "Eliminar" });
    expect(deleteButtons).toHaveLength(1);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/messages/author-replies/r1")
    );
    await waitFor(() => expect(screen.queryByText("¡Voy a leerlo!")).toBeNull());

    // No hay reacciones ni selector de emojis en Mensajes.
    expect(screen.queryByText(/reaccion/i)).toBeNull();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/messages/authors/autora-id/read")
    );
  });

  it("con las respuestas cerradas se puede leer pero no responder", async () => {
    const closed = channel();
    closed.posts[0].replies_open = false;
    mockGet({ "/messages/authors/autora-id": closed });

    renderInRouter(<AuthorChannel authorId="autora-id" />);

    expect(
      await screen.findByText("El autor cerró las respuestas de este mensaje.")
    ).not.toBeNull();
    expect(screen.getByText("¡Nuevo capítulo publicado!")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Responder" })).toBeNull();
  });

  it("el autor puede publicar, cerrar respuestas y contestar a cualquier seguidor", async () => {
    const own = channel({ is_own: true });
    own.posts[0].replies = own.posts[0].replies.map((reply) => ({
      ...reply,
      is_mine: reply.is_author,
    }));
    mockGet({ "/messages/authors/autora-id": own });
    api.patch.mockResolvedValue({ data: { id: "p1", replies_open: false } });

    renderInRouter(<AuthorChannel authorId="autora-id" />);

    expect(await screen.findByLabelText("Mensaje para tus seguidores")).not.toBeNull();
    // Responder al mensaje, a Ana y a Bob (no a su propia respuesta).
    expect(screen.getAllByRole("button", { name: "Responder" })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar respuestas" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/messages/author-posts/p1", {
        replies_open: false,
      })
    );
    expect(
      await screen.findByRole("button", { name: "Permitir respuestas" })
    ).not.toBeNull();
  });

  it("quien no sigue al autor ve el aviso y un enlace a su perfil", async () => {
    api.get.mockRejectedValue({
      response: {
        status: 403,
        data: {
          detail: "Sigue a este autor para ver los mensajes que envía a sus seguidores.",
        },
      },
    });

    renderInRouter(<AuthorChannel authorId="autora-id" />);

    expect(
      await screen.findByText(
        "Sigue a este autor para ver los mensajes que envía a sus seguidores."
      )
    ).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Ver el perfil del autor" }).getAttribute("href")
    ).toBe("/usuario/autora-id");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("MessagesInbox", () => {
  const inbox = {
    loading: false,
    error: "",
    conversations: [
      {
        user: BOB,
        last_message_preview: "Bien, ¿y tú?",
        last_message_is_mine: false,
        last_message_at: NOW,
        unread_count: 2,
        blocked_by_me: false,
      },
    ],
    channels: [
      {
        author: AUTHOR,
        last_post_preview: "¡Nuevo capítulo publicado!",
        last_post_at: NOW,
        unread_count: 1,
      },
    ],
    own: { post_count: 0, last_post_preview: "", last_post_at: null, unread_count: 0 },
  };

  it("muestra las dos pestañas con sus no leídos y enlaza cada conversación", () => {
    const onTabChange = vi.fn();
    const { rerender } = renderInRouter(
      <MessagesInbox
        tab="private"
        onTabChange={onTabChange}
        inbox={inbox}
        currentUser={ANA}
        onRetry={() => {}}
      />
    );

    expect(screen.getByRole("heading", { name: "Mensajes" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: /Privados/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByLabelText("2 sin leer").length).toBeGreaterThan(0);
    expect(screen.getByText("Bien, ¿y tú?")).not.toBeNull();
    expect(screen.getByRole("link", { name: /@bob/ }).getAttribute("href")).toBe(
      "/mensajes/privados/bob-id"
    );

    fireEvent.click(screen.getByRole("tab", { name: /Autores que sigo/ }));
    expect(onTabChange).toHaveBeenCalledWith("authors");

    rerender(
      <MemoryRouter>
        <MessagesInbox
          tab="authors"
          onTabChange={onTabChange}
          inbox={inbox}
          currentUser={ANA}
          onRetry={() => {}}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /@autora/ }).getAttribute("href")).toBe(
      "/mensajes/autores/autora-id"
    );
    expect(
      screen.getByRole("link", { name: /Mis mensajes a seguidores/ }).getAttribute("href")
    ).toBe("/mensajes/autores/ana-id");
  });
});

describe("MessageSettings", () => {
  it("guarda la privacidad elegida y permite desbloquear", async () => {
    mockGet({
      "/me/message-settings": { allow_from: "everyone" },
      "/me/blocks": { blocked: [BOB] },
    });

    renderInRouter(<MessageSettings />);

    const option = await screen.findByRole("radio", { name: /Solo personas que sigo/ });
    expect(screen.getByRole("radio", { name: /Todos/ }).checked).toBe(true);

    fireEvent.click(option);

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/me/message-settings", {
        allow_from: "following",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/users/bob-id/block")
    );
    await waitFor(() => expect(screen.queryByText("@bob")).toBeNull());
  });
});
