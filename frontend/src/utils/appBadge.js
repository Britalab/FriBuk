// Número sobre el ícono de FriBuk instalada como app (Badging API).
// Solo lo muestran algunos sistemas; en el resto no hace nada.
export function updateAppBadge(count) {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;

  const request = count > 0
    ? navigator.setAppBadge(count)
    : navigator.clearAppBadge();

  // Puede negarse (por ejemplo, sin permiso de notificaciones en iPhone).
  Promise.resolve(request).catch(() => {});
}

// Quita de la barra del teléfono los avisos push ya vistos en FriBuk. En
// Android el número del ícono cuenta esos avisos, así que sin esto no baja
// aunque se lean en la campana. `matches` recibe la etiqueta de cada aviso
// (ver backend/push.py: "notificacion-<id>", "mensaje-<id>").
export async function closeShownNotifications(matches = () => true) {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const registration = await navigator.serviceWorker.ready;
    const shown = await registration.getNotifications();
    shown.filter((notification) => matches(notification.tag || "")).forEach(
      (notification) => notification.close()
    );
  } catch {
    // Sin service worker o sin permiso: no hay avisos que quitar.
  }
}

export const isNotificationTag = (tag) => tag.startsWith("notificacion-");
export const isMessageTag = (tag) => tag.startsWith("mensaje-");
