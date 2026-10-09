import { useEffect } from "react";

const SITE_NAME = "FriBuk";

// Título de la pestaña del navegador para la página actual. Sin título
// (por ejemplo, mientras carga) queda el nombre del sitio.
export function usePageTitle(title) {
  useEffect(() => {
    const clean = (title || "").trim();
    document.title = clean ? `${clean} | ${SITE_NAME}` : SITE_NAME;

    return () => {
      document.title = SITE_NAME;
    };
  }, [title]);
}
