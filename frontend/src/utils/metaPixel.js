// Píxel de Meta: mide las visitas que llegan desde los anuncios de
// Facebook e Instagram. Solo en el sitio publicado.
//
// El píxel envía a Meta la dirección completa de la página. Los enlaces de
// recuperación de contraseña (y cualquier otro con un código de acceso)
// llevan secretos en la dirección, así que en esas páginas no se carga ni
// se registra nada.
export const META_PIXEL_ID = "1403865680178459";

const SECRET_PARAMS = /(?:^|[?&#])(?:access_token|refresh_token|token_hash|code)=/;

export function isSensitiveUrl({ pathname = "", search = "", hash = "" }) {
  return pathname === "/restablecer" || SECRET_PARAMS.test(`${search}#${hash.replace(/^#/, "")}`);
}

function loadPixel() {
  if (window.fbq) return;

  // Código base de Meta, reescrito sin minificar.
  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  // Sin lectura automática de botones ni formularios de la página.
  fbq("set", "autoConfig", false, META_PIXEL_ID);
  fbq("init", META_PIXEL_ID);
}

export function trackPageView(location = window.location) {
  if (!import.meta.env.PROD || isSensitiveUrl(location)) return;

  loadPixel();
  window.fbq("track", "PageView");
}
