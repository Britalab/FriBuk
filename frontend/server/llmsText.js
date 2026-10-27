// /llms.txt: una guía de FriBuk para asistentes de IA (formato de
// llmstxt.org), con las páginas principales y los consejos para escribir
// publicados. Si la API no responde, se entrega sin la lista de consejos.

import { TIPS_AUTHOR } from "../src/data/consejos.js";
import { stripInline } from "../src/utils/richText.js";
import { excerpt } from "./storyPreview.js";
import { fetchPublishedTips, TIPS_DESCRIPTION } from "./tipsPage.js";

const PAGES = [
  ["Inicio", "/", "historias y fanfics recomendados, los más leídos y el foro."],
  ["Buscar autores", "/autores", "perfiles de quienes escriben en FriBuk."],
  ["Foro", "/forum", "conversaciones entre lectores y escritores."],
  ["Preguntas frecuentes", "/preguntas-frecuentes", "si es gratis, cómo publicar, de quién son las obras."],
  ["Normas de comunidad", "/comunidad", "lo que se permite y lo que no."],
  ["Política de contenido", "/contenido", "clasificación y contenido sensible."],
  ["Derechos de autor", "/derechos-autor", "las obras son de quien las escribe."],
];

// Una línea de Markdown sin saltos ni corchetes que rompan el enlace.
function clean(text) {
  return String(text ?? "").replace(/\s+/g, " ").replace(/[[\]]/g, "").trim();
}

export function buildLlmsText(origin, tips = []) {
  const lines = [
    "# FriBuk",
    "",
    "> FriBuk es una plataforma gratuita en español para leer, escribir y publicar historias originales y fanfics, con una comunidad de lectores y escritores de todos los países hispanohablantes.",
    "",
    "Publicar en FriBuk no transfiere la propiedad: cada obra sigue siendo de quien la escribe. Las historias, los capítulos publicados, los perfiles públicos y los consejos se pueden leer sin cuenta.",
    "",
    "## Páginas principales",
    "",
    ...PAGES.map(([name, path, note]) => `- [${name}](${origin}${path}): ${note}`),
    "",
    `## Consejos para escribir, de ${TIPS_AUTHOR}`,
    "",
    `${TIPS_DESCRIPTION} Los firma ${TIPS_AUTHOR}, el personaje de FriBuk: sabia, mordaz y exigente, pero cariñosa a su manera.`,
    "",
    `- [Todos los consejos](${origin}/consejos)`,
    ...tips.map((tip) => {
      const note = excerpt(tip.description || stripInline(tip.summary || ""), 200);
      return `- [${clean(tip.title)}](${origin}/consejos/${encodeURIComponent(tip.slug)})` +
        (note ? `: ${clean(note)}` : "");
    }),
    "",
  ];
  return lines.join("\n");
}

export async function renderLlmsText(context) {
  const { request, env } = context;
  let tips = [];

  try {
    tips = await fetchPublishedTips(env);
  } catch (error) {
    console.error("llms.txt sin la lista de consejos:", error);
  }

  return new Response(
    request.method === "HEAD" ? null : buildLlmsText(new URL(request.url).origin, tips),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
