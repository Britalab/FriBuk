import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Al entrar a otra página (por ejemplo, desde el pie de página) se empieza
// desde arriba. Con los botones atrás/adelante del navegador no se mueve,
// para volver a donde estaba el lector.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [pathname, navigationType]);

  return null;
}
