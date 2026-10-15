// Service worker de FriBuk.
//
// Hace dos cosas:
// - Si alguien abre FriBuk sin conexión, muestra un aviso propio en vez del
//   error del navegador. A propósito NO guarda copias del sitio ni de las
//   historias: todo se sigue pidiendo a internet, así nadie se queda viendo
//   una versión antigua.
// - Muestra los avisos push que envía el backend (ver backend/push.py) y,
//   al tocarlos, abre FriBuk en lo que avisan.

const OFFLINE_PAGE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1c1919" />
    <title>Sin conexión | FriBuk</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        background: #1c1919;
        color: #f3f0ea;
        font-family: Georgia, serif;
        text-align: center;
        line-height: 1.6;
      }
      h1 { margin: 0 0 8px; font-size: 1.6rem; }
      p { margin: 0 0 24px; opacity: 0.8; }
      button {
        min-height: 44px;
        padding: 10px 24px;
        border: 0;
        border-radius: 10px;
        background: #f3f0ea;
        color: #1c1919;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Estás sin conexión</h1>
      <p>FriBuk necesita internet para cargar las historias.</p>
      <button type="button" onclick="location.reload()">Reintentar</button>
    </main>
  </body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Solo al abrir una página; imágenes, datos y lo demás no se tocan.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_PAGE, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    )
  );
});

// ---------- Avisos push ----------

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }

  const tasks = [
    self.registration.showNotification(message.title || "FriBuk", {
      body: message.body || "Tienes una notificación nueva.",
      icon: "/icons/icon-192.png",
      lang: "es",
      tag: message.tag || undefined,
      data: { url: message.url || "/actividad" },
    }),
  ];

  // Número de pendientes sobre el ícono de la app, donde el sistema lo admite.
  if (typeof message.unread === "number" && "setAppBadge" in self.navigator) {
    tasks.push(
      (message.unread > 0
        ? self.navigator.setAppBadge(message.unread)
        : self.navigator.clearAppBadge()
      ).catch(() => {})
    );
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || "/actividad", self.location.origin);
  const path = target.pathname + target.search + target.hash;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find(
          (client) => new URL(client.url).origin === self.location.origin
        );
        // FriBuk ya está abierta: se trae al frente y la app navega sola.
        if (open) {
          open.postMessage({ type: "fribuk:navigate", path });
          return open.focus();
        }
        return self.clients.openWindow(path);
      })
  );
});
