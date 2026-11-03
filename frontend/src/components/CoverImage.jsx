import { useState } from "react";
import { coverThumbUrl } from "../utils/coverThumb";

// Portada en tamaño de tarjeta: pide la miniatura y la descarga solo cuando
// está por verse en pantalla. Si la portada aún no tiene miniatura, muestra
// la portada completa.
export default function CoverImage({ src, alt, className }) {
  const thumb = coverThumbUrl(src);
  const [failedThumb, setFailedThumb] = useState(null);
  const useFull = failedThumb === thumb;

  return (
    <img
      src={useFull ? src : thumb}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (!useFull && thumb !== src) setFailedThumb(thumb);
      }}
    />
  );
}
