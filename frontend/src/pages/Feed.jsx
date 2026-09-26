import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

export default function Feed() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortBy, setSortBy] = useState("recommended");

  // Búsqueda
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  // Género seleccionado
  const [selectedGenre, setSelectedGenre] = useState("Todas");
  const [showMoreGenres, setShowMoreGenres] = useState(false);

  const genres = [
    "Todas",
    "Romance",
    "Fantasía",
    "Ciencia ficción",
    "Misterio",
    "Policial",
    "Suspenso",
    "Terror",
    "Acción",
    "Aventura",
    "Drama",
    "Distopía",
    "Histórico",
    "Comedia",
    "Realista",
    "Ficción contemporánea",
    "Infantil",
    "Juvenil",
    "Poesía",
  ];

  const loadStories = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const response = await api.get("/stories");
      setStories(response.data);
    } catch (error) {
      console.error("Error al cargar historias:", error);
      setStories([]);
      setLoadError(
        "Revisa tu conexión e inténtalo nuevamente."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // Filtrar historias
  const filteredStories = stories.filter((story) => {
    const searchText = search.toLowerCase().trim();

    const matchesSearch =
      story.title?.toLowerCase().includes(searchText) ||
      story.description?.toLowerCase().includes(searchText) ||
      story.author_username?.toLowerCase().includes(searchText);

    const matchesGenre =
      selectedGenre === "Todas" ||
      story.genre?.toLowerCase() === selectedGenre.toLowerCase();

    return matchesSearch && matchesGenre;
  });

  const sortedStories = [...filteredStories].sort((first, second) => {
    if (sortBy === "recent") {
      const firstDate = Date.parse(first.created_at || "") || 0;
      const secondDate = Date.parse(second.created_at || "") || 0;
      return secondDate - firstDate;
    }

    if (sortBy === "rated") {
      const firstRating = first.general_rating ?? -1;
      const secondRating = second.general_rating ?? -1;
      return secondRating - firstRating;
    }

    if (sortBy === "read") {
      const firstReads = Number(
        first.read_count ?? first.view_count ?? first.views ?? 0
      );
      const secondReads = Number(
        second.read_count ?? second.view_count ?? second.views ?? 0
      );
      return secondReads - firstReads;
    }

    return (
      (second.recommendation_count || 0) -
      (first.recommendation_count || 0)
    );
  });

  if (loading) {
    return (
      <main className="feed-page">
        <div className="feed-container">
          <p className="loading-text">Cargando historias...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="feed-page">
      <div className="feed-container">

        {/* Encabezado */}
        <section className="feed-header">
          <div>
            <p className="feed-eyebrow">DESCUBRE NUEVAS HISTORIAS</p>

            <h1>
              Encuentra tu próxima
              <span> historia favorita.</span>
            </h1>

            <p className="feed-intro">
              Explora historias creadas por personas que tienen algo que contar.
              ¡Quizás la próxima gran historia sea la tuya!
            </p>
          </div>
        </section>

        {/* Buscador */}
        <section className="search-section">
          <div className="search-box">
            <button
              type="button"
              className="search-icon"
              aria-label="Enfocar búsqueda"
              title="Buscar historias"
              onClick={() => searchInputRef.current?.focus()}
            >
              ⌕
            </button>

            <input
              id="story-search"
              name="story-search"
              type="text"
              ref={searchInputRef}
              placeholder="Buscar historias, autores..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>

        {/* Filtros */}
        <section className="filters-section">
          <div className="filter-group">

            {genres.slice(0, 9).map((genre) => (
              <button
                key={genre}
                className={`filter-button ${
                  selectedGenre === genre ? "active" : ""
                }`}
                onClick={() => setSelectedGenre(genre)}
              >
                {genre}
              </button>
            ))}

            <button
              className={`filter-button more-genres-button ${
                showMoreGenres ? "active" : ""
              }`}
              onClick={() => setShowMoreGenres((current) => !current)}
            >
              {showMoreGenres ? "Menos ↑" : "Más ↓"}
            </button>

            {showMoreGenres &&
              genres.slice(7).map((genre) => (
                <button
                  key={genre}
                  className={`filter-button ${
                    selectedGenre === genre ? "active" : ""
                  }`}
                  onClick={() => setSelectedGenre(genre)}
                >
                  {genre}
                </button>
              ))}
          </div>

          <select
            className="sort-select"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Ordenar historias"
          >
            <option value="recommended">Más recomendadas</option>
            <option value="recent">Más recientes</option>
            <option value="rated">Mejor valoradas</option>
            <option value="read">Más leídas</option>
          </select>
        </section>

        {/* Historias */}
        <section className="stories-section">
          <div className="section-heading">
            <div>
              <h2>Historias para ti</h2>

              <p>
                Descubre nuevas historias y conoce a sus autores.
              </p>
            </div>

            <span className="story-count">
              {filteredStories.length}{" "}
              {filteredStories.length === 1
                ? "historia"
                : "historias"}
            </span>
          </div>

          {loadError ? (
            <div
              className="inline-feedback inline-feedback--error feed-feedback"
              role="alert"
            >
              <span
                className="inline-feedback-icon"
                aria-hidden="true"
              >
                !
              </span>

              <div className="inline-feedback-content">
                <strong>No pudimos cargar las historias</strong>
                <p>{loadError}</p>
              </div>

              <button
                type="button"
                className="inline-feedback-action"
                onClick={loadStories}
              >
                Reintentar
              </button>
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✦</div>

              <h3>No encontramos historias</h3>

              <p>
                Prueba con otro término de búsqueda o selecciona
                otro género.
              </p>
            </div>
          ) : (
            <div className="stories-list">
              {sortedStories.map((story) => (
                <article
                  className="story-card"
                  key={story.id}
                >

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
                          <Link
                            to={`/stories/${story.id}`}
                          >
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
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer-content">

          <div className="home-footer-brand">
            <strong>FriBuk</strong>
            <span>
              Lee, escribe y descubre nuevas historias.
            </span>
          </div>

          <div className="home-footer-column">
            <h3>Información</h3>

            <Link
              to="/terminos"
              className="home-footer-link"
            >
              Términos y Condiciones
            </Link>

            <Link
              to="/privacidad"
              className="home-footer-link"
            >
              Privacidad
            </Link>

            <Link
              to="/contenido"
              className="home-footer-link"
            >
              Política de Contenido
            </Link>
          </div>

          <div className="home-footer-column">
            <h3>Comunidad</h3>

            <Link
              to="/comunidad"
              className="home-footer-link"
            >
              Normas de Comunidad
            </Link>

            <Link
              to="/moderacion"
              className="home-footer-link"
            >
              Política de Moderación
            </Link>

            <Link
              to="/derechos-autor"
              className="home-footer-link"
            >
              Derechos de Autor
            </Link>
          </div>

          <div className="home-footer-column">
            <h3>Ayuda</h3>

            <Link
              to="/support"
              className="home-footer-link"
            >
              Centro de ayuda
            </Link>
          </div>

        </div>

        <div className="home-footer-bottom">
          <span>
            © {new Date().getFullYear()} FriBuk. Todos los derechos reservados.
          </span>
        </div>
      </footer>
    </main>
  );
}
