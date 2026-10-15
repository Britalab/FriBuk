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
