import { renderStoryPage } from "../../../server/storyPreview.js";

// Página de una historia: /stories/:storyId
export function onRequest(context) {
  return renderStoryPage(context, context.params.storyId, null);
}
