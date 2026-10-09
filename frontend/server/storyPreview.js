// Rellena la página de una historia o de un capítulo antes de enviarla.
//
// FriBuk se arma en el navegador: sin esto, un buscador, una IA o una red
// social que pide el enlace de una historia recibe una página vacía, sin
// título ni portada. Las funciones de Cloudflare (carpeta functions) piden
// los datos públicos a la API y los escriben en el HTML: título, descripción,
// vista previa para compartir y el texto, legible sin JavaScript.
//
// Al cargar, la aplicación reemplaza ese contenido por la página normal.
// Ante cualquier problema se entrega la página de siempre, sin cambios.

const SITE_NAME = "FriBuk";
const DEFAULT_API_URL = "https://api.fribuk.com";
const API_TIMEOUT_MS = 4000;
const DESCRIPTION_MAX_LENGTH = 180;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Texto en una sola línea y de largo acotado, para descripciones.
export function excerpt(text, maxLength = DESCRIPTION_MAX_LENGTH) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  const cut = clean.slice(0, maxLength - 1);
  // Si el corte cae justo al final de una palabra, se conserva entera.
  const endsOnWord = clean[maxLength - 1] === " ";
  const lastSpace = cut.lastIndexOf(" ");
  return `${(!endsOnWord && lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function paragraphs(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

// JSON seguro dentro de una etiqueta <script>.
export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const BODY_STYLE =
  "max-width:720px;margin:0 auto;padding:32px 20px;font-family:Georgia,serif;line-height:1.7";

// A partir de los datos públicos de la API, lo que se escribe en la página.
export function buildPreview(data, origin) {
  const storyTitle = data.title || "Historia";
  const author = data.author_username || "";
  const storyUrl = `${origin}/stories/${encodeURIComponent(data.id)}`;
  const storyPath = `/stories/${encodeURIComponent(data.id)}`;
  const image = data.cover_url || `${origin}/logo-fribuk.jpg`;
  const byline = author ? ` de ${author}` : "";
  const chapter = data.chapter;

  const authorHtml = author
    ? data.author_id
      ? `<a href="/usuario/${encodeURIComponent(data.author_id)}">${escapeHtml(author)}</a>`
      : escapeHtml(author)
    : "";

  const bookData = {
    "@type": "Book",
    name: storyTitle,
    url: storyUrl,
    inLanguage: "es",
    ...(author ? { author: { "@type": "Person", name: author } } : {}),
    ...(data.genre ? { genre: data.genre } : {}),
    ...(data.cover_url ? { image: data.cover_url } : {}),
  };

  if (chapter) {
    const chapterTitle = chapter.title || `Capítulo ${chapter.position}`;
    const url = `${storyUrl}/chapters/${encodeURIComponent(chapter.id)}`;
    const description =
      excerpt(chapter.content) ||
      `Capítulo ${chapter.position} de «${storyTitle}»${byline}.`;

    return {
      title: `${chapterTitle} · ${storyTitle} | ${SITE_NAME}`,
      description,
      image,
      url,
      type: "article",
      structuredData: jsonLd({
        "@context": "https://schema.org",
        "@type": "Chapter",
        name: chapterTitle,
        position: chapter.position,
        url,
        inLanguage: "es",
        isPartOf: bookData,
      }),
      bodyHtml:
        `<main style="${BODY_STYLE}">` +
        `<p>Capítulo ${escapeHtml(chapter.position)} de ` +
        `<a href="${storyPath}">${escapeHtml(storyTitle)}</a>` +
        `${authorHtml ? `, de ${authorHtml}` : ""}</p>` +
        `<h1>${escapeHtml(chapterTitle)}</h1>` +
        paragraphs(chapter.content) +
        (chapter.is_truncated ? "<p>…</p>" : "") +
        `</main>`,
    };
  }

  const description =
    excerpt(data.description) ||
    `Lee «${storyTitle}»${byline} en ${SITE_NAME}.`;
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];

  return {
    title: `${storyTitle}${byline} | ${SITE_NAME}`,
    description,
    image,
    url: storyUrl,
    type: "book",
    structuredData: jsonLd({
      "@context": "https://schema.org",
      ...bookData,
      ...(data.description ? { description: excerpt(data.description, 500) } : {}),
    }),
    bodyHtml:
      `<main style="${BODY_STYLE}">` +
      `<h1>${escapeHtml(storyTitle)}</h1>` +
      (authorHtml || data.genre
        ? `<p>${[
            authorHtml ? `Historia de ${authorHtml}` : "",
            data.genre ? escapeHtml(data.genre) : "",
          ].filter(Boolean).join(" · ")}</p>`
        : "") +
      paragraphs(data.description) +
      (chapters.length
        ? `<h2>Capítulos</h2><ol>${chapters
            .map((item, index) => (
              `<li><a href="${storyPath}/chapters/${encodeURIComponent(item.id)}">` +
              `${escapeHtml(item.title || `Capítulo ${index + 1}`)}</a></li>`
            ))
            .join("")}</ol>`
        : "") +
      `</main>`,
  };
}

// Escribe la vista previa en el HTML de la aplicación.
export function applyPreview(page, preview) {
  const setContent = (value) => ({
    element(element) {
      element.setAttribute("content", value);
    },
  });

  return new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(preview.title);
      },
    })
    .on('meta[name="description"]', setContent(preview.description))
    .on('meta[property="og:title"]', setContent(preview.title))
    .on('meta[property="og:description"]', setContent(preview.description))
    .on('meta[property="og:image"]', setContent(preview.image))
    .on('meta[property="og:type"]', setContent(preview.type))
    .on('meta[name="twitter:card"]', setContent(preview.card || "summary_large_image"))
    .on("head", {
      element(element) {
        element.append(
          `<link rel="canonical" href="${escapeHtml(preview.url)}" />` +
            `<meta property="og:url" content="${escapeHtml(preview.url)}" />` +
            `<script type="application/ld+json">${preview.structuredData}</script>`,
          { html: true }
        );
      },
    })
    .on("div#root", {
      element(element) {
        element.setInnerContent(preview.bodyHtml, { html: true });
      },
    })
    .transform(page);
}

// Página de la aplicación, tal como se serviría sin esta función.
export async function appPage(context) {
  const page = await context.next();
  if (page.status !== 404) return page;
  return context.env.ASSETS.fetch(new URL("/", context.request.url));
}

export async function renderStoryPage(context, storyId, chapterId) {
  const { request, env } = context;

  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  try {
    const apiUrl = (env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
    const query = chapterId ? `?chapter_id=${encodeURIComponent(chapterId)}` : "";
    const apiResponse = await fetch(
      `${apiUrl}/seo/stories/${encodeURIComponent(storyId)}${query}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      }
    );

    // Borrador, historia inexistente o API caída: la página de siempre.
    if (!apiResponse.ok) return appPage(context);

    const data = await apiResponse.json();
    const page = await appPage(context);

    if (!(page.headers.get("content-type") || "").includes("text/html")) return page;

    return applyPreview(page, buildPreview(data, new URL(request.url).origin));
  } catch (error) {
    console.error("No se pudo preparar la vista previa:", error);
    return appPage(context);
  }
}
