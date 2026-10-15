import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";

// Al tocar un aviso push con FriBuk ya abierta, el service worker pide ir a
// lo que avisa: se navega sin recargar y se actualiza el contador.
export default function PushNavigation() {
  const navigate = useNavigate();
  const { refreshUnreadCount } = useNotifications();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return undefined;
    }

    const handleMessage = (event) => {
      const { type, path } = event.data || {};
      if (type !== "fribuk:navigate" || typeof path !== "string" || !path.startsWith("/")) {
        return;
      }
      navigate(path);
      refreshUnreadCount();
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [navigate, refreshUnreadCount]);

  return null;
}
