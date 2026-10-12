import { useToast } from "../hooks/useToast";

// Copia sin la API moderna: navegadores antiguos o integrados en otras apps.
function legacyCopy(value) {
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return legacyCopy(value);
  }
}

// Botón "Compartir" de una historia, un capítulo o un perfil. En el teléfono
// abre el menú del sistema (WhatsApp, Instagram, etc.); en el computador ese
// menú estorba más de lo que ayuda, así que se copia el enlace.
// `path` es la ruta dentro del sitio: el enlace nunca arrastra filtros ni
// otros restos de la dirección actual.
export default function ShareButton({
  path,
  title,
  text,
  label = "Compartir",
  className = "favorite-button",
}) {
  const { showToast } = useToast();

  const handleShare = async () => {
    const url = `${window.location.origin}${path}`;
    const isTouch = window.matchMedia?.("(pointer: coarse)").matches;

    if (isTouch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // Cerrar el menú sin elegir nada no es un error.
        if (error?.name === "AbortError") return;
        console.error("Error al compartir:", error);
      }
    }

    if (await copyText(url)) {
      showToast("Enlace copiado. Ya puedes pegarlo donde quieras.");
    } else {
      showToast("No se pudo copiar el enlace. Cópialo desde la barra de direcciones.", "error");
    }
  };

  return (
    <button type="button" className={className} onClick={handleShare}>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {label}
    </button>
  );
}
