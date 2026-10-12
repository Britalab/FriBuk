import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useInstallApp } from "../hooks/useInstallApp";
import { dismissInstall, isInstallDismissed, openInChromeLink } from "../utils/installApp";
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
        {isAndroid
          ? "Para instalarla como app, ábrela en tu navegador."
          : "Para instalarla como app, ábrela en Safari o Chrome."}
      </p>

      <div className="update-notice-actions">
        {isAndroid ? (
          <a
            href={openInChromeLink(window.location.href)}
            className="update-notice-reload install-banner-link"
          >
            Abrir en Chrome
          </a>
        ) : (
          <Link to="/instalar" className="update-notice-reload install-banner-link">
            Ver cómo
          </Link>
        )}
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
