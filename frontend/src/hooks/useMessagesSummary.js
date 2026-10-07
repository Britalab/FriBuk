import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { MESSAGES_CHANGED_EVENT } from "../utils/messages";

const REFRESH_INTERVAL_MS = 60000;

// Número de mensajes sin leer del usuario con sesión, para la barra de
// navegación. Se consulta al iniciar sesión, al volver a la pestaña, una vez
// por minuto mientras está visible y cuando Mensajes avisa de un cambio.
export function useMessagesSummary() {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState({ userId: null, total: 0 });

  const refresh = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await api.get("/messages/summary");
      setState({ userId, total: Number(response.data.total_unread) || 0 });
    } catch {
      // El contador es secundario: si falla, la navegación sigue igual.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refreshIfVisible();
    const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener(MESSAGES_CHANGED_EVENT, refresh);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, refresh);
    };
  }, [userId, refresh]);

  // El contador solo vale para el usuario al que pertenece.
  return state.userId === userId ? state.total : 0;
}
