import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { NotificationsContext } from "../context/NotificationsContext";

const REFRESH_INTERVAL_MS = 60000;

// Mantiene el número de notificaciones sin leer del usuario con sesión.
// Lo consulta al iniciar sesión, al volver a la pestaña y una vez por minuto
// mientras la pestaña está visible; nunca cuando no hay sesión.
export default function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState({ userId: null, count: 0 });

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await api.get("/notifications/unread-count");
      setState({ userId, count: Number(response.data.unread_count) || 0 });
    } catch {
      // El contador es secundario: si falla, la navegación sigue igual.
    }
  }, [userId]);

  const setUnreadCount = useCallback(
    (count) => {
      if (userId) setState({ userId, count: Math.max(0, Number(count) || 0) });
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refreshUnreadCount();
    };

    refreshIfVisible();
    const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [userId, refreshUnreadCount]);

  // El contador solo vale para el usuario al que pertenece.
  const unreadCount = state.userId === userId ? state.count : 0;

  const value = useMemo(
    () => ({ unreadCount, refreshUnreadCount, setUnreadCount }),
    [unreadCount, refreshUnreadCount, setUnreadCount]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}
