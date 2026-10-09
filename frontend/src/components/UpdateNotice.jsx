import { useEffect, useState } from "react";
import { CURRENT_VERSION, hasNewVersion } from "../utils/appVersion";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Aviso discreto de que se publicó una versión nueva de FriBuk. No recarga
// por su cuenta, para no borrar lo que alguien esté escribiendo: la persona
// decide cuándo.
export default function UpdateNotice({
  currentVersion = CURRENT_VERSION,
  checkForUpdate = hasNewVersion,
}) {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!currentVersion || available) return undefined;

    let isActive = true;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if ((await checkForUpdate(currentVersion)) && isActive) setAvailable(true);
    };

    // Al volver a la pestaña y cada pocos minutos mientras está a la vista.
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    return () => {
      isActive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [currentVersion, checkForUpdate, available]);

  if (!available || dismissed) return null;

  return (
    <div className="update-notice" role="status">
      <p>
        <strong>Hay una versión nueva de FriBuk.</strong>{" "}
        Si estás escribiendo algo, guárdalo antes de recargar.
      </p>

      <div className="update-notice-actions">
        <button
          type="button"
          className="update-notice-reload"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
        <button
          type="button"
          className="update-notice-close"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
