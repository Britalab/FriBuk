import { useEffect, useState } from "react";

// Cerca del comienzo de la página la barra siempre se ve.
const ALWAYS_VISIBLE_UNTIL = 160;
// Desplazamiento mínimo para cambiar de estado: evita parpadeos.
const SCROLL_THRESHOLD = 8;

// Barra que se esconde al bajar leyendo y reaparece al subir un poco.
export default function useHideOnScroll(enabled = true) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let lastY = window.scrollY;
    let frame = null;

    const update = () => {
      frame = null;
      const y = window.scrollY;

      if (y < ALWAYS_VISIBLE_UNTIL) {
        setHidden(false);
      } else if (y - lastY > SCROLL_THRESHOLD) {
        setHidden(true);
      } else if (lastY - y > SCROLL_THRESHOLD) {
        setHidden(false);
      } else {
        return;
      }
      lastY = y;
    };

    const handleScroll = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return enabled && hidden;
}
