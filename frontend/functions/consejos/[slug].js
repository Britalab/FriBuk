import { renderTipPage } from "../../server/tipsPage.js";

// Un consejo para escribir: /consejos/:slug
export function onRequest(context) {
  return renderTipPage(context, context.params.slug);
}
