// Rellena la página de un perfil antes de enviarla (ver storyPreview.js).
//
// Al compartir el enlace de un perfil, la vista previa muestra el nombre y
// la foto de esa persona en vez de la tarjeta genérica de FriBuk.

import { appPage, applyPreview, escapeHtml, excerpt, jsonLd } from "./storyPreview.js";

const SITE_NAME = "FriBuk";
const DEFAULT_API_URL = "https://api.fribuk.com";
const API_TIMEOUT_MS = 4000;

const BODY_STYLE =
  "max-width:720px;margin:0 auto;padding:32px 20px;font-family:Georgia,serif;line-height:1.7";

function storyCount(count) {
  return count === 1 ? "1 historia" : `${count} historias`;
}

// A partir de los datos públicos de la API, lo que se escribe en la página.
export function buildProfilePreview(data, origin, apiUrl) {
  const username = data.username || "";
  const displayName = data.display_name || "";
  const name = displayName && displayName !== username
    ? `${displayName} (@${username})`
    : `@${username}`;
  const url = `${origin}/usuario/${encodeURIComponent(data.id)}`;
  const stories = Array.isArray(data.stories) ? data.stories : [];
  // La foto en JPEG la entrega la API; sin foto, el logo.
  const image = data.avatar_version
    ? `${apiUrl}/seo/users/${encodeURIComponent(data.id)}/avatar.jpg` +
      `?v=${encodeURIComponent(data.avatar_version)}`
    : `${origin}/logo-fribuk.jpg`;

  const description =
    excerpt(data.bio) ||
    `Perfil de ${displayName || username} en ${SITE_NAME}` +
      (stories.length ? ` · ${storyCount(stories.length)}` : "") +
      ".";

  return {
    title: `${name} | ${SITE_NAME}`,
    description,
    image,
    url,
    type: "profile",
    // Foto pequeña al lado del texto, no una imagen grande.
    card: "summary",
    structuredData: jsonLd({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url,
      inLanguage: "es",
      mainEntity: {
        "@type": "Person",
        name: displayName || username,
        alternateName: `@${username}`,
        ...(data.bio ? { description: excerpt(data.bio, 500) } : {}),
        ...(data.avatar_version ? { image } : {}),
      },
    }),
    bodyHtml:
      `<main style="${BODY_STYLE}">` +
      `<h1>${escapeHtml(displayName || username)}</h1>` +
      `<p>@${escapeHtml(username)} · ${SITE_NAME}</p>` +
      (data.bio ? `<p>${escapeHtml(data.bio)}</p>` : "") +
      (stories.length
        ? `<h2>Historias</h2><ul>${stories
            .map((story) => (
              `<li><a href="/stories/${encodeURIComponent(story.id)}">` +
              `${escapeHtml(story.title || "Historia")}</a></li>`
            ))
            .join("")}</ul>`
        : "") +
      `</main>`,
  };
}

export async function renderProfilePage(context, userId) {
  const { request, env } = context;

  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  try {
    const apiUrl = (env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
    const apiResponse = await fetch(`${apiUrl}/seo/users/${encodeURIComponent(userId)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    // Cuenta eliminada, perfil inexistente o API caída: la página de siempre.
    if (!apiResponse.ok) return appPage(context);

    const data = await apiResponse.json();
    const page = await appPage(context);

    if (!(page.headers.get("content-type") || "").includes("text/html")) return page;

    return applyPreview(
      page,
      buildProfilePreview(data, new URL(request.url).origin, apiUrl)
    );
  } catch (error) {
    console.error("No se pudo preparar la vista previa del perfil:", error);
    return appPage(context);
  }
}
