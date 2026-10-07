import axios from "axios";

// La dirección del backend sale de la variable de entorno VITE_API_URL
// (ver .env.example). Sin ella se usa el backend local de desarrollo.
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_URL,
});

// Antes de cada request, si hay un token guardado, lo agrega automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;