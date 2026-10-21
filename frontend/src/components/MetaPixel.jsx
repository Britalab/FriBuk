import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../utils/metaPixel";

// FriBuk cambia de página sin recargar: cada cambio de dirección cuenta
// como una visita para el píxel de Meta.
export default function MetaPixel() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(window.location);
  }, [location.pathname, location.search]);

  return null;
}
