// Versión de las preguntas frecuentes que reciben los buscadores y los
// asistentes de IA: el mismo contenido de la página, escrito en el HTML y
// con datos estructurados, legible sin JavaScript. Ver storyPreview.js.

import { FAQ } from "../src/data/faq.js";
import { appPage, applyPreview, escapeHtml, jsonLd } from "./storyPreview.js";

const TITLE = "Preguntas frecuentes | FriBuk";
const DESCRIPTION =
  "Respuestas a lo que más nos preguntan sobre FriBuk: si es gratis, cómo publicar tu historia o fanfic, de quién son las obras y cómo funciona la comunidad.";
const BODY_STYLE =
  "max-width:720px;margin:0 auto;padding:32px 20px;font-family:Georgia,serif;line-height:1.7";

export function buildFaqPage(origin, questions = FAQ) {
  return {
    title: TITLE,
    description: DESCRIPTION,
    image: `${origin}/logo-fribuk.jpg`,
    url: `${origin}/preguntas-frecuentes`,
    type: "website",
    card: "summary",
    structuredData: jsonLd({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    }),
    bodyHtml:
      `<main style="${BODY_STYLE}"><h1>Preguntas frecuentes de FriBuk</h1>` +
      questions
        .map((item) => (
          `<h2>${escapeHtml(item.question)}</h2><p>${escapeHtml(item.answer)}</p>` +
          (item.link
            ? `<p><a href="${escapeHtml(item.link.to)}">${escapeHtml(item.link.label)}</a></p>`
            : "")
        ))
        .join("") +
      `</main>`,
  };
}

export async function renderFaqPage(context) {
  const { request } = context;

  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  try {
    const page = await appPage(context);

    if (!(page.headers.get("content-type") || "").includes("text/html")) return page;

    return applyPreview(page, buildFaqPage(new URL(request.url).origin));
  } catch (error) {
    console.error("No se pudieron preparar las preguntas frecuentes:", error);
    return appPage(context);
  }
}
