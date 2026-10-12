// Instalación de FriBuk en el teléfono o el computador, desde el navegador.
//
// Cada sistema lo permite de una forma distinta:
// - Android (Chrome y parecidos) avisa con un evento que deja mostrar un
//   botón "Instalar" propio.
// - iPhone y iPad no avisan: hay que explicar los pasos.
// - Los navegadores que vienen dentro de Instagram, TikTok o Facebook no
//   permiten instalar: primero hay que abrir FriBuk en el navegador.

const IN_APP_BROWSER =
  /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|Line\/|Snapchat|Pinterest/i;

// "installed" | "in-app-ios" | "in-app-android" | "ios" | "android" | "desktop"
export function detectPlatform({ userAgent = "", maxTouchPoints = 0, standalone = false } = {}) {
  if (standalone) return "installed";

  // Los iPad recientes se presentan como un Mac, pero con pantalla táctil.
  const isIos =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);

  if (IN_APP_BROWSER.test(userAgent)) return isIos ? "in-app-ios" : "in-app-android";
  if (isIos) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export function currentPlatform() {
  return detectPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      navigator.standalone === true,
  });
}

// Enlace que, desde el navegador de otra app en Android, abre la misma
// página en Chrome. Si Chrome no está, el teléfono usa la dirección normal.
export function openInChromeLink(url) {
  const { host, pathname, search } = new URL(url);
  return (
    `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
  );
}

// Lo mismo en iPhone: abre la página en Safari. Solo funciona desde iOS 17;
// en versiones anteriores el enlace no hace nada, así que siempre va
// acompañado de los pasos para hacerlo a mano.
export function openInSafariLink(url) {
  return url.replace(/^https?:\/\//, "x-safari-https://");
}

// El aviso del navegador puede llegar antes de que la página termine de
// armarse, así que se guarda aquí hasta que alguien pulse "Instalar".
let promptEvent = null;
let state = { canPrompt: false, installed: false };
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sin esto, Chrome muestra su propio aviso cuando quiere.
    event.preventDefault();
    promptEvent = event;
    setState({ canPrompt: true });
  });

  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    setState({ canPrompt: false, installed: true });
  });
}

export function subscribeInstallState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallState() {
  return state;
}

// Abre la ventana de instalación del navegador. Devuelve true si la persona
// aceptó. Cada aviso sirve una sola vez.
export async function promptInstall() {
  if (!promptEvent) return false;

  const event = promptEvent;
  promptEvent = null;
  setState({ canPrompt: false });

  event.prompt();
  const choice = await event.userChoice;
  return choice?.outcome === "accepted";
}

const DISMISSED_KEY = "fribuk-install-dismissed";
const DISMISSED_DAYS = 30;

// Quien cierra la invitación no la vuelve a ver por un mes.
export function isInstallDismissed(now = Date.now()) {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY));
    return dismissedAt > 0 && now - dismissedAt < DISMISSED_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissInstall(now = Date.now()) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now));
  } catch {
    // Sin almacenamiento, la invitación vuelve en la próxima visita.
  }
}
