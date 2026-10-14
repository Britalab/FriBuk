import { useEffect } from "react";
import api from "../api/client";

// Cada cuánto se avisa al backend el tiempo leído.
const REPORT_INTERVAL = 30_000;
// Sin mover la página, el teclado ni el puntero en este tiempo, se deja
// de contar: la pestaña abierta sola no es lectura.
const IDLE_LIMIT = 120_000;

// Registra el tiempo de lectura de un capítulo (para Primer Lector,
// Maratonista, Lector Fiel y Autor Popular). Solo cuenta con la pestaña
// visible y alguien activo, y avisa cuando se llega al final del texto.
export default function useReadingTime({ chapterId, enabled, endRef }) {
  useEffect(() => {
    if (!enabled || !chapterId) return undefined;

    let countedMs = 0;
    let lastTick = Date.now();
    let lastActivity = Date.now();
    let reachedEnd = false;
    let endReported = false;

    const tick = () => {
      const now = Date.now();
      const visible = document.visibilityState === "visible";
      if (visible && now - lastActivity < IDLE_LIMIT) {
        countedMs += now - lastTick;
      }
      lastTick = now;
    };

    const report = () => {
      tick();
      const seconds = Math.floor(countedMs / 1000);
      const sendEnd = reachedEnd && !endReported;
      if (seconds <= 0 && !sendEnd) return;

      countedMs -= seconds * 1000;
      if (sendEnd) endReported = true;
      api
        .post(`/chapters/${chapterId}/reading`, { seconds, reached_end: sendEnd })
        .then((response) => {
          // Si aún no alcanzaba para darlo por terminado, se reintenta luego.
          if (sendEnd && !response.data?.completed) endReported = false;
        })
        .catch((error) => {
          if (sendEnd) endReported = false;
          console.error("Error al registrar la lectura:", error);
        });
    };

    const markActive = () => {
      tick();
      lastActivity = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        report();
      } else {
        lastTick = Date.now();
        lastActivity = Date.now();
      }
    };

    let observer = null;
    if (endRef?.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reachedEnd = true;
      });
      observer.observe(endRef.current);
    }

    const interval = setInterval(report, REPORT_INTERVAL);
    const activityEvents = ["scroll", "keydown", "pointerdown", "pointermove", "touchstart"];
    activityEvents.forEach((name) =>
      window.addEventListener(name, markActive, { passive: true })
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      observer?.disconnect();
      activityEvents.forEach((name) => window.removeEventListener(name, markActive));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Al salir del capítulo se envía lo último leído.
      report();
    };
  }, [chapterId, enabled, endRef]);
}
