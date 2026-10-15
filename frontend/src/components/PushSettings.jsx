import { useEffect, useState } from "react";
import { useToast } from "../hooks/useToast";
import { disablePush, enablePush, getPushStatus, pushSupport } from "../utils/push";

// Activar o desactivar los avisos push en este dispositivo. No muestra nada
// si el navegador no los admite o si el servidor aún no está configurado.
export default function PushSettings() {
  const { showToast } = useToast();
  const support = pushSupport();
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support !== "supported") return undefined;

    let active = true;
    getPushStatus()
      .then((value) => active && setStatus(value))
      .catch(() => active && setStatus("unavailable"));
    return () => {
      active = false;
    };
  }, [support]);

  const toggle = async () => {
    setBusy(true);
    try {
      const next = status === "on" ? await disablePush() : await enablePush();
      setStatus(next);
      if (next === "on") showToast("Listo: te avisaremos en este dispositivo.");
      if (next === "off" && status === "on") showToast("Ya no recibirás avisos en este dispositivo.");
    } catch {
      showToast("No se pudieron cambiar los avisos. Intenta nuevamente.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (support === "ios-needs-install") {
    return (
      <section className="push-settings">
        <span className="push-settings-icon" aria-hidden="true">🔔</span>
        <div className="push-settings-text">
          <h2>Avisos en tu iPhone</h2>
          <p>
            Para recibirlos, primero agrega FriBuk a tu pantalla de inicio
            (Compartir → «Agregar a inicio») y ábrela desde ahí.
          </p>
        </div>
      </section>
    );
  }

  if (support !== "supported" || status === "loading" || status === "unavailable") {
    return null;
  }

  const texts = {
    on: "Recibes avisos en este dispositivo aunque FriBuk esté cerrada.",
    off: "Entérate de mensajes, comentarios, seguidores y capítulos nuevos aunque FriBuk esté cerrada.",
    denied:
      "Bloqueaste los avisos de FriBuk. Para activarlos, permite las notificaciones en los ajustes de tu navegador o de tu teléfono.",
  };

  return (
    <section className="push-settings">
      <span className="push-settings-icon" aria-hidden="true">🔔</span>
      <div className="push-settings-text">
        <h2>Avisos en este dispositivo</h2>
        <p>{texts[status]}</p>
      </div>
      {status !== "denied" && (
        <button
          type="button"
          className={`notifications-button${status === "on" ? "" : " is-primary"}`}
          onClick={toggle}
          disabled={busy}
        >
          {status === "on" ? "Desactivar avisos" : "Activar avisos"}
        </button>
      )}
    </section>
  );
}
