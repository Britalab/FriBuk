import { Link } from "react-router-dom";

export default function StoryCard({ story }) {
  return (
    <article className="story-card">

      {/* Portada */}
      <div className="story-cover">
        {story.cover_url ? (
          <img
            src={story.cover_url}
            alt={`Portada de ${story.title}`}
            className="story-cover-image"
          />
        ) : (
          <div className="story-cover-placeholder">
            <img
              src="/logo-fribuk.jpg"
              alt="FriBuk"
              className="story-cover-logo"
            />
          </div>
        )}
      </div>

      {/* Información */}
      <div className="story-content">

        <div className="story-top">
          <div>
            <p className="story-genre">
              {story.genre || "Sin género"}
            </p>

            <h3 className="story-title">
              <Link to={`/stories/${story.id}`}>
                {story.title}
              </Link>
            </h3>
          </div>

          <span className="story-status">
            {story.status === "completed"
              ? "Terminada"
              : story.status === "paused"
                ? "Pausada"
                : story.status === "draft"
                  ? "Borrador"
                  : "En curso"}
          </span>
        </div>

        <p className="story-description">
          {story.description ||
            "Esta historia todavía no tiene una descripción."}
        </p>

        <p className="story-author">
          Por{" "}
          {story.author_id ? (
            <Link className="story-author-link" to={`/usuario/${story.author_id}`}>
              <strong>{story.author_username || "Autor de FriBuk"}</strong>
            </Link>
          ) : (
            <strong>{story.author_username || "Autor de FriBuk"}</strong>
          )}
        </p>

        {/* Métricas */}
        <div className="story-metrics">

          <div className="metric">
            <span className="metric-value">
              ❤️{" "}
              {story.recommendation_count > 0
                ? story.recommendation_count
                : "—"}
            </span>

            <span className="metric-label">
              Recomiendan
            </span>
          </div>

          <div className="metric">
            <span className="metric-value">
              ⭐{" "}
              {story.general_rating !== null
                ? story.general_rating
                    .toFixed(1)
                    .replace(".", ",")
                : "—"}
            </span>

            <span className="metric-label">
              Valoración
            </span>
          </div>

        </div>

        {/* Acción */}
        <div className="story-action">
          <Link
            to={`/stories/${story.id}`}
            className="read-button"
          >
            Leer historia
            <span>→</span>
          </Link>
        </div>

      </div>
    </article>
  );
}
