import { useCallback, useRef, useState } from "react";
import api from "../api/client";
import { useNotifications } from "./useNotifications";

function errorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

// Lista de notificaciones del usuario: carga, paginación, marcar como leídas
// y descartar. La comparten el panel de la campana y la página completa.
export function useNotificationFeed({ limit = 20 } = {}) {
  const { setUnreadCount } = useNotifications();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setStatus("loading");
    setError("");
    setActionError("");

    try {
      const response = await api.get("/notifications", { params: { limit } });
      if (currentRequest !== requestId.current) return;
      setItems(response.data.notifications || []);
      setNextBefore(response.data.has_more ? response.data.next_before : null);
      setUnreadCount(response.data.unread_count);
      setStatus("ready");
    } catch (requestError) {
      if (currentRequest !== requestId.current) return;
      console.error("Error al cargar las notificaciones:", requestError);
      setError(errorMessage(requestError, "No pudimos cargar tus notificaciones."));
      setStatus("error");
    }
  }, [limit, setUnreadCount]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;

    setLoadingMore(true);
    setActionError("");

    try {
      const response = await api.get("/notifications", {
        params: { limit, before: nextBefore },
      });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...(response.data.notifications || []).filter((item) => !known.has(item.id)),
        ];
      });
      setNextBefore(response.data.has_more ? response.data.next_before : null);
      setUnreadCount(response.data.unread_count);
    } catch (requestError) {
      console.error("Error al cargar más notificaciones:", requestError);
      setActionError(errorMessage(requestError, "No pudimos cargar más notificaciones."));
    } finally {
      setLoadingMore(false);
    }
  }, [limit, loadingMore, nextBefore, setUnreadCount]);

  const markRead = useCallback(
    async (notification) => {
      if (notification.is_read) return;

      // Se refleja de inmediato; si falla, la próxima carga lo corrige.
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, is_read: true } : item
        )
      );

      try {
        const response = await api.post(`/notifications/${notification.id}/read`);
        setUnreadCount(response.data.unread_count);
      } catch (requestError) {
        console.error("Error al marcar la notificación como leída:", requestError);
      }
    },
    [setUnreadCount]
  );

  const markAllRead = useCallback(async () => {
    setActionError("");

    try {
      await api.post("/notifications/read-all");
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (requestError) {
      console.error("Error al marcar todas como leídas:", requestError);
      setActionError(errorMessage(requestError, "No pudimos marcar las notificaciones como leídas."));
    }
  }, [setUnreadCount]);

  const remove = useCallback(
    async (notification) => {
      setActionError("");

      try {
        const response = await api.delete(`/notifications/${notification.id}`);
        setItems((current) => current.filter((item) => item.id !== notification.id));
        setUnreadCount(response.data.unread_count);
      } catch (requestError) {
        console.error("Error al descartar la notificación:", requestError);
        setActionError(errorMessage(requestError, "No pudimos descartar la notificación."));
      }
    },
    [setUnreadCount]
  );

  // Borra del servidor todas las notificaciones ya leídas del usuario.
  const clearRead = useCallback(async () => {
    setActionError("");

    try {
      const response = await api.post("/notifications/clear-read");
      setItems((current) => current.filter((item) => !item.is_read));
      setUnreadCount(response.data.unread_count);
    } catch (requestError) {
      console.error("Error al limpiar las notificaciones leídas:", requestError);
      setActionError(errorMessage(requestError, "No pudimos limpiar las notificaciones leídas."));
    }
  }, [setUnreadCount]);

  return {
    items,
    status,
    error,
    actionError,
    hasMore: Boolean(nextBefore),
    loadingMore,
    hasUnread: items.some((item) => !item.is_read),
    hasRead: items.some((item) => item.is_read),
    clearRead,
    load,
    loadMore,
    markRead,
    markAllRead,
    remove,
  };
}
