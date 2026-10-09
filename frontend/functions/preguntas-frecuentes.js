import { renderFaqPage } from "../server/faqPage.js";

// Preguntas frecuentes: /preguntas-frecuentes
export function onRequest(context) {
  return renderFaqPage(context);
}
