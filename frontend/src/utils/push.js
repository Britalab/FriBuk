import api from "../api/client";

// Notificaciones push: avisos en el dispositivo aunque FriBuk esté cerrada.
// El navegador entrega una suscripción (una por dispositivo) que se guarda
// en el backend; desde ahí se envían los avisos (ver backend/push.py).

function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// "supported", "ios-needs-install" (iPhone/iPad: Safari solo los permite
// con FriBuk agregada a la pantalla de inicio) o "unsupported".
export function pushSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "unsupported";
  }
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "supported";
  }
  return isAppleMobile() ? "ios-needs-install" : "unsupported";
}

// La clave del servidor llega en base64 URL; el navegador la pide en bytes.
export function keyToBytes(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function getRegistration() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) return registration;

  // En desarrollo el service worker no se registra solo.
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function currentSubscription() {
  if (pushSupport() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

// "on", "off", "denied" o "unavailable" (el servidor aún no tiene claves).
export async function getPushStatus() {
  const { data } = await api.get("/push/public-key");
  if (!data?.public_key) return "unavailable";
  if (Notification.permission === "denied") return "denied";

  const subscription = await currentSubscription();
  return Notification.permission === "granted" && subscription ? "on" : "off";
}

// Pide permiso (debe llamarse al pulsar un botón) y guarda la suscripción.
// Devuelve el estado resultante, igual que getPushStatus.
export async function enablePush() {
  const { data } = await api.get("/push/public-key");
  if (!data?.public_key) return "unavailable";

  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const registration = await getRegistration();
  const options = {
    userVisibleOnly: true,
    applicationServerKey: keyToBytes(data.public_key),
  };

  let subscription;
  try {
    subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe(options));
  } catch {
    // Quedó una suscripción con otra clave: se reemplaza.
    const old = await registration.pushManager.getSubscription();
    if (old) await old.unsubscribe();
    subscription = await registration.pushManager.subscribe(options);
  }

  await api.post("/push/subscriptions", subscription.toJSON());
  return "on";
}

// Deja de recibir avisos en este dispositivo.
export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return "off";

  try {
    await api.post("/push/unsubscribe", { endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe();
  }
  return "off";
}

// Al cerrar sesión, el dispositivo deja de recibir los avisos de esa cuenta.
// Recibe el token porque la sesión se borra antes de que termine la petición.
export async function forgetPushDevice(token) {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;

    if (token) {
      await api
        .post(
          "/push/unsubscribe",
          { endpoint: subscription.endpoint },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        .catch(() => {});
    }
    await subscription.unsubscribe();
  } catch {
    // Es una limpieza: si falla, el cierre de sesión sigue igual.
  }
}
