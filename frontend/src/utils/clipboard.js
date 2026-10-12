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

// Copia un texto al portapapeles. Devuelve true si se pudo.
export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return legacyCopy(value);
  }
}
