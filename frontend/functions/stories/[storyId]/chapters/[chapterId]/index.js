import { renderStoryPage } from "../../../../../server/storyPreview.js";

// Lectura de un capítulo: /stories/:storyId/chapters/:chapterId
export function onRequest(context) {
  return renderStoryPage(context, context.params.storyId, context.params.chapterId);
}
