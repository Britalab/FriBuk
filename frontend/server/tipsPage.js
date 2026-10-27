// Versión de los consejos para escribir (/consejos y /consejos/:slug) que
// reciben los buscadores, las redes sociales y los asistentes de IA: el
// mismo contenido de la página, escrito en el HTML y con datos
// estructurados, legible sin JavaScript. Ver storyPreview.js.
//
// Los consejos vienen de la API (backend/tips.py), que sin sesión entrega
// solo los publicados. Ante cualquier problema se entrega la página de
// siempre, sin cambios.

import { TIPS_AUTHOR } from "../src/data/consejos.js";
import { stripInline } from "../src/utils/richText.js";
import {
  API_TIMEOUT_MS,
  DEFAULT_API_URL,
  appPage,
  applyPreview,
  escapeHtml,
  excerpt,
  jsonLd,
  paragraphs,
} from "./storyPreview.js";

const SITE_NAME = "FriBuk";
const INDEX_TITLE = `Consejos para escribir de ${TIPS_AUTHOR} | ${SITE_NAME}`;
export const TIPS_DESCRIPTION =
  "Consejos de escritura con un poco de sarcasmo y mucha experiencia: cómo crear personajes, organizar una trama, escribir diálogos y superar el bloqueo creativo.";
const SHARE_IMAGE = "/tia-fribuk/tia-fribuk-compartir.jpg";
const BODY_STYLE =
  "max-width:720px;margin:0 auto;padding:32px 20px;font-family:Georgia,serif;line-height:1.7";

// tía FriBuk es un personaje de FriBuk: firma los consejos, que publica
// el sitio.
function authorData(origin) {
  return {
    "@type": "Person",
    name: TIPS_AUTHOR,
    url: `${origin}/consejos`,
    description: `Personaje de ${SITE_NAME} que firma los consejos para escribir.`,
  };
}

function publisherData(origin) {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: `${origin}/`,
    logo: { "@type": "ImageObject", url: `${origin}/logo-fribuk.jpg` },
  };
}

function tipUrl(origin, tip) {
  return `${origin}/consejos/${encodeURIComponent(tip.slug)}`;
}

// La descripción escrita para Google o, si falta, el comienzo del resumen.
function tipDescription(tip) {
  return excerpt(tip.description || stripInline(tip.summary || "")) ||
    `${tip.title}: un consejo para escribir de ${TIPS_AUTHOR}.`;
}

function wordCount(sections) {
  return sections
    .map((section) => `${section.heading || ""} ${stripInline(section.text || "")}`)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function buildTipsIndexPage(origin, tips) {
  const url = `${origin}/consejos`;

  return {
    title: INDEX_TITLE,
    description: TIPS_DESCRIPTION,
    image: `${origin}${SHARE_IMAGE}`,
    url,
    type: "website",
    structuredData: jsonLd({
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `Consejos para escribir de ${TIPS_AUTHOR}`,
      description: TIPS_DESCRIPTION,
      url,
      inLanguage: "es",
      author: authorData(origin),
      publisher: publisherData(origin),
      blogPost: tips.map((tip) => ({
        "@type": "BlogPosting",
        headline: tip.title,
        url: tipUrl(origin, tip),
        ...(tip.published_at ? { datePublished: tip.published_at } : {}),
      })),
    }),
    bodyHtml:
      `<main style="${BODY_STYLE}">` +
      `<h1>Ideas para darle vida a tus historias</h1>` +
      `<p>Consejos de escritura con un poco de sarcasmo y mucha experiencia, de ${escapeHtml(TIPS_AUTHOR)}.</p>` +
      `<ol>${tips
        .map((tip) => (
          `<li><h2><a href="/consejos/${encodeURIComponent(tip.slug)}">${escapeHtml(tip.title)}</a></h2>` +
          (tip.summary ? `<p>${escapeHtml(stripInline(tip.summary))}</p>` : "") +
          `</li>`
        ))
        .join("")}</ol>` +
      `</main>`,
  };
}

export function buildTipPage(origin, tip) {
  const url = tipUrl(origin, tip);
  const description = tipDescription(tip);
  const image = `${origin}${SHARE_IMAGE}`;
  const sections = Array.isArray(tip.sections) && tip.sections.length
    ? tip.sections
    : [{ heading: "", text: tip.summary || "" }];

  return {
    title: `${tip.title} | Consejos de ${TIPS_AUTHOR}`,
    description,
    image,
    url,
    type: "article",
    structuredData: jsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BlogPosting",
          headline: tip.title,
          description,
          url,
          mainEntityOfPage: url,
          image,
          inLanguage: "es",
          ...(tip.published_at ? { datePublished: tip.published_at } : {}),
          ...(tip.updated_at || tip.published_at
            ? { dateModified: tip.updated_at || tip.published_at }
            : {}),
          wordCount: wordCount(sections),
          author: authorData(origin),
          publisher: publisherData(origin),
          isPartOf: {
            "@type": "Blog",
            name: `Consejos para escribir de ${TIPS_AUTHOR}`,
            url: `${origin}/consejos`,
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${origin}/` },
            { "@type": "ListItem", position: 2, name: "Consejos para escribir", item: `${origin}/consejos` },
            { "@type": "ListItem", position: 3, name: tip.title, item: url },
          ],
        },
      ],
    }),
    bodyHtml:
      `<main style="${BODY_STYLE}">` +
      `<p><a href="/consejos">Consejos para escribir</a></p>` +
      `<h1>${escapeHtml(tip.title)}</h1>` +
      `<p>Por ${escapeHtml(TIPS_AUTHOR)}` +
      (tip.published_at
        ? ` · <time datetime="${escapeHtml(tip.published_at)}">${escapeHtml(tip.published_at)}</time>`
        : "") +
      `</p>` +
      sections
        .map((section) => (
          (section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "") +
          paragraphs(section.text)
        ))
        .join("") +
      `</main>`,
  };
}

async function fetchApi(env, path) {
  const apiUrl = (env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`La API respondió ${response.status}`);
  return response.json();
}

// Los consejos publicados, para otras páginas (llms.txt).
export async function fetchPublishedTips(env) {
  const data = await fetchApi(env, "/tips");
  return (data.tips || []).filter((tip) => tip.status === "published");
}

async function renderWith(context, loadPreview) {
  const { request } = context;

  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  try {
    const preview = await loadPreview(new URL(request.url).origin);
    const page = await appPage(context);

    if (!(page.headers.get("content-type") || "").includes("text/html")) return page;

    return applyPreview(page, preview);
  } catch (error) {
    console.error("No se pudo preparar la página de consejos:", error);
    return appPage(context);
  }
}

export function renderTipsIndexPage(context) {
  return renderWith(context, async (origin) =>
    buildTipsIndexPage(origin, await fetchPublishedTips(context.env))
  );
}

export function renderTipPage(context, slug) {
  // /consejos/nuevo es el editor (solo admin): la página de siempre.
  if (slug === "nuevo") return appPage(context);

  return renderWith(context, async (origin) => {
    const data = await fetchApi(context.env, `/tips/${encodeURIComponent(slug)}`);
    return buildTipPage(origin, data.tip);
  });
}
