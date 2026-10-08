import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import StoryCard from "../components/StoryCard";
import UserSearchResult from "../components/UserSearchResult";
import { useUserSearch } from "../hooks/useUserSearch";
import SiteFooter from "../components/SiteFooter";
import {
  fandomList,
  popularTags,
  storyHasFandom,
  storyHasTag,
  storyMatchesSearch,
} from "../utils/storySearch";

const FEED_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Merriweather:wght@700;900&display=swap";

// Título del inicio, separado en partes para animar su escritura.
const TITLE_PARTS = [
  { text: "Encuentra tu próxima", accent: false },
  { text: " historia favorita", accent: true },
];
const TITLE_TEXT = TITLE_PARTS.map((part) => part.text).join("");

// Cantidad de elementos en las secciones destacadas del inicio.
const HIGHLIGHT_LIMIT = 4;

export default function Feed() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = Boolean(user?.is_admin);
  const [homeBannerUrl, setHomeBannerUrl] = useState("");
  const [homeBannerAction, setHomeBannerAction] = useState(null);
  // Historias que el lector tiene a medias.
  const [continueReading, setContinueReading] = useState([]);
  const userId = user?.id;
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortBy, setSortBy] = useState("recommended");
  const [forumTopics, setForumTopics] = useState([]);

  // Búsqueda
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  // Usuarios que coinciden con el texto buscado. Es independiente del
  // filtrado de historias: si falla, las historias se muestran igual.
  const userSearch = useUserSearch(search, { limit: 5 });

  // Etiqueta (tropo o tema) y fandom elegidos. Viven en la dirección para
  // que se pueda llegar a un filtro desde una tarjeta o desde una historia,
  // y para poder compartir el enlace.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTag = searchParams.get("etiqueta") || "";
  const selectedFandom = searchParams.get("fandom") || "";

  const setFilter = (name, value) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) {
        next.set(name, value);
      } else {
        next.delete(name);
      }
      return next;
    });
  };

  // Género seleccionado
  const [selectedGenre, setSelectedGenre] = useState("Todas");
  const [showMoreGenres, setShowMoreGenres] = useState(false);

  const genres = [
    "Todas",
    "Romance",
    "Fantasía",
    "Romantasy",
    "Enemies to lovers",
    "Slow burn",
    "Found family",
    "Rivals",
    "Fake dating",
    "Dark romance",
    "Ciencia ficción",
    "Misterio",
    "Thriller",
    "Policial",
    "Terror",
    "Suspenso",
    "Acción",
    "Aventura",
    "Drama",
    "Comedia",
    "Distopía",
    "Ficción contemporánea",
    "Histórico",
    "Juvenil",
    "Realista",
    "Paranormal",
    "Sobrenatural",
    "Fantasía urbana",
    "Fantasía oscura",
    "Postapocalíptica",
    "LGBTIQ+",
    "Omegaverse",
    "Fanfiction",
    "Poesía",
    "Fábula",
    "Slice of Life",
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

  // Temas recientes del foro para la sección del inicio. Si falla,
  // el resto del inicio se muestra igual.
  useEffect(() => {
    api
      .get("/forum/topics")
      .then((response) =>
        setForumTopics(response.data.slice(0, HIGHLIGHT_LIMIT))
      )
      .catch((error) => {
        console.error("Error al cargar temas del foro:", error);
      });
  }, []);

  // Banner del inicio (Halloween, Navidad...). Si falla, el inicio se
  // muestra sin él.
  useEffect(() => {
    api
      .get("/site/home-banner")
      .then((response) => setHomeBannerUrl(response.data.banner_url || ""))
      .catch((error) => {
        console.error("Error al cargar el banner del inicio:", error);
      });
  }, []);

  // "Seguir leyendo": solo con sesión. Si falla, el inicio se muestra sin
  // esta sección.
  useEffect(() => {
    if (!userId) return undefined;

    let isActive = true;

    api
      .get("/me/reading-progress")
      .then((response) => {
        if (isActive) setContinueReading(response.data.items || []);
      })
      .catch((error) => {
        console.error("Error al cargar las lecturas en curso:", error);
      });

    return () => {
      isActive = false;
    };
  }, [userId]);

  const handleHomeBannerUpload = async (event) => {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    if (!file) return;

    setHomeBannerAction("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/site/home-banner", formData);
      setHomeBannerUrl(response.data.banner_url || "");
      showToast("El banner del inicio se actualizó.");
    } catch (error) {
      console.error("Error al subir el banner del inicio:", error);
      showToast(
        error.response?.data?.detail || "No se pudo actualizar el banner del inicio.",
        "error"
      );
    } finally {
      setHomeBannerAction(null);
      input.value = "";
    }
  };

  const handleHomeBannerRemove = async () => {
    if (!window.confirm("¿Quitar el banner del inicio? Dejará de verse para todos.")) {
      return;
    }

    setHomeBannerAction("remove");

    try {
      await api.delete("/site/home-banner");
      setHomeBannerUrl("");
      showToast("Quitaste el banner del inicio.");
    } catch (error) {
      console.error("Error al quitar el banner del inicio:", error);
      showToast(
        error.response?.data?.detail || "No se pudo quitar el banner del inicio.",
        "error"
      );
    } finally {
      setHomeBannerAction(null);
    }
  };

  // Filtrar historias
  const filteredStories = stories.filter((story) => {
    const matchesGenre =
      selectedGenre === "Todas" ||
      story.genre?.toLowerCase() === selectedGenre.toLowerCase();

    // El texto también se busca en las etiquetas y en el fandom.
    return (
      storyMatchesSearch(story, search) &&
      matchesGenre &&
      storyHasTag(story, selectedTag) &&
      storyHasFandom(story, selectedFandom)
    );
  });

  // Tropos más usados y fandoms disponibles, calculados sobre todas las
  // historias publicadas.
  const tropes = popularTags(stories);
  const fandoms = fandomList(stories);

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

  // Secciones destacadas: usan todas las historias, sin los filtros.
  const mostRecommended = stories
    .filter((story) => story.recommendation_count > 0)
    .sort(
      (first, second) =>
        second.recommendation_count - first.recommendation_count
    )
    .slice(0, HIGHLIGHT_LIMIT);

  const bestRated = stories
    .filter((story) => story.general_rating != null)
    .sort((first, second) => second.general_rating - first.general_rating)
    .slice(0, HIGHLIGHT_LIMIT);

  // Tipografías del inicio (Merriweather e Inter). Se cargan solo mientras
  // el Feed está en pantalla para no cambiar la letra de otras páginas.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FEED_FONTS_URL;
    document.head.appendChild(link);

    return () => link.remove();
  }, []);

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

            {/* El texto completo va en aria-label: las letras sueltas
                solo existen para la animación de escritura. */}
            <h1 className="feed-title" aria-label={TITLE_TEXT}>
              {TITLE_PARTS.map((part, partIndex) => (
                <span
                  key={part.text}
                  className={part.accent ? "feed-title-accent" : undefined}
                  aria-hidden="true"
                >
                  {[...part.text].map((char, charIndex) => (
                    <span
                      key={charIndex}
                      className="feed-title-char"
                      style={{
                        "--char-index":
                          TITLE_PARTS.slice(0, partIndex).reduce(
                            (total, previous) =>
                              total + previous.text.length,
                            0
                          ) + charIndex,
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              ))}
            </h1>

            <p className="feed-intro">
              Explora historias creadas por personas que tienen algo que contar.
              ¡Quizás la próxima gran historia sea la tuya!
            </p>
          </div>
        </section>

        {/* Banner del inicio: lo ve todo el mundo; solo el admin lo cambia */}
        {(homeBannerUrl || isAdmin) && (
          <section className={`feed-banner${homeBannerUrl ? " has-image" : ""}`}>
            {homeBannerUrl && <img src={homeBannerUrl} alt="" />}

            {isAdmin && (
              <div className="feed-banner-actions">
                <label
                  className={`profile-banner-action${homeBannerAction ? " is-loading" : ""}`}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleHomeBannerUpload}
                    disabled={Boolean(homeBannerAction)}
                    aria-label="Subir banner del inicio"
                  />
                  <span aria-hidden="true">✎</span>
                  {homeBannerAction === "upload"
                    ? "Subiendo..."
                    : homeBannerUrl
                    ? "Cambiar banner"
                    : "Añadir banner del inicio"}
                </label>
                {homeBannerUrl && (
                  <button
                    type="button"
                    className="profile-banner-action"
                    onClick={handleHomeBannerRemove}
                    disabled={Boolean(homeBannerAction)}
                  >
                    {homeBannerAction === "remove" ? "Quitando..." : "Quitar"}
                  </button>
                )}
              </div>
            )}

            {isAdmin && !homeBannerUrl && (
              <p className="feed-banner-hint">
                Solo tú ves este recuadro. JPG o PNG de hasta 5 MB; se ve mejor
                una imagen horizontal de 1600 × 400 px.
              </p>
            )}
          </section>
        )}

        {/* Seguir leyendo */}
        {userId && continueReading.length > 0 && (
          <section className="continue-reading" aria-label="Seguir leyendo">
            <h2>Seguir leyendo</h2>

            <div className="continue-reading-list">
              {continueReading.map((item) => (
                <Link
                  key={item.story_id}
                  to={`/stories/${item.story_id}/chapters/${item.chapter_id}`}
                  className="continue-reading-card"
                >
                  <img src={item.cover_url || "/logo-fribuk.jpg"} alt="" />

                  <span className="continue-reading-info">
                    <strong>{item.story_title}</strong>
                    <span>
                      Capítulo {item.chapter_position} de {item.chapter_total}
                    </span>
                    <span className="continue-reading-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.round(
                            (item.chapter_position / item.chapter_total) * 100
                          )}%`,
                        }}
                      />
                    </span>
                    <span className="continue-reading-cta">Continuar →</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

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
              placeholder="Buscar historias, autores, tropos, fandoms..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>

        {/* Tropos y temas más usados */}
        {tropes.length > 0 && (
          <section className="feed-tropes" aria-label="Tropos y temas populares">
            <span className="feed-tropes-label">Tropos populares:</span>

            <div className="feed-tropes-list">
              {tropes.map((trope) => {
                const isSelected =
                  selectedTag.toLowerCase() === trope.name.toLowerCase();

                return (
                  <button
                    key={trope.name}
                    type="button"
                    className={`story-chip${isSelected ? " is-selected" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => setFilter("etiqueta", isSelected ? "" : trope.name)}
                  >
                    {trope.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Filtros activos de etiqueta y fandom */}
        {(selectedTag || selectedFandom) && (
          <section className="feed-active-filters" aria-label="Filtros activos">
            {selectedTag && (
              <button
                type="button"
                className="story-chip is-selected"
                onClick={() => setFilter("etiqueta", "")}
                aria-label={`Quitar el filtro de la etiqueta ${selectedTag}`}
              >
                Etiqueta: {selectedTag} ×
              </button>
            )}
            {selectedFandom && (
              <button
                type="button"
                className="story-chip is-selected"
                onClick={() => setFilter("fandom", "")}
                aria-label={`Quitar el filtro del fandom ${selectedFandom}`}
              >
                Fandom: {selectedFandom} ×
              </button>
            )}
          </section>
        )}

        {/* Usuarios que coinciden con la búsqueda */}
        {userSearch.users.length > 0 && (
          <section className="user-strip" aria-label="Usuarios encontrados">
            <div className="user-strip-heading">
              <h2>Usuarios</h2>
              <Link
                className="user-strip-more"
                to={`/autores?q=${encodeURIComponent(userSearch.term)}`}
              >
                Ver todos en Buscar autores →
              </Link>
            </div>
            <div
              className={`user-strip-list${
                userSearch.status === "loading" ? " is-loading" : ""
              }`}
            >
              {userSearch.users.map((user) => (
                <UserSearchResult key={user.id} user={user} variant="chip" />
              ))}
            </div>
          </section>
        )}

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

          {fandoms.length > 0 && (
            <select
              className="sort-select"
              value={
                fandoms.find(
                  (fandom) =>
                    fandom.name.toLowerCase() === selectedFandom.toLowerCase()
                )?.name || ""
              }
              onChange={(event) => setFilter("fandom", event.target.value)}
              aria-label="Filtrar por fandom"
            >
              <option value="">Todos los fandoms</option>
              {fandoms.map((fandom) => (
                <option key={fandom.name} value={fandom.name}>
                  {fandom.name} ({fandom.count})
                </option>
              ))}
            </select>
          )}

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
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          )}
        </section>

        {/* Más recomendados */}
        {mostRecommended.length > 0 && (
          <section className="stories-section feed-highlight">
            <div className="section-heading">
              <div>
                <h2>Más recomendados</h2>

                <p>
                  Las historias que más lectores recomiendan.
                </p>
              </div>
            </div>

            <div className="stories-list">
              {mostRecommended.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </section>
        )}

        {/* Mejor valoración */}
        {bestRated.length > 0 && (
          <section className="stories-section feed-highlight">
            <div className="section-heading">
              <div>
                <h2>Mejor valoración</h2>

                <p>
                  Las historias mejor puntuadas por la comunidad.
                </p>
              </div>
            </div>

            <div className="stories-list">
              {bestRated.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          </section>
        )}

        {/* Foro */}
        <section className="feed-highlight">
          <div className="section-heading">
            <div>
              <h2>Foro</h2>

              <p>
                Conversa con otros lectores y escritores.
              </p>
            </div>

            <Link to="/forum" className="user-strip-more">
              Ir al foro →
            </Link>
          </div>

          <div className="forum-topics">
            {forumTopics.length > 0 ? (
              forumTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/forum/${topic.id}`}
                  className="forum-topic-card"
                >
                  <div className="forum-topic-icon">
                    💬
                  </div>

                  <div className="forum-topic-info">
                    <h2>{topic.title}</h2>

                    <span className="forum-topic-user">
                      @{topic.username || "Usuario"}
                    </span>
                  </div>

                  <span className="forum-topic-arrow">
                    →
                  </span>
                </Link>
              ))
            ) : (
              <div className="forum-empty">
                <h2>Únete a la conversación</h2>

                <p>
                  Entra al foro para ver y crear temas de la comunidad.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>

      <SiteFooter />
    </main>
  );
}
