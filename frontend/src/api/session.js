// Sesión del navegador: dónde se guardan los tokens y cómo se renuevan.
//
// El token de acceso dura poco. Antes de que venza, se cambia el token de
// renovación por una sesión nueva en segundo plano, y la persona sigue
// leyendo sin que nadie le pida la contraseña otra vez.

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// Se renueva cuando al token le queda menos que este margen.
const EXPIRY_MARGIN_SECONDS = 60;

// Aviso de que la sesión terminó de verdad y hay que volver a entrar.
export const SESSION_EXPIRED_EVENT = "fribuk:session-expired";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeSession({ access_token, refresh_token }) {
  if (access_token) localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Momento de vencimiento del token (en segundos), leído de su contenido.
// Devuelve null si no se puede leer: en ese caso decide el servidor.
export function tokenExpiry(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

export function isTokenExpiring(token, nowMs = Date.now()) {
  const expiry = tokenExpiry(token);
  return expiry !== null && expiry - nowMs / 1000 < EXPIRY_MARGIN_SECONDS;
}

let refreshInFlight = null;

// Pide una sesión nueva y devuelve el token de acceso, o null si no se pudo.
// `request` hace la llamada al backend y recibe el token de renovación.
// Varias peticiones a la vez comparten una sola renovación.
export function refreshSession(request) {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight = request(refreshToken)
    .then((session) => {
      storeSession(session);
      return session.access_token || null;
    })
    .catch((error) => {
      // 401: el token de renovación ya no sirve y la sesión terminó. Con
      // cualquier otro fallo (sin conexión, servidor caído) la sesión se
      // conserva y se reintenta en la siguiente petición.
      if (error?.response?.status === 401) {
        clearSession();
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}
