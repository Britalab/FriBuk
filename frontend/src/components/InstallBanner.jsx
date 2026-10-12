import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useInstallApp } from "../hooks/useInstallApp";
import {
  dismissInstall,
  isInstallDismissed,
  openInChromeLink,
  openInSafariLink,
} from "../utils/installApp";
import "../styles/install.css";

// Páginas donde el aviso no estorba: explorar, una historia, un perfil.
// Mientras se lee o se escribe no aparece.
const BROWSING_PAGE = /^\/($|autores$|forum$|usuario\/[^/]+$|stories\/[^/]+$)/;

// Aviso para quien llega desde Instagram, TikTok o Facebook: esas apps abren
// los enlaces en un navegador propio que no permite instalar, y eso no se
// adivina. En los demás casos basta el botón "Instalar app" (InstallButton).
export default function InstallBanner() {
  const { platform } = useInstallApp();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(isInstallDismissed);

  const isAndroid = platform === "in-app-android";

  if (!isAndroid && platform !== "in-app-ios") return null;
  if (dismissed || !BROWSING_PAGE.test(pathname)) return null;

  const close = () => {
    dismissInstall();
    setDismissed(true);
  };

  return (
    <div className="update-notice install-banner" role="region" aria-label="Instalar FriBuk">
      <p>
        <strong>Instala FriBuk.</strong>{" "}
        Desde aquí no se puede: primero ábrela en{" "}
        {isAndroid ? "tu navegador" : "Safari"}.{" "}
        <Link to="/instalar">¿No funciona el botón?</Link>
      </p>

      <div className="update-notice-actions">
        <a
          href={
            isAndroid
              ? openInChromeLink(window.location.href)
              : openInSafariLink(window.location.href)
          }
          className="update-notice-reload install-banner-link"
        >
          {isAndroid ? "Abrir en Chrome" : "Abrir en Safari"}
        </a>
        <button
          type="button"
          className="update-notice-close"
          onClick={close}
          aria-label="Cerrar aviso"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
