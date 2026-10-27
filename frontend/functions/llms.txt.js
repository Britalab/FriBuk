import { renderLlmsText } from "../server/llmsText.js";

// Guía del sitio para asistentes de IA: /llms.txt
export function onRequest(context) {
  return renderLlmsText(context);
}
