import axios from "axios";
import {
  getAccessToken,
  getRefreshToken,
  isTokenExpiring,
  refreshSession,
} from "./session";

// La dirección del backend sale de la variable de entorno VITE_API_URL
// (ver .env.example). Sin ella se usa el backend local de desarrollo.
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_URL,
});

// La renovación usa axios directo, sin los interceptores de abajo.
function requestNewSession(refreshToken) {
  return axios
    .post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
    .then((response) => response.data);
}

// Antes de cada request se agrega el token guardado. Si está por vencer,
// primero se renueva la sesión.
api.interceptors.request.use(async (config) => {
  let token = getAccessToken();

  if (token && getRefreshToken() && isTokenExpiring(token)) {
    token = (await refreshSession(requestNewSession)) || getAccessToken();
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si aun así el backend responde que el token no vale, se renueva la sesión
// y se repite la petición una sola vez.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status !== 401 ||
      !original ||
      original.sessionRetried ||
      !original.headers?.Authorization ||
      !getRefreshToken()
    ) {
      throw error;
    }

    const token = await refreshSession(requestNewSession);
    if (!token) throw error;

    original.sessionRetried = true;
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  }
);

export default api;
