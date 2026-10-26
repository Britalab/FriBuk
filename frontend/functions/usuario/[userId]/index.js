import { renderProfilePage } from "../../../server/profilePreview.js";

// Página de un perfil: /usuario/:userId
export function onRequest(context) {
  return renderProfilePage(context, context.params.userId);
}
