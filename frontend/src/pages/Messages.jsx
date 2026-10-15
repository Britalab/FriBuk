import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import AuthorChannel from "../components/messages/AuthorChannel";
import MessageSettings from "../components/messages/MessageSettings";
import MessagesInbox from "../components/messages/MessagesInbox";
import PrivateThread from "../components/messages/PrivateThread";
import { MESSAGES_CHANGED_EVENT, apiErrorDetail } from "../utils/messages";
import "../styles/messages.css";

const REFRESH_INTERVAL_MS = 30000;
// Si el alto visible baja más que esto, es el teclado del teléfono.
const KEYBOARD_MIN_HEIGHT = 120;

const EMPTY_INBOX = {
  loading: true,
  error: "",
  conversations: [],
  channels: [],
  own: null,
};

// Página de Mensajes. `view` lo define la ruta:
//   inbox    /mensajes
//   private  /mensajes/privados/:userId
//   author   /mensajes/autores/:authorId
//   settings /mensajes/ajustes
// En escritorio la bandeja va a un lado y la conversación al otro; en el
// teléfono se ve una sola a la vez.
export default function Messages({ view = "inbox" }) {
  const { userId, authorId } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState(view === "author" ? "authors" : "private");
  const [inbox, setInbox] = useState(EMPTY_INBOX);
  const pageRef = useRef(null);

  const loadInbox = useCallback(async () => {
    try {
      const [conversations, authors] = await Promise.all([
        api.get("/messages/conversations"),
        api.get("/messages/authors"),
      ]);
      setInbox({
        loading: false,
        error: "",
        conversations: conversations.data.conversations || [],
        channels: authors.data.channels || [],
        own: authors.data.own || null,
      });
    } catch (requestError) {
      setInbox((current) => ({
        ...current,
        loading: false,
        error: apiErrorDetail(requestError, "No se pudieron cargar tus mensajes."),
      }));
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") loadInbox();
    };

    refreshIfVisible();
    const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener(MESSAGES_CHANGED_EVENT, loadInbox);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, loadInbox);
    };
  }, [loadInbox]);

  // La página ocupa justo el alto visible bajo la barra de navegación.
  // Con el teclado del teléfono abierto, el chat se fija sobre la parte que
  // queda a la vista: iPhone desplaza la pantalla al abrir el teclado y, sin
  // esto, deja el cuadro de texto fuera de la vista.
  useLayoutEffect(() => {
    const updateHeight = () => {
      const page = pageRef.current;
      if (!page) return;

      const viewport = window.visualViewport;
      const visible = viewport?.height || window.innerHeight;
      const keyboardOpen =
        Boolean(viewport) && window.innerHeight - viewport.height > KEYBOARD_MIN_HEIGHT;

      page.classList.toggle("is-keyboard-open", keyboardOpen);

      if (keyboardOpen) {
        page.style.setProperty("--messages-top", `${Math.round(viewport.offsetTop)}px`);
        page.style.setProperty("--messages-height", `${Math.round(visible)}px`);
        return;
      }

      const navbar = document.querySelector(".navbar");
      const top = navbar ? Math.round(navbar.getBoundingClientRect().height) : 0;
      page.style.setProperty("--messages-height", `${Math.max(320, visible - top)}px`);
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("scroll", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("scroll", updateHeight);
    };
  }, []);

  return (
    <main
      className={`messages-page${view === "inbox" ? "" : " has-thread"}`}
      ref={pageRef}
    >
      <div className="messages-layout">
        <aside className="messages-sidebar" aria-label="Bandeja de mensajes">
          <MessagesInbox
            tab={tab}
            onTabChange={setTab}
            inbox={inbox}
            currentUser={user}
            onRetry={() => {
              setInbox((current) => ({ ...current, loading: true, error: "" }));
              loadInbox();
            }}
          />
        </aside>

        <section className="messages-thread" aria-label="Conversación">
          {view === "private" ? (
            <PrivateThread key={userId} userId={userId} />
          ) : view === "author" ? (
            <AuthorChannel key={authorId} authorId={authorId} />
          ) : view === "settings" ? (
            <MessageSettings />
          ) : (
            <div className="messages-empty">
              <span aria-hidden="true">✉</span>
              <h2>Tus mensajes</h2>
              <p>
                Elige una conversación de la lista o escribe a alguien desde su
                perfil.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
