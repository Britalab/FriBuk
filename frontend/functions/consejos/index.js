import { renderTipsIndexPage } from "../../server/tipsPage.js";

// Consejos para escribir: /consejos
export function onRequest(context) {
  return renderTipsIndexPage(context);
}
