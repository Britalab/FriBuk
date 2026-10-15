import { useEffect } from "react";
import api from "../api/client";
import { getAccessToken } from "../api/session";

const PRESENCE_INTERVAL_MS = 30000;

// Mientras FriBuk está en pantalla, avisa al backend cada 30 segundos que
// la persona la está usando: así no le llegan avisos push que ya ve en la
// campana y en Mensajes. Al salir lo avisa al momento; si ese último aviso
// no alcanza a llegar, el backend lo da por terminado a los 45 segundos.
export function useAppPresence(userId) {
  useEffect(() => {
    if (!userId) return undefined;

    const markActive = () => {
      api.post("/push/presence", { active: true }).catch(() => {});
    };

    // Con keepalive la petición sigue aunque la página se cierre.
    const markAway = () => {
      const token = getAccessToken();
      if (!token) return;
      fetch(`${api.defaults.baseURL}/push/presence`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
    };

    const update = () => {
      if (document.visibilityState === "visible") markActive();
      else markAway();
    };

    update();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") markActive();
    }, PRESENCE_INTERVAL_MS);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", markAway);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", markAway);
      markAway();
    };
  }, [userId]);
}
