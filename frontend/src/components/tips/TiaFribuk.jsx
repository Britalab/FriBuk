import { tipImage } from "../../data/consejos";

// Tía FriBuk en un marco crema "de papel", igual en modo claro y oscuro: así
// sus bordes se ven limpios sobre cualquier fondo.
// variant: "avatar" (círculo, recorta a la altura del rostro) o "figure"
// (la pose completa, en un recuadro).
export default function TiaFribuk({ pose = "retrato", variant = "avatar", alt = "", className = "" }) {
  return (
    <span className={`tia-fribuk is-${variant}${className ? ` ${className}` : ""}`}>
      <img src={tipImage(pose)} alt={alt} loading="lazy" decoding="async" />
    </span>
  );
}
