import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useInstallApp } from "../hooks/useInstallApp";
import { useToast } from "../hooks/useToast";
import { dismissInstall, isInstallDismissed, openInChromeLink } from "../utils/installApp";
import "../styles/install.css";

// Páginas donde la invitación no estorba: explorar, una historia, un perfil.
// Mientras se lee o se escribe no aparece.
const BROWSING_PAGE = /^\/($|autores$|forum$|usuario\/[^/]+$|stories\/[^/]+$)/;

// Invitación a instalar FriBuk en el teléfono. Solo aparece cuando hay algo
// que la persona puede hacer: instalar con un toque (Android), seguir los
// pasos (iPhone) o salir del navegador de otra app.
export default function InstallBanner() {
  const { platform, canPrompt, install } = useInstallApp();
  const { showToast } = useToast();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(isInstallDismissed);
  const [isTouch] = useState(
    () => window.matchMedia?.("(pointer: coarse)").matches === true
  );

  if (dismissed || !isTouch || !BROWSING_PAGE.test(pathname)) return null;

  const close = () => {
    dismissInstall();
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (await install()) {
      showToast("FriBuk quedó instalada. Búscala entre tus aplicaciones.");
    }
  };

  let message;
  let action;

  if (canPrompt) {
    message = "Ten FriBuk a un toque, como una app más de tu teléfono.";
    action = (
      <button type="button" className="update-notice-reload" onClick={handleInstall}>
        Instalar
      </button>
    );
  } else if (platform === "ios") {
    message = "Puedes tener FriBuk en tu pantalla de inicio, como una app.";
    action = (
      <Link to="/instalar" className="update-notice-reload install-banner-link">
        Ver cómo
      </Link>
    );
  } else if (platform === "in-app-android") {
    message = "Para instalar FriBuk como app, ábrela en tu navegador.";
    action = (
      <a
        href={openInChromeLink(window.location.href)}
        className="update-notice-reload install-banner-link"
      >
        Abrir en Chrome
      </a>
    );
  } else if (platform === "in-app-ios") {
    message = "Para instalar FriBuk como app, ábrela en Safari o Chrome.";
    action = (
      <Link to="/instalar" className="update-notice-reload install-banner-link">
        Ver cómo
      </Link>
    );
  } else {
    return null;
  }

  return (
    <div className="update-notice install-banner" role="region" aria-label="Instalar FriBuk">
      <p>
        <strong>Instala FriBuk.</strong> {message}
      </p>

      <div className="update-notice-actions">
        {action}
        <button
          type="button"
          className="update-notice-close"
          onClick={close}
          aria-label="Cerrar invitación"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
