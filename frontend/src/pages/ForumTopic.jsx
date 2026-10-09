import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import ReportButton from "../components/moderation/ReportButton";
import { RemoveButton, RestoreButton } from "../components/moderation/AdminModerationButtons";
import { ModerationNotice } from "../components/moderation/ModerationNotices";

const PRIMARY_INTERACTIONS = [
  { value: "up", emoji: "⬆️" },
  { value: "down", emoji: "⬇️" },
  { value: "heart", emoji: "❤️" },
];

const REACTION_INTERACTIONS = [
  { value: "laugh", emoji: "😂" },
  { value: "surprised", emoji: "😮" },
  { value: "clap", emoji: "👏" },
  { value: "sad", emoji: "😢" },
  { value: "angry", emoji: "😡" },
  { value: "blush", emoji: "😳" },
];

const interactionGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
};

const interactionLabelStyle = {
  color: "#722f3f",
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const interactionButtonsStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "6px",
};

function ForumInteractionControls({
  votes,
  reactions,
  currentVote,
  currentReactions,
  disabled,
  onPrimary,
  onReaction,
}) {
  const mainValue = currentVote ||
    (currentReactions.includes("heart") ? "heart" : null);

  return (
    <div className="forum-interactions">
      <div style={interactionGroupStyle}>
        <span style={interactionLabelStyle}>VOTO PRINCIPAL</span>
        <div style={interactionButtonsStyle}>
          {PRIMARY_INTERACTIONS.map(({ value, emoji }) => (
            <button
              key={value}
              type="button"
              className={mainValue === value ? "active" : ""}
              onClick={() => onPrimary(value)}
              disabled={disabled}
              aria-pressed={mainValue === value}
              aria-label={`${value === "up" ? "Voto positivo" : value === "down" ? "Voto negativo" : "Corazón"}: ${votes[value] || 0}`}
            >
              {emoji} <span>{votes[value] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={interactionGroupStyle}>
        <span style={interactionLabelStyle}>REACCIONES</span>
        <div className="forum-reactions" style={interactionButtonsStyle}>
          {REACTION_INTERACTIONS.map(({ value, emoji }) => (
            <button
              key={value}
              type="button"
              className={currentReactions.includes(value) ? "active" : ""}
              onClick={() => onReaction(value)}
              disabled={disabled}
              aria-pressed={currentReactions.includes(value)}
              aria-label={`${value}: ${reactions[value] || 0}`}
            >
              {emoji} <span>{reactions[value] || 0}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

// Foto de perfil de quien publicó; si no tiene, la inicial de su nombre.
function ForumAvatar({ username, avatarUrl }) {
  return (
    <div className="forum-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" loading="lazy" />
      ) : (
        (username || "U").charAt(0).toUpperCase()
      )}
    </div>
  );
}

export default function ForumTopic() {
  const { topicId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(null);
  const [topicInteractions, setTopicInteractions] = useState(null);
  const [replies, setReplies] = useState([]);
  const [topicInteractionLoading, setTopicInteractionLoading] = useState(false);
  const [replyInteractionLoading, setReplyInteractionLoading] = useState(false);

  const [reply, setReply] = useState("");
  const [replyImage, setReplyImage] = useState(null);
  const replyImageInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [replyLoading, setReplyLoading] = useState(false);

  const [error, setError] = useState("");
  const [repliesError, setRepliesError] = useState("");
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    const loadTopic = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(`/forum/topics/${topicId}`);

        setTopic(response.data);
      } catch (err) {
        console.error("Error cargando tema:", err);

        setError(
          err.response?.data?.detail ||
            "No se pudo cargar el tema."
        );
      } finally {
        setLoading(false);
      }
    };

    const loadTopicInteractions = async () => {
      try {
        const response = await api.get(
          `/forum/topics/${topicId}/interactions`
        );

        setTopicInteractions(response.data);
      } catch (err) {
        console.error(
          "Error cargando interacciones del tema:",
          err
        );
      }
    };

    const loadReplies = async () => {
      try {
        setRepliesLoading(true);
        setRepliesError("");

        const response = await api.get(
          `/forum/topics/${topicId}/replies`
        );

        const repliesWithInteractions = await Promise.all(
          response.data.map(loadReplyInteractions)
        );

        setReplies(repliesWithInteractions);
      } catch (err) {
        console.error("Error cargando respuestas:", err);

        setRepliesError(
          err.response?.data?.detail ||
            "No se pudieron cargar las respuestas."
        );
      } finally {
        setRepliesLoading(false);
      }
    };

    loadTopic();
    loadTopicInteractions();
    loadReplies();
  }, [topicId]);

  // Tras retirar o restaurar, el tema se vuelve a pedir: lo que se ve
  // depende de la moderación.
  const reloadTopic = async () => {
    try {
      const response = await api.get(`/forum/topics/${topicId}`);
      setTopic(response.data);
    } catch (err) {
      console.error("Error actualizando el tema:", err);
    }
  };

  // Eliminar lo propio (por ejemplo, si la imagen era la equivocada). No
  // es moderación: el backend solo deja borrar a quien publicó.
  const deleteOwnPost = async (path, question, successMessage, onDone) => {
    if (!window.confirm(question)) return;

    try {
      await api.delete(path);
      showToast(successMessage);
      await onDone();
    } catch (err) {
      console.error("Error eliminando la publicación:", err);
      showToast(
        err.response?.data?.detail || "No se pudo eliminar. Inténtalo nuevamente.",
        "error"
      );
    }
  };

  const reloadTopicInteractions = async () => {
    try {
      const response = await api.get(
        `/forum/topics/${topicId}/interactions`
      );

      setTopicInteractions(response.data);
    } catch (err) {
      console.error(
        "Error actualizando interacciones del tema:",
        err
      );
    }
  };

  const handleTopicVote = async (value) => {
    if (topicInteractionLoading) return;

    setTopicInteractionLoading(true);
    try {
      const currentVote =
        topicInteractions?.current_user?.vote || null;
      const currentReactions =
        topicInteractions?.current_user?.reactions || [];
      const hasHeart = currentReactions.includes("heart");
      const selectedPrimary = currentVote || (hasHeart ? "heart" : null);
      const isSelected = selectedPrimary === value;

      if (isSelected) {
        if (currentVote) {
          await api.delete(`/forum/topics/${topicId}/vote`);
        }
        if (hasHeart) {
          await api.delete(
            `/forum/topics/${topicId}/reactions/heart`
          );
        }
      } else if (value === "heart") {
        if (currentVote) {
          await api.delete(`/forum/topics/${topicId}/vote`);
        }
        await api.post(`/forum/topics/${topicId}/reactions`, {
          value: "heart",
        });
      } else {
        if (hasHeart) {
          await api.delete(
            `/forum/topics/${topicId}/reactions/heart`
          );
        }
        await api.put(`/forum/topics/${topicId}/vote`, {
          value,
        });
      }
      await reloadTopicInteractions();
    } catch (err) {
      console.error(
        "Error gestionando voto del tema:",
        err
      );
    } finally {
      setTopicInteractionLoading(false);
    }
  };

  const handleTopicReaction = async (value) => {
    if (topicInteractionLoading) return;

    setTopicInteractionLoading(true);
    try {
      const reactions =
        topicInteractions?.current_user?.reactions || [];

      const hasReaction = reactions.includes(value);
      const reactionsToRemove = REACTION_INTERACTIONS
        .map((reaction) => reaction.value)
        .filter((reaction) =>
          reactions.includes(reaction) &&
          (hasReaction || reaction !== value)
        );

      for (const reaction of reactionsToRemove) {
        await api.delete(
          `/forum/topics/${topicId}/reactions/${reaction}`
        );
      }

      if (!hasReaction) {
        await api.post(
          `/forum/topics/${topicId}/reactions`,
          {
            value,
          }
        );
      }

      await reloadTopicInteractions();

    } catch (err) {
      console.error(
        `Error gestionando reacción ${value}:`,
        err
      );
    } finally {
      setTopicInteractionLoading(false);
    }
  };

  const loadReplyInteractions = async (replyItem) => {
    try {
      const response = await api.get(
        `/forum/replies/${replyItem.id}/interactions`
      );

      return {
        ...replyItem,
        interactions: response.data,
      };
    } catch (err) {
      console.error(
        `Error cargando interacciones de la respuesta ${replyItem.id}:`,
        err
      );

      return {
        ...replyItem,
        interactions: {
          votes: {
            up: 0,
            down: 0,
          },
          reactions: {
            heart: 0,
            laugh: 0,
            surprised: 0,
            clap: 0,
            sad: 0,
            angry: 0,
            blush: 0,
          },
          current_user: {
            vote: null,
            reactions: [],
          },
        },
      };
    }
  };

  const reloadReplies = async () => {
    try {
      const response = await api.get(
        `/forum/topics/${topicId}/replies`
      );

      const repliesWithInteractions = await Promise.all(
        response.data.map(loadReplyInteractions)
      );

      setReplies(repliesWithInteractions);
    } catch (err) {
      console.error(
        "Error actualizando respuestas:",
        err
      );
    }
  };

  const handleReplyVote = async (replyItem, value) => {
    if (replyInteractionLoading) return;

    setReplyInteractionLoading(true);
    try {
      const currentVote =
        replyItem.interactions?.current_user?.vote || null;
      const currentReactions =
        replyItem.interactions?.current_user?.reactions || [];
      const hasHeart = currentReactions.includes("heart");
      const selectedPrimary = currentVote || (hasHeart ? "heart" : null);
      const isSelected = selectedPrimary === value;

      if (isSelected) {
        if (currentVote) {
          await api.delete(`/forum/replies/${replyItem.id}/vote`);
        }
        if (hasHeart) {
          await api.delete(
            `/forum/replies/${replyItem.id}/reactions/heart`
          );
        }
      } else if (value === "heart") {
        if (currentVote) {
          await api.delete(`/forum/replies/${replyItem.id}/vote`);
        }
        await api.post(
          `/forum/replies/${replyItem.id}/reactions`,
          { value: "heart" }
        );
      } else {
        if (hasHeart) {
          await api.delete(
            `/forum/replies/${replyItem.id}/reactions/heart`
          );
        }
        await api.put(
          `/forum/replies/${replyItem.id}/vote`,
          {
            value,
          }
        );
      }

      await reloadReplies();

    } catch (err) {
      console.error(
        "Error gestionando voto de la respuesta:",
        err
      );
    } finally {
      setReplyInteractionLoading(false);
    }
  };

  const handleReplyReaction = async (replyItem, value) => {
    if (replyInteractionLoading) return;

    setReplyInteractionLoading(true);
    try {
      const reactions =
        replyItem.interactions?.current_user?.reactions ||
        [];

      const hasReaction = reactions.includes(value);
      const reactionsToRemove = REACTION_INTERACTIONS
        .map((reaction) => reaction.value)
        .filter((reaction) =>
          reactions.includes(reaction) &&
          (hasReaction || reaction !== value)
        );

      for (const reaction of reactionsToRemove) {
        await api.delete(
          `/forum/replies/${replyItem.id}/reactions/${reaction}`
        );
      }

      if (!hasReaction) {
        await api.post(
          `/forum/replies/${replyItem.id}/reactions`,
          {
            value,
          }
        );
      }

      await reloadReplies();

    } catch (err) {
      console.error(
        `Error gestionando reacción ${value} de la respuesta:`,
        err
      );
    } finally {
      setReplyInteractionLoading(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();

    if (!reply.trim() && !replyImage) {
      setReplyError(
        "Escribe una respuesta o adjunta una imagen antes de publicarla."
      );
      return;
    }

    try {
      setReplyLoading(true);
      setReplyError("");

      const formData = new FormData();
      formData.append("content", reply.trim());
      if (replyImage) {
        formData.append("image", replyImage);
      }

      const response = await api.post(
        `/forum/topics/${topicId}/replies`,
        formData
      );

      const newReply = await loadReplyInteractions(
        response.data.reply
      );

      setReplies((prev) => [...prev, newReply]);

      setReply("");
      setReplyImage(null);
      if (replyImageInputRef.current) {
        replyImageInputRef.current.value = "";
      }
    } catch (err) {
      console.error(
        "Error publicando respuesta:",
        err
      );

      setReplyError(
        err.response?.data?.detail ||
          "No se pudo publicar la respuesta."
      );
    } finally {
      setReplyLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="forum-topic-page">
        <Link to="/forum" className="forum-back">
          ← Volver al foro
        </Link>

        <div className="forum-empty">
          <div className="forum-empty-icon">⏳</div>

          <h2>Cargando tema...</h2>

          <p>
            Estamos buscando esta conversación.
          </p>
        </div>
      </main>
    );
  }

  if (error || !topic) {
    return (
      <main className="forum-topic-page">
        <Link to="/forum" className="forum-back">
          ← Volver al foro
        </Link>

        <div className="forum-empty">
          <div className="forum-empty-icon">⚠️</div>

          <h2>No pudimos cargar el tema</h2>

          <p>
            {error || "El tema no existe."}
          </p>
        </div>
      </main>
    );
  }

  const topicVotes = topicInteractions?.votes || {
    up: 0,
    down: 0,
  };
  const topicReactionCounts = topicInteractions?.reactions || {};

  const topicCurrentVote =
    topicInteractions?.current_user?.vote || null;

  const topicReactions =
    topicInteractions?.current_user?.reactions || [];

  return (
    <main className="forum-topic-page">

      <Link to="/forum" className="forum-back">
        ← Volver al foro
      </Link>

      {/* TEMA PRINCIPAL */}
      <article className="forum-post">

        <div className="forum-post-header">
          <div>
            <span className="forum-post-label">
              TEMA
            </span>

            <h1>{topic.title}</h1>
          </div>
        </div>

        <div className="forum-post-user">

          <ForumAvatar username={topic.username} avatarUrl={topic.avatar_url} />

          <div>
            <strong>
              {topic.username || "Usuario"}
            </strong>

            <span>
              {new Date(
                topic.created_at
              ).toLocaleString()}
            </span>
          </div>

        </div>

        <ModerationNotice moderation={topic.moderation}>
          <div className="moderation-actions">
            <RestoreButton
              caseId={topic.moderation?.case_id}
              onRestored={reloadTopic}
            />
          </div>
        </ModerationNotice>

        <div className="forum-post-content">

          <p>{topic.content}</p>

          {topic.image_url && (
            <img
              src={topic.image_url}
              alt="Imagen del tema"
              className="forum-post-image"
            />
          )}

        </div>

        {/* INTERACCIONES DEL TEMA */}
        <ForumInteractionControls
          votes={{ ...topicVotes, heart: topicReactionCounts.heart || 0 }}
          reactions={topicReactionCounts}
          currentVote={topicCurrentVote}
          currentReactions={topicReactions}
          disabled={topicInteractionLoading}
          onPrimary={handleTopicVote}
          onReaction={handleTopicReaction}
        />

        {!topic.moderation && (
          <div className="moderation-actions">
            {user?.id !== topic.user_id && (
              <ReportButton targetType="forum_topic" targetId={topic.id} />
            )}
            {user && user.id === topic.user_id && (
              <>
                {topic.image_url && topic.content?.trim() && (
                  <button
                    type="button"
                    className="moderation-report-button"
                    onClick={() =>
                      deleteOwnPost(
                        `/forum/topics/${topic.id}/image`,
                        "¿Quitar la imagen de este tema? El texto se mantiene.",
                        "Imagen eliminada.",
                        reloadTopic
                      )
                    }
                  >
                    Quitar imagen
                  </button>
                )}
                <button
                  type="button"
                  className="moderation-report-button"
                  onClick={() =>
                    deleteOwnPost(
                      `/forum/topics/${topic.id}`,
                      "¿Eliminar este tema con todas sus respuestas? No se puede deshacer.",
                      "Tema eliminado.",
                      () => navigate("/forum")
                    )
                  }
                >
                  Eliminar tema
                </button>
              </>
            )}
            <RemoveButton
              targetType="forum_topic"
              targetId={topic.id}
              onRemoved={reloadTopic}
            />
          </div>
        )}

      </article>

      {/* RESPUESTAS */}
      <section className="forum-replies">

        <div className="forum-replies-header">
          <h2>
            Respuestas <span>{replies.length}</span>
          </h2>
        </div>

        {repliesLoading ? (
          <div className="forum-empty">

            <div className="forum-empty-icon">
              ⏳
            </div>

            <h2>
              Cargando respuestas...
            </h2>

            <p>
              Estamos buscando las respuestas de la comunidad.
            </p>

          </div>
        ) : repliesError ? (
          <div className="forum-empty">

            <div className="forum-empty-icon">
              ⚠️
            </div>

            <h2>
              No pudimos cargar las respuestas
            </h2>

            <p>
              {repliesError}
            </p>

          </div>
        ) : replies.length > 0 ? (
          replies.map((item) => {

            const replyVotes =
              item.interactions?.votes || {
                up: 0,
                down: 0,
              };

            const replyCurrentVote =
              item.interactions?.current_user?.vote ||
              null;

            const replyReactions =
              item.interactions?.current_user
                ?.reactions || [];
            const replyReactionCounts =
              item.interactions?.reactions || {};

            // Respuesta retirada: el resto solo ve que existió.
            if (item.moderation?.removed && !item.moderation.message) {
              return (
                <article key={item.id} className="forum-reply">
                  <p className="moderation-removed-placeholder">
                    Esta respuesta fue retirada por moderación.
                  </p>
                </article>
              );
            }

            return (
              <article
                key={item.id}
                className="forum-reply"
              >

                <ModerationNotice moderation={item.moderation}>
                  <div className="moderation-actions">
                    <RestoreButton
                      caseId={item.moderation?.case_id}
                      onRestored={reloadReplies}
                    />
                  </div>
                </ModerationNotice>

                <div className="forum-post-user">

                  <ForumAvatar username={item.username} avatarUrl={item.avatar_url} />

                  <div>
                    <strong>
                      {item.username || "Usuario"}
                    </strong>

                    <span>
                      {new Date(
                        item.created_at
                      ).toLocaleString()}
                    </span>
                  </div>

                </div>

                <div className="forum-reply-content">

                  {item.content && <p>{item.content}</p>}

                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt="Imagen de la respuesta"
                      className="forum-post-image"
                    />
                  )}

                </div>

                {/* INTERACCIONES DE LA RESPUESTA */}
                <ForumInteractionControls
                  votes={{
                    ...replyVotes,
                    heart: replyReactionCounts.heart || 0,
                  }}
                  reactions={replyReactionCounts}
                  currentVote={replyCurrentVote}
                  currentReactions={replyReactions}
                  disabled={replyInteractionLoading}
                  onPrimary={(value) => handleReplyVote(item, value)}
                  onReaction={(value) => handleReplyReaction(item, value)}
                />

                {!item.moderation && (
                  <div className="moderation-actions">
                    {user?.id !== item.user_id && (
                      <ReportButton targetType="forum_reply" targetId={item.id} />
                    )}
                    {user && user.id === item.user_id && (
                      <>
                        {item.image_url && item.content?.trim() && (
                          <button
                            type="button"
                            className="moderation-report-button"
                            onClick={() =>
                              deleteOwnPost(
                                `/forum/replies/${item.id}/image`,
                                "¿Quitar la imagen de esta respuesta? El texto se mantiene.",
                                "Imagen eliminada.",
                                reloadReplies
                              )
                            }
                          >
                            Quitar imagen
                          </button>
                        )}
                        <button
                          type="button"
                          className="moderation-report-button"
                          onClick={() =>
                            deleteOwnPost(
                              `/forum/replies/${item.id}`,
                              "¿Eliminar esta respuesta? No se puede deshacer.",
                              "Respuesta eliminada.",
                              reloadReplies
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                    <RemoveButton
                      targetType="forum_reply"
                      targetId={item.id}
                      onRemoved={reloadReplies}
                    />
                  </div>
                )}

              </article>
            );
          })
        ) : (
          <div className="forum-empty">

            <div className="forum-empty-icon">
              💬
            </div>

            <h2>
              Todavía no hay respuestas
            </h2>

            <p>
              Sé la primera persona en responder a este tema.
            </p>

          </div>
        )}

      </section>

      {/* EDITOR DE RESPUESTA */}
      <section className="forum-reply-editor">

        <h2>Responder</h2>

        <form onSubmit={handleReply}>

          <textarea
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              setReplyError("");
            }}
            placeholder="Escribe tu respuesta..."
            rows="5"
          />

          <div className="forum-image-picker">
            <label htmlFor="reply-image">Imagen (opcional)</label>
            <input
              ref={replyImageInputRef}
              id="reply-image"
              className="forum-image-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                setReplyImage(e.target.files?.[0] || null);
                setReplyError("");
              }}
            />
            {replyImage && (
              <span className="forum-selected-file">{replyImage.name}</span>
            )}
          </div>

          {replyError && (
            <div className="forum-form-error">
              {replyError}
            </div>
          )}

          <div className="forum-editor-bottom">

            <div className="forum-editor-tools">
              <span>
                💬 Comparte tu opinión con la comunidad
              </span>
            </div>

            <button
              type="submit"
              className="forum-submit"
              disabled={replyLoading}
            >
              {replyLoading
                ? "Publicando..."
                : "Publicar respuesta"}
            </button>

          </div>

        </form>

      </section>

    </main>
  );
}
