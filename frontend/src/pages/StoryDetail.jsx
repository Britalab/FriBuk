import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import AddToListMenu from "../components/profile/AddToListMenu";
import { contentWarningLabels } from "../utils/contentWarnings";
import ReportButton from "../components/moderation/ReportButton";
import { RemoveButton } from "../components/moderation/AdminModerationButtons";
import "../styles/moderation.css";

export default function StoryDetail() {
  const { storyId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [voteCount, setVoteCount] = useState(0);
  const [ratingAverage, setRatingAverage] = useState(null);
  // Punto donde el lector dejó esta historia, si ya la empezó.
  const [readingProgress, setReadingProgress] = useState(null);

  const isOwner = user && story && user.id === story.author_id;

  // =========================================
  // VOTO
  // =========================================

  const [hasVoted, setHasVoted] = useState(false);
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteError, setVoteError] = useState("");

  // =========================================
  // FAVORITOS
  // =========================================

  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");

  // =========================================
  // EVALUACIÓN
  // =========================================

  const [plot, setPlot] = useState(0);
  const [spelling, setSpelling] = useState(0);
  const [myRatingLoaded, setMyRatingLoaded] = useState(false);

  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingMessage, setRatingMessage] = useState("");
  const [ratingError, setRatingError] = useState("");

  // =========================================
  // CARGA
  // =========================================

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFavoriteStatus = async () => {
    try {
      const response = await api.get(`/stories/${storyId}/favorite`);
      setIsFavorite(response.data.is_favorite);
    } catch (err) {
      console.error("Error al consultar favorito:", err);
      setIsFavorite(false);
    }
  };

  useEffect(() => {
    loadStory();
  }, [storyId]);

  useEffect(() => {
    if (user) {
      loadMyVote();
      loadMyRating();
      api.get(`/stories/${storyId}/favorite`)
        .then((response) => setIsFavorite(response.data.is_favorite))
        .catch((err) => {
          console.error("Error al consultar favorito:", err);
          setIsFavorite(false);
        });
      api.get(`/stories/${storyId}/progress`)
        .then((response) => setReadingProgress(response.data.progress))
        .catch((err) => {
          console.error("Error al consultar el progreso de lectura:", err);
          setReadingProgress(null);
        });
    } else {
      setReadingProgress(null);
      setHasVoted(false);
      setIsFavorite(false);
      setFavoriteError("");
      setPlot(0);
      setSpelling(0);
      setMyRatingLoaded(false);
    }
  }, [storyId, user]);

  // =========================================
  // CARGAR HISTORIA
  // =========================================

  const loadStory = async () => {
    setLoading(true);
    setError("");

    try {
      const [
        storyResponse,
        chaptersResponse,
        votesResponse,
        ratingsResponse,
      ] = await Promise.all([
        api.get(`/stories/${storyId}`),
        api.get(`/stories/${storyId}/chapters`),
        api.get(`/stories/${storyId}/votes/count`),
        api.get(`/stories/${storyId}/ratings/average`),
      ]);

      setStory(storyResponse.data);
      setChapters(chaptersResponse.data);
      setVoteCount(votesResponse.data.votes);
      setRatingAverage(ratingsResponse.data);
    } catch (err) {
      console.error("Error al cargar la historia:", err);
      setError("No se pudo cargar la historia.");
    } finally {
      setLoading(false);
    }
  };

  // =========================================
  // CARGAR VOTO DEL USUARIO
  // =========================================

  const loadMyVote = async () => {
    try {
      const response = await api.get(
        `/stories/${storyId}/votes/me`
      );

      setHasVoted(response.data.voted);
    } catch (err) {
      console.error("Error al consultar mi voto:", err);
      setHasVoted(false);
    }
  };

  // =========================================
  // CARGAR EVALUACIÓN DEL USUARIO
  // =========================================

  const loadMyRating = async () => {
    try {
      const response = await api.get(
        `/stories/${storyId}/ratings`
      );

      const ratings = response.data;

      if (!user) {
        return;
      }

      const myRating = ratings.find(
        (rating) => rating.user_id === user.id
      );

      if (myRating) {
        setPlot(myRating.plot);
        setSpelling(myRating.spelling);
      }
    } catch (err) {
      console.error(
        "Error al consultar mi evaluación:",
        err
      );
    } finally {
      setMyRatingLoaded(true);
    }
  };

  // =========================================
  // VOTAR / QUITAR VOTO
  // =========================================

  const handleVote = async () => {
    if (!user) {
      setVoteError(
        "Debes iniciar sesión para recomendar esta historia."
      );
      return;
    }

    if (voteLoading) {
      return;
    }

    setVoteLoading(true);
    setVoteError("");

    try {
      if (hasVoted) {
        await api.delete(`/votes/${storyId}`);

        setHasVoted(false);
        setVoteCount((current) =>
          Math.max(0, current - 1)
        );
      } else {
        await api.post("/votes", {
          story_id: storyId,
        });

        setHasVoted(true);
        setVoteCount((current) => current + 1);
      }
    } catch (err) {
      console.error("Error al cambiar voto:", err);

      setVoteError(
        err.response?.data?.detail ||
          "No se pudo actualizar tu voto."
      );

      await loadMyVote();

      try {
        const votesResponse = await api.get(
          `/stories/${storyId}/votes/count`
        );

        setVoteCount(votesResponse.data.votes);
      } catch (countError) {
        console.error(
          "Error al actualizar contador de votos:",
          countError
        );
      }
    } finally {
      setVoteLoading(false);
    }
  };

  const handleFavorite = async () => {
    if (!user) {
      setFavoriteError("Debes iniciar sesión para guardar esta historia en favoritos.");
      return;
    }

    if (favoriteLoading) return;

    setFavoriteLoading(true);
    setFavoriteError("");
    const removingFavorite = isFavorite;

    try {
      if (removingFavorite) {
        await api.delete(`/favorites/${storyId}`);
        setIsFavorite(false);
      } else {
        await api.post(`/favorites/${storyId}`);
        setIsFavorite(true);
      }
      showToast(removingFavorite ? "Historia eliminada de tus favoritos." : "Historia guardada en favoritos.");
    } catch (err) {
      console.error("Error al actualizar favorito:", err);
      showToast(err.response?.data?.detail || "No se pudo guardar el cambio. Intenta nuevamente.", "error");
      await loadFavoriteStatus();
    } finally {
      setFavoriteLoading(false);
    }
  };

  // =========================================
  // ENVIAR EVALUACIÓN
  // =========================================

  const submitRating = async () => {
    setRatingMessage("");
    setRatingError("");

    if (!user) {
      setRatingError(
        "Debes iniciar sesión para evaluar esta historia."
      );
      return;
    }

    if (plot === 0 || spelling === 0) {
      setRatingError(
        "Debes seleccionar una valoración para la trama y la ortografía."
      );
      return;
    }

    setSubmittingRating(true);

    try {
      await api.post("/ratings", {
        story_id: storyId,
        plot,
        spelling,
      });

      setRatingMessage(
        "¡Tu evaluación se guardó correctamente!"
      );

      const ratingsResponse = await api.get(
        `/stories/${storyId}/ratings/average`
      );

      setRatingAverage(ratingsResponse.data);
    } catch (err) {
      console.error(
        "Error al guardar evaluación:",
        err
      );

      setRatingError(
        err.response?.data?.detail ||
          "No se pudo guardar tu evaluación."
      );
    } finally {
      setSubmittingRating(false);
    }
  };

  // =========================================
  // ESTRELLAS
  // =========================================

  const renderStars = (value, setValue) => {
    return (
      <div className="rating-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={
              star <= value
                ? "rating-star active"
                : "rating-star"
            }
            onClick={() => setValue(star)}
            aria-label={`${star} de 5 estrellas`}
          >
            ★
          </button>
        ))}
      </div>
    );
  };

  // =========================================
  // HELPERS VISUALES
  // =========================================

  const getStatusLabel = (status) => {
    const statusLabels = {
      published: "Publicada",
      draft: "Borrador",
      paused: "Pausada",
      completed: "Terminada",
    };

    return (
      statusLabels[status] ||
      status ||
      "Sin estado"
    );
  };

  const getStatusIcon = (status) => {
    const statusIcons = {
      published: "●",
      draft: "○",
      paused: "●",
      completed: "✓",
    };

    return statusIcons[status] || "●";
  };

  const getWorkTypeLabel = (workType) => {
    const workTypeLabels = {
      original: "Obra original",
      fanfic: "Fanfic",
      adaptation: "Adaptación",
      translation: "Traducción",
    };

    return (
      workTypeLabels[workType] ||
      workType ||
      "Obra original"
    );
  };

  const getWorkTypeIcon = (workType) => {
    const workTypeIcons = {
      original: "✦",
      fanfic: "♡",
      adaptation: "↗",
      translation: "↔",
    };

    return workTypeIcons[workType] || "✦";
  };

  // =========================================
  // ESTADOS DE CARGA / ERROR
  // =========================================

  if (loading) {
    return (
      <main className="story-detail-page">
        <div className="story-detail-container">
          <p className="loading-text">
            Cargando historia...
          </p>
        </div>
      </main>
    );
  }

  if (error || !story) {
    return (
      <main className="story-detail-page">
        <div className="story-detail-container">
          <Link to="/" className="back-link">
            ← Volver a explorar
          </Link>

          <p className="loading-text">
            {error || "Historia no encontrada."}
          </p>
        </div>
      </main>
    );
  }

  // =========================================
  // MÉTRICAS
  // =========================================

  const generalRating =
    ratingAverage?.average_plot !== null &&
    ratingAverage?.average_plot !== undefined &&
    ratingAverage?.average_spelling !== null &&
    ratingAverage?.average_spelling !== undefined
      ? (
          (ratingAverage.average_plot +
            ratingAverage.average_spelling) /
          2
        ).toFixed(1)
      : null;

  // Capítulos que un lector puede leer. La lista ya llega filtrada por el
  // backend; el autor además recibe sus borradores, que no se cuentan. En
  // una historia en borrador ningún capítulo está disponible para lectores.
  const publishedChapterCount =
    story.status === "draft"
      ? null
      : chapters.filter((chapter) => chapter.status === "published").length;

  // Botón principal de lectura: retoma el capítulo guardado o, si la
  // historia no se ha empezado, abre el primero publicado.
  const continueIndex = chapters.findIndex(
    (chapter) =>
      chapter.id === readingProgress?.chapter_id &&
      chapter.status === "published"
  );
  const readTarget =
    story.status === "draft"
      ? null
      : continueIndex !== -1
      ? chapters[continueIndex]
      : chapters.find((chapter) => chapter.status === "published") || null;

  const statusLabel = getStatusLabel(story.status);
  const statusIcon = getStatusIcon(story.status);

  const workTypeLabel = getWorkTypeLabel(
    story.work_type
  );

  const workTypeIcon = getWorkTypeIcon(
    story.work_type
  );

  return (
    <main className="story-detail-page">
      <div className="story-detail-container">

        {/* =====================================
            VOLVER
            ===================================== */}

        <Link to="/" className="back-link">
          ← Volver a explorar
        </Link>

        {/* =====================================
            CABECERA DE LA HISTORIA
            ===================================== */}

        <section className="story-detail-header">

          {/* PORTADA */}

          <div className="story-detail-cover">
            {story.cover_url ? (
              <img
                src={story.cover_url}
                alt={`Portada de ${story.title}`}
                className="story-detail-cover-image"
              />
            ) : (
              <div className="story-detail-cover-placeholder">
                <img
                  src="/logo-fribuk.jpg"
                  alt="FriBuk"
                  className="story-detail-cover-logo"
                />
              </div>
            )}
          </div>

          {/* INFORMACIÓN */}

          <div className="story-detail-info">

            {/* GÉNERO + ESTADO */}

            <div className="story-detail-meta">

              <span className="story-detail-genre">
                {story.genre
                  ? story.genre.toUpperCase()
                  : "SIN GÉNERO"}
              </span>

              <span className={`story-detail-status status-${story.status || "unknown"}`}>
                <span aria-hidden="true">
                  {statusIcon}
                </span>

                {statusLabel}
              </span>

            </div>

            {/* TÍTULO */}

            <h1>{story.title}</h1>

            {/* AUTOR */}

            <p className="story-detail-author">
              Historia de{" "}
              {story.author_id ? (
                <Link className="story-detail-author-link" to={`/usuario/${story.author_id}`}>
                  <strong>{story.author_username || "Autor desconocido"}</strong>
                </Link>
              ) : (
                <strong>{story.author_username || "Autor desconocido"}</strong>
              )}
              {publishedChapterCount !== null && (
                <>
                  <span className="story-detail-author-separator" aria-hidden="true">
                    {" · "}
                  </span>
                  <span className="story-detail-chapter-total">
                    {publishedChapterCount === 0 ? (
                      "Sin capítulos publicados"
                    ) : (
                      <>
                        <strong>{publishedChapterCount}</strong>{" "}
                        {publishedChapterCount === 1
                          ? "capítulo publicado"
                          : "capítulos publicados"}
                      </>
                    )}
                  </span>
                </>
              )}
            </p>

            {/* ORIGEN DE LA OBRA */}

            <div className="story-detail-work">

              <div className="story-detail-work-badge">
                <span aria-hidden="true">
                  {workTypeIcon}
                </span>

                <span>
                  {workTypeLabel}
                </span>
              </div>

              {story.original_work && (
                <p className="story-detail-original">
                  Basada en{" "}
                  <strong>
                    {story.original_work}
                  </strong>

                  {story.original_author && (
                    <>
                      {" "}
                      · {story.original_author}
                    </>
                  )}
                </p>
              )}

            </div>

            {/* Reportar o retirar la portada */}

            {story.cover_url && !isOwner && (
              <div className="moderation-actions">
                <ReportButton
                  targetType="story_cover"
                  targetId={storyId}
                  label="Reportar portada"
                />
                <RemoveButton
                  targetType="story_cover"
                  targetId={storyId}
                  label="Retirar portada"
                  onRemoved={() => setStory((current) => ({ ...current, cover_url: null }))}
                />
              </div>
            )}

            {/* AVISO DE CONTENIDO */}

            {story.sensitive_content && (
              <p className="story-detail-sensitive">
                <span className="story-detail-sensitive-label">
                  Contenido sensible
                </span>

                {contentWarningLabels(story.content_warnings).join(" · ")}
              </p>
            )}

            {/* DESCRIPCIÓN */}

            <div className="story-detail-description-block">

              <p className="story-detail-description">
                {story.description ||
                  "Esta historia todavía no tiene una descripción."}
              </p>

            </div>

            {/* CONTROLES DEL AUTOR */}

            {isOwner && (
              <div className="story-owner-actions">

                <Link
                  to={`/stories/${storyId}/edit`}
                  className="story-owner-edit"
                >
                  ✏️ Editar historia
                </Link>

                <Link
                  to={`/stories/${storyId}/create-chapter`}
                  className="story-owner-chapter"
                >
                  ＋ Agregar capítulo
                </Link>

              </div>
            )}

            {/* MÉTRICAS */}

            <div className="story-detail-metrics">

              {/* RECOMENDACIONES */}

              <div className="detail-metric">

                <span className="detail-metric-value">
                  ❤️ {voteCount}
                </span>

                <span className="detail-metric-label">
                  Recomiendan
                </span>

              </div>

              {/* VALORACIÓN GENERAL */}

              <div className="detail-metric">

                <span className="detail-metric-value">
                  ⭐ {generalRating ?? "—"}
                </span>

                <span className="detail-metric-label">
                  Valoración general
                </span>

              </div>

              {/* TRAMA */}

              <div className="detail-metric">

                <span className="detail-metric-value">
                  📖{" "}
                  {ratingAverage?.average_plot !==
                    null &&
                  ratingAverage?.average_plot !==
                    undefined
                    ? ratingAverage.average_plot
                    : "—"}
                </span>

                <span className="detail-metric-label">
                  Trama
                </span>

              </div>

              {/* ORTOGRAFÍA */}

              <div className="detail-metric">

                <span className="detail-metric-value">
                  ✍️{" "}
                  {ratingAverage?.average_spelling !==
                    null &&
                  ratingAverage?.average_spelling !==
                    undefined
                    ? ratingAverage.average_spelling
                    : "—"}
                </span>

                <span className="detail-metric-label">
                  Ortografía
                </span>

              </div>

            </div>

            {/* RECOMENDAR */}

            <div className="vote-action">

              {readTarget && (
                <Link
                  to={`/stories/${storyId}/chapters/${readTarget.id}`}
                  className="read-button"
                >
                  <span aria-hidden="true">📖</span>
                  {continueIndex !== -1
                    ? `Continuar capítulo ${continueIndex + 1}`
                    : "Empezar a leer"}
                </Link>
              )}

              <button
                type="button"
                className={
                  hasVoted
                    ? "vote-button voted"
                    : "vote-button"
                }
                onClick={handleVote}
                disabled={voteLoading}
              >
                <span className="vote-button-heart">
                  {hasVoted ? "❤️" : "♡"}
                </span>

                <span>
                  {voteLoading
                    ? "Actualizando..."
                    : hasVoted
                    ? "Recomendada"
                    : "Recomendar"}
                </span>
              </button>

              <button
                type="button"
                className={isFavorite ? "favorite-button active" : "favorite-button"}
                onClick={handleFavorite}
                disabled={favoriteLoading}
                aria-pressed={isFavorite}
              >
                <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
                {favoriteLoading
                  ? "Actualizando..."
                  : isFavorite
                  ? "En favoritos"
                  : "Agregar a favoritos"}
              </button>

              {["published", "completed", "paused"].includes(story.status) && (
                <AddToListMenu storyId={storyId} />
              )}

              {voteError && (
                <p className="vote-error">
                  {voteError}
                </p>
              )}

              {favoriteError && (
                <p className="favorite-error" role="alert">
                  {favoriteError} {!user && <Link to="/login">Iniciar sesión</Link>}
                </p>
              )}

            </div>

          </div>
        </section>

        {/* =====================================
            EVALUACIÓN
            ===================================== */}

        <section className="rating-section">

          <div className="rating-heading">

            <p className="chapters-eyebrow">
              TU OPINIÓN
            </p>

            <h2>
              Evalúa esta historia
            </h2>

            <p>
              Tu evaluación ayuda a otros lectores
              a conocer mejor la historia.
            </p>

          </div>

          {!user ? (

            <div className="rating-login-message">

              <p>
                Inicia sesión para poder evaluar
                esta historia.
              </p>

              <Link
                to="/login"
                className="rating-login-button"
              >
                Iniciar sesión
              </Link>

            </div>

          ) : (

            <div className="rating-form">

              {!myRatingLoaded ? (

                <p className="rating-loading">
                  Cargando tu evaluación...
                </p>

              ) : (

                <>

                  {/* TRAMA */}

                  <div className="rating-category">

                    <div>
                      <h3>
                        ¿Qué te pareció la trama?
                      </h3>

                      <p>
                        Valora la historia y su
                        desarrollo.
                      </p>
                    </div>

                    {renderStars(
                      plot,
                      setPlot
                    )}

                  </div>

                  {/* ORTOGRAFÍA */}

                  <div className="rating-category">

                    <div>
                      <h3>
                        ¿Qué tal la ortografía?
                      </h3>

                      <p>
                        Valora la claridad y
                        corrección del texto.
                      </p>
                    </div>

                    {renderStars(
                      spelling,
                      setSpelling
                    )}

                  </div>

                  {ratingError && (
                    <p className="rating-error">
                      {ratingError}
                    </p>
                  )}

                  {ratingMessage && (
                    <p className="rating-success">
                      {ratingMessage}
                    </p>
                  )}

                  <button
                    type="button"
                    className="rating-submit-button"
                    onClick={submitRating}
                    disabled={submittingRating}
                  >
                    {submittingRating
                      ? "Guardando..."
                      : "Enviar evaluación"}
                  </button>

                </>

              )}

            </div>

          )}

        </section>

        {/* =====================================
            CAPÍTULOS
            ===================================== */}

        <section className="chapters-section">

          <div className="chapters-heading">

            <div>

              <p className="chapters-eyebrow">
                LECTURA
              </p>

              <h2>
                Capítulos
              </h2>

              <p>
                Lee la historia desde el comienzo
                o continúa donde la dejaste.
              </p>

            </div>

            <span className="chapter-count">
              {chapters.length}{" "}
              {chapters.length === 1
                ? "capítulo"
                : "capítulos"}
            </span>

          </div>

          {chapters.length === 0 ? (

            <div className="chapters-empty">

              <div className="empty-icon">
                ✦
              </div>

              <h3>
                Esta historia todavía no tiene
                capítulos
              </h3>

              <p>
                El autor aún no ha publicado
                capítulos para esta historia.
              </p>

            </div>

          ) : (

            <div className="chapters-list">

              {chapters.map((chapter, index) => (

                <article
                  className="chapter-card"
                  key={chapter.id}
                >

                  <div className="chapter-number">
                    {String(index + 1).padStart(
                      2,
                      "0"
                    )}
                  </div>

                  <div className="chapter-info">

                    <p>
                      CAPÍTULO {index + 1}
                      {isOwner && chapter.status === "draft" && " · BORRADOR"}
                      {index === continueIndex && (
                        <span className="chapter-current"> · VAS AQUÍ</span>
                      )}
                    </p>

                    <h3>
                      {chapter.title}
                    </h3>

                  </div>

                  <div className="chapter-actions">

                    <Link
                      to={`/stories/${storyId}/chapters/${chapter.id}`}
                      className="chapter-link"
                    >
                      Leer
                      <span>→</span>
                    </Link>

                    {isOwner && (
                      <Link
                        to={`/stories/${storyId}/chapters/${chapter.id}/edit`}
                        className="chapter-edit-link"
                      >
                        ✏️ Editar
                      </Link>
                    )}

                  </div>

                </article>

              ))}

            </div>

          )}

        </section>

      </div>
    </main>
  );
}


