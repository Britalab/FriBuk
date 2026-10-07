import { useCallback, useEffect, useState } from "react";
import api from "../api/client";

const NO_COMMENTS = [];

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

async function request(call, fallback) {
  try {
    const response = await call();
    return response.data;
  } catch (error) {
    throw new Error(errorMessage(error, fallback), { cause: error });
  }
}

// Carga todos los comentarios de un capítulo en una sola petición y expone
// las acciones para crearlos, editarlos, eliminarlos y reaccionar.
export function useChapterComments(chapterId, enabled, userId) {
  const [state, setState] = useState({ key: null, comments: NO_COMMENTS });

  // Si cambia el capítulo o la sesión, los datos anteriores dejan de valer.
  const key = enabled && chapterId ? `${chapterId}:${userId || ""}` : null;

  useEffect(() => {
    if (!key) return undefined;

    let cancelled = false;

    api
      .get(`/chapters/${chapterId}/comments`)
      .then((response) => {
        if (!cancelled) {
          setState({ key, comments: response.data?.comments || NO_COMMENTS });
        }
      })
      .catch(() => {
        // Sin comentarios el capítulo se sigue pudiendo leer.
        if (!cancelled) setState({ key, comments: NO_COMMENTS });
      });

    return () => {
      cancelled = true;
    };
  }, [key, chapterId]);

  const comments = state.key === key ? state.comments : NO_COMMENTS;

  const updateComments = useCallback((update) => {
    setState((current) => ({ ...current, comments: update(current.comments) }));
  }, []);

  const createComment = useCallback(async (anchor, content) => {
    const data = await request(
      () => api.post(`/chapters/${chapterId}/comments`, {
        content,
        paragraph_index: anchor.paragraphIndex,
        start_offset: anchor.startOffset,
        end_offset: anchor.endOffset,
        quote: anchor.quote,
      }),
      "No se pudo publicar el comentario."
    );
    updateComments((current) => [...current, data.comment]);
    return data.comment;
  }, [chapterId, updateComments]);

  const createReply = useCallback(async (parentId, content) => {
    const data = await request(
      () => api.post(`/chapters/${chapterId}/comments`, {
        content,
        parent_id: parentId,
      }),
      "No se pudo publicar la respuesta."
    );
    updateComments((current) => [...current, data.comment]);
    return data.comment;
  }, [chapterId, updateComments]);

  const updateComment = useCallback(async (commentId, content) => {
    const data = await request(
      () => api.put(`/chapter-comments/${commentId}`, { content }),
      "No se pudo guardar el comentario."
    );
    updateComments((current) => current.map((comment) => (
      comment.id === commentId
        ? { ...comment, content: data.comment.content, edited_at: data.comment.edited_at }
        : comment
    )));
  }, [updateComments]);

  const deleteComment = useCallback(async (commentId) => {
    await request(
      () => api.delete(`/chapter-comments/${commentId}`),
      "No se pudo eliminar el comentario."
    );
    updateComments((current) => current.filter((comment) => (
      comment.id !== commentId && comment.parent_id !== commentId
    )));
  }, [updateComments]);

  // Una reacción por comentario: elegir la misma la quita y elegir otra
  // la reemplaza.
  const toggleReaction = useCallback(async (comment, reaction) => {
    const data = await request(
      () => (comment.my_reaction === reaction
        ? api.delete(`/chapter-comments/${comment.id}/reactions/${reaction}`)
        : api.post(`/chapter-comments/${comment.id}/reactions`, { value: reaction })),
      "No se pudo guardar la reacción."
    );
    updateComments((current) => current.map((item) => (
      item.id === comment.id
        ? { ...item, reactions: data.reactions || {}, my_reaction: data.my_reaction || null }
        : item
    )));
  }, [updateComments]);

  return {
    comments,
    createComment,
    createReply,
    updateComment,
    deleteComment,
    toggleReaction,
  };
}
