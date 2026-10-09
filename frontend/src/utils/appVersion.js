// Detecta si se publicó una versión del sitio más nueva que la que esta
// pestaña tiene cargada.
//
// FriBuk se descarga una vez al entrar y sigue funcionando sin recargar, así
// que una pestaña abierta puede quedarse días con una versión antigua. Cada
// publicación deja su identificador en /version.json (lo genera el build).

export const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || "";

// Devuelve true solo cuando se sabe con certeza que hay una versión distinta
// publicada. Sin conexión, en desarrollo o ante cualquier duda, false.
export async function hasNewVersion(
  currentVersion = CURRENT_VERSION,
  fetchImpl = window.fetch.bind(window)
) {
  if (!currentVersion) return false;

  try {
    // El parámetro evita que una copia guardada responda en lugar del servidor.
    const response = await fetchImpl(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return false;

    const published = (await response.json())?.version;
    return typeof published === "string" && published !== "" && published !== currentVersion;
  } catch {
    return false;
  }
}
