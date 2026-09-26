import { useCallback, useEffect, useRef, useState } from "react";
import { ToastContext } from "../context/ToastContext";

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = "success") => {
    const id = ++nextId.current;
    const toast = { id, message, type };

    setToasts((current) => [...current.slice(-2), toast]);
    timers.current.set(id, setTimeout(() => dismissToast(id), type === "error" ? 6000 : 3800));
    return id;
  }, [dismissToast]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <div
            className={`app-toast app-toast-${toast.type}`}
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <span className="app-toast-icon" aria-hidden="true">
              {toast.type === "error" ? "!" : "✓"}
            </span>
            <p>{toast.message}</p>
            <button
              type="button"
              className="app-toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Cerrar notificación"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
