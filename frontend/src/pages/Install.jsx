import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import { useInstallApp } from "../hooks/useInstallApp";
import { usePageTitle } from "../hooks/usePageTitle";
import { useToast } from "../hooks/useToast";
import { copyText } from "../utils/clipboard";
import { openInChromeLink, openInSafariLink } from "../utils/installApp";
import "../styles/install.css";

// Pasos para instalar, según dónde esté la persona.
const GUIDES = {
  android: {
    title: "En Android",
    steps: [
      "Abre FriBuk en Chrome.",
      "Toca el menú del navegador (⋮), arriba a la derecha.",
      "Elige «Instalar aplicación» o «Agregar a pantalla principal».",
    ],
  },
  ios: {
    title: "En iPhone o iPad",
    steps: [
      "Abre FriBuk en Safari. También sirve Chrome, si tu iPhone está actualizado.",
      "Toca el botón Compartir: el cuadrado con una flecha hacia arriba. En Safari está abajo; en Chrome, arriba a la derecha.",
      "Desliza la lista hacia arriba y elige «Agregar a Inicio». En algunos iPhone dice «Añadir a pantalla de inicio».",
      "Toca «Agregar», arriba a la derecha.",
    ],
  },
  "in-app": {
    title: "Si abriste FriBuk desde Instagram, TikTok o Facebook",
    steps: [
      "Esas apps abren los enlaces en un navegador propio, que no permite instalar.",
      "Toca los tres puntos (⋯ o ⋮), arriba a la derecha.",
      "Elige «Abrir en navegador externo», «Abrir en Chrome» o «Abrir en Safari».",
      "Ya en el navegador, sigue los pasos de tu teléfono.",
    ],
  },
  desktop: {
    title: "En el computador",
    steps: [
      "Abre FriBuk en Chrome o Edge.",
      "Haz clic en el ícono de instalar, al final de la barra de direcciones.",
      "Confirma con «Instalar».",
    ],
  },
};

const GUIDE_FOR_PLATFORM = {
  android: "android",
  ios: "ios",
  "in-app-android": "in-app",
  "in-app-ios": "in-app",
  desktop: "desktop",
};

function Steps({ steps }) {
  return (
    <ol className="install-steps">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export default function Install() {
  usePageTitle("Instalar FriBuk");
  const { platform, canPrompt, install } = useInstallApp();
  const { showToast } = useToast();

  const currentKey = GUIDE_FOR_PLATFORM[platform];
  const currentGuide = GUIDES[currentKey];
  const otherGuides = Object.entries(GUIDES).filter(([key]) => key !== currentKey);

  // Dentro del navegador de otra app: antes de instalar hay que salir de ahí.
  const inApp = platform === "in-app-ios" || platform === "in-app-android";
  const browser = platform === "in-app-ios" ? "Safari" : "Chrome";
  const installUrl = `${window.location.origin}/instalar`;
  const openInBrowserLink =
    platform === "in-app-ios" ? openInSafariLink(installUrl) : openInChromeLink(installUrl);

  const handleCopy = async () => {
    if (await copyText(installUrl)) {
      showToast(`Enlace copiado. Pégalo en ${browser}.`);
    } else {
      showToast("No se pudo copiar el enlace.", "error");
    }
  };

  const handleInstall = async () => {
    if (await install()) {
      showToast("FriBuk quedó instalada. Búscala entre tus aplicaciones.");
    }
  };

  return (
    <div className="legal-page">
      <div className="legal-container">

        <Link to="/" className="legal-back">
          ← Volver a FriBuk
        </Link>

        <header className="legal-header">
          <span className="legal-label">APP</span>
          <h1>Instala FriBuk</h1>
        </header>

        <div className="legal-intro">
          <p>
            <strong>FriBuk</strong> se instala directo desde el navegador, sin
            pasar por una tienda de aplicaciones. Queda con su ícono en tu
            pantalla de inicio y se abre a pantalla completa, como cualquier
            otra app. Es gratis y ocupa muy poco espacio.
          </p>
        </div>

        <section className="legal-section install-current">
          <span className="install-current-label">EN ESTE DISPOSITIVO</span>

          {platform === "installed" ? (
            <>
              <h2>FriBuk ya está instalada</h2>
              <p>La estás usando como app. No hay nada más que hacer.</p>
            </>
          ) : inApp ? (
            <>
              <h2>Primero, sal de esta app</h2>
              <p>
                Abriste FriBuk dentro de otra aplicación (Instagram, TikTok,
                Facebook…). Desde aquí el teléfono no permite instalar: hay
                que abrirla en {browser}.
              </p>

              <div className="install-actions">
                <a className="install-action" href={openInBrowserLink}>
                  Abrir en {browser}
                </a>
                <button
                  type="button"
                  className="install-action is-secondary"
                  onClick={handleCopy}
                >
                  Copiar enlace
                </button>
              </div>

              <p>
                <strong>Si el botón no hace nada:</strong> toca los tres
                puntos (⋯), arriba a la derecha, y elige «Abrir en navegador
                externo». También puedes copiar el enlace y pegarlo en{" "}
                {browser}.
              </p>
              <p>
                Ya en {browser}, vuelve a tocar «Instalar app» y sigue los
                pasos.
              </p>
            </>
          ) : canPrompt ? (
            <>
              <h2>Lista para instalar</h2>
              <p>Tu navegador permite instalarla con un toque.</p>
              <button type="button" className="install-action" onClick={handleInstall}>
                Instalar FriBuk
              </button>
            </>
          ) : (
            <>
              <h2>{currentGuide.title}</h2>
              <Steps steps={currentGuide.steps} />
            </>
          )}
        </section>

        {otherGuides.map(([key, guide]) => (
          <section className="legal-section" key={key}>
            <h2>{guide.title}</h2>
            <Steps steps={guide.steps} />
          </section>
        ))}

        <section className="legal-section">
          <h2>¿Por qué no está en Play Store ni en App Store?</h2>
          <p>
            Porque así FriBuk decide sus propias reglas. Las tiendas de
            aplicaciones imponen las suyas sobre qué se puede publicar, y
            preferimos que eso lo definan nuestra{" "}
            <Link to="/contenido">Política de Contenido</Link> y la comunidad.
          </p>
        </section>

      </div>

      <SiteFooter />
    </div>
  );
}
