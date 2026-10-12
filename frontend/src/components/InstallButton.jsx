import { Link, useLocation } from "react-router-dom";
import { useInstallApp } from "../hooks/useInstallApp";
import { useToast } from "../hooks/useToast";
import "../styles/install.css";

// Mientras se lee o se escribe no aparece, para no distraer. Tampoco en la
// propia página de instalación.
const HIDDEN_ON = /\/chapters\/|\/create-|\/edit$|^\/forum\/new$|^\/mensajes|^\/instalar$/;

// Botón "Instalar app". En la portada va bajo la bienvenida (inline),
// para no empujar el título hacia abajo; en las demás páginas, justo bajo la
// barra superior.
// Si el navegador lo permite, instala con un clic; si no (iPhone, o dentro
// de Instagram y parecidas), lleva a los pasos. Desaparece una vez instalada.
export default function InstallButton({ inline = false }) {
  const { platform, canPrompt, install } = useInstallApp();
  const { showToast } = useToast();
  const { pathname } = useLocation();

  if (platform === "installed" || HIDDEN_ON.test(pathname)) return null;
  // La portada muestra el suyo.
  if (!inline && pathname === "/") return null;

  const handleInstall = async () => {
    if (await install()) {
      showToast("FriBuk quedó instalada. Búscala entre tus aplicaciones.");
    }
  };

  const content = (
    <>
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
      </svg>
      Instalar app
    </>
  );

  return (
    <div className={inline ? "install-inline" : "install-strip"}>
      {canPrompt ? (
        <button type="button" className="install-button" onClick={handleInstall}>
          {content}
        </button>
      ) : (
        <Link to="/instalar" className="install-button">
          {content}
        </Link>
      )}
    </div>
  );
}
