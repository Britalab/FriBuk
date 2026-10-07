import { useEffect, useState } from "react";
import api from "../api/client";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;
const EMPTY_RESULT = { key: null, users: [], hasMore: false, error: "" };

// Igual que el backend: admite "@usuario" y descarta los espacios sobrantes.
export function cleanUserSearchTerm(value) {
  return (value || "").trim().replace(/^@+/, "").trim();
}

// Búsqueda de usuarios por username contra GET /users/search.
// Espera a que se deje de escribir, cancela la petición anterior y expone el
// estado: "idle" | "short" | "loading" | "success" | "error".
// Con `browse`, un texto vacío muestra los primeros usuarios en orden alfabético.
export function useUserSearch(value, { limit = 20, browse = false } = {}) {
  const [result, setResult] = useState(EMPTY_RESULT);
  const [retryCount, setRetryCount] = useState(0);

  const term = cleanUserSearchTerm(value);
  const mode =
    term.length === 0
      ? browse ? "search" : "idle"
      : term.length < MIN_LENGTH ? "short" : "search";
  const requestKey = `${term}|${limit}|${retryCount}`;

  useEffect(() => {
    if (mode !== "search") return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get("/users/search", {
          params: { q: term, limit },
          signal: controller.signal,
        })
        .then((response) => {
          setResult({
            key: requestKey,
            users: response.data.users || [],
            hasMore: Boolean(response.data.has_more),
            error: "",
          });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error("Error al buscar usuarios:", error);
          const detail = error.response?.data?.detail;
          setResult({
            key: requestKey,
            users: [],
            hasMore: false,
            error:
              typeof detail === "string"
                ? detail
                : "No pudimos buscar usuarios. Inténtalo nuevamente.",
          });
        });
    }, term ? DEBOUNCE_MS : 0);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, term, limit, requestKey]);

  const isCurrent = result.key === requestKey;
  const status =
    mode !== "search"
      ? mode
      : !isCurrent ? "loading" : result.error ? "error" : "success";

  return {
    term,
    status,
    // Mientras carga se conservan los resultados anteriores para que no parpadee.
    users: mode === "search" && !result.error ? result.users : [],
    hasMore: mode === "search" && isCurrent && result.hasMore,
    error: status === "error" ? result.error : "",
    retry: () => setRetryCount((count) => count + 1),
  };
}
