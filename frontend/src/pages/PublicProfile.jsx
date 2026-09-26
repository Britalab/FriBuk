import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";

function StoryCover({ story }) {
  return (
    <div className="public-profile-story-cover">
      <img
        src={story.cover_url || "/logo-fribuk.jpg"}
        alt={story.cover_url ? `Portada de ${story.title}` : "FriBuk"}
      />
    </div>
  );
}

function StoryCard({ story, favorite = false }) {
  const rating = story.general_rating;

  return (
    <article className="public-profile-story-card">
      <StoryCover story={story} />
      <div className="public-profile-story-info">
        <p className="public-profile-story-genre">{story.genre || "Sin género"}</p>
        <h3>{story.title}</h3>
        {story.description && <p className="public-profile-story-description">{story.description}</p>}
        <div className="public-profile-story-meta">
          <span>{story.chapter_count || 0} capítulos</span>
          {story.author_username && <span>Por {story.author_username}</span>}
          {story.recommendation_count !== undefined && (
            <span>❤️ {story.recommendation_count}</span>
          )}
          {rating !== undefined && (
            <span>⭐ {rating === null ? "—" : Number(rating).toFixed(1)}</span>
          )}
        </div>
        <div className="public-profile-story-actions">
          <Link to={`/stories/${story.id}`} className="public-profile-story-link">
            {favorite ? "Leer historia" : "Ver historia"}
          </Link>
        </div>
      </div>
    </article>
  );
}

function emptyPageData(userId) {
  return {
    userId,
    loading: true,
    error: "",
    profile: null,
    stories: [],
    favorites: [],
    followers: [],
    following: [],
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
  };
}

export default function PublicProfile() {
  const { userId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [pageData, setPageData] = useState(() => emptyPageData(null));
  const [followLoading, setFollowLoading] = useState(false);
  const [connections, setConnections] = useState({ type: null, loading: false, error: "", users: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const followRequestInFlight = useRef(false);

  useEffect(() => {
    if (authLoading) return undefined;

    let isActive = true;
    Promise.all([
      api.get(`/users/${userId}/public-profile`),
      api.get(`/users/${userId}/stories`),
      api.get(`/users/${userId}/favorites`),
      api.get(`/users/${userId}/followers`),
      api.get(`/users/${userId}/following`),
    ])
      .then(([profileResponse, storiesResponse, favoritesResponse, followersResponse, followingResponse]) => {
        if (!isActive) return;

        const followers = followersResponse.data.followers || [];
        setPageData({
          userId,
          loading: false,
          error: "",
          profile: profileResponse.data.user,
          stories: storiesResponse.data.stories || [],
          favorites: favoritesResponse.data.favorites || [],
          followers,
          following: followingResponse.data.following || [],
          followersCount: followers.length,
          followingCount: (followingResponse.data.following || []).length,
          isFollowing: Boolean(
            user?.id && followers.some(
              (follower) => String(follower.follower_id) === String(user.id)
            )
          ),
        });
      })
      .catch((error) => {
        console.error("Error al cargar el perfil público:", error);
        if (isActive) {
          setPageData({
            ...emptyPageData(userId),
            loading: false,
            error: error.response?.data?.detail || "No se pudo cargar este perfil.",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [userId, user?.id, authLoading, reloadKey]);

  const isOwnProfile = Boolean(user?.id && String(user.id) === String(userId));
  const isLoading = authLoading || pageData.userId !== userId || pageData.loading;

  useEffect(() => {
    if (!connections.type) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setConnections((current) => ({ ...current, type: null }));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connections.type]);

  const openConnections = async (type) => {
    const ids = type === "followers"
      ? pageData.followers.map((item) => item.follower_id)
      : pageData.following.map((item) => item.following_id);
    const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];

    setConnections({ type, loading: true, error: "", users: [] });
    try {
      const results = await Promise.allSettled(
        uniqueIds.map((id) => api.get(`/users/${id}/public-profile`))
      );
      const profiles = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value.data.user)
        .filter(Boolean);

      setConnections({
        type,
        loading: false,
        error: profiles.length === 0 && uniqueIds.length > 0
          ? "No se pudieron cargar los perfiles de esta lista."
          : "",
        users: profiles,
      });
    } catch (error) {
      console.error("Error al cargar la lista de usuarios:", error);
      setConnections({ type, loading: false, error: "No se pudo cargar esta lista. Inténtalo nuevamente.", users: [] });
    }
  };

  const handleFollowToggle = async () => {
    if (!user || isOwnProfile || followRequestInFlight.current) return;

    followRequestInFlight.current = true;
    setFollowLoading(true);

    try {
      const wasFollowing = pageData.isFollowing;
      if (pageData.isFollowing) {
        await api.delete(`/follow/${userId}`);
      } else {
        await api.post("/follow", { following_id: userId });
      }

      setPageData((current) => {
        if (current.userId !== userId) return current;
        const nextIsFollowing = !current.isFollowing;
        return {
          ...current,
          isFollowing: nextIsFollowing,
          followers: nextIsFollowing
            ? [...current.followers, { follower_id: user.id }]
            : current.followers.filter((follower) => String(follower.follower_id) !== String(user.id)),
          followersCount: Math.max(
            0,
            current.followersCount + (nextIsFollowing ? 1 : -1)
          ),
        };
      });
      showToast(
        wasFollowing
          ? `Dejaste de seguir a @${pageData.profile.username || "usuario"}.`
          : `Ahora sigues a @${pageData.profile.username || "usuario"}.`
      );
    } catch (error) {
      console.error("Error al actualizar seguimiento:", error);
      showToast(error.response?.data?.detail || "No se pudo guardar el cambio. Intenta nuevamente.", "error");
    } finally {
      followRequestInFlight.current = false;
      setFollowLoading(false);
    }
  };

  if (isLoading) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-container">
          <p className="public-profile-state">Cargando perfil...</p>
        </div>
      </main>
    );
  }

  if (pageData.error || !pageData.profile) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-container">
          <div className="public-profile-state public-profile-state-error" role="alert">
            <p>{pageData.error || "No encontramos este perfil."}</p>
            <button className="public-profile-retry" type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Reintentar
            </button>
            <Link to="/">Volver a explorar</Link>
          </div>
        </div>
      </main>
    );
  }

  const username = pageData.profile.username || "Usuario de FriBuk";

  return (
    <main className="public-profile-page">
      <div className="public-profile-container">
        <header className="public-profile-header">
          <div className="public-profile-avatar">
              {pageData.profile.avatar_url ? (
                <img src={pageData.profile.avatar_url} alt={`Avatar de ${username}`} />
              ) : (
                username.charAt(0).toUpperCase()
              )}
          </div>
          <div className="public-profile-identity">
            <p className="public-profile-eyebrow">PERFIL DE AUTOR · FRIBUK</p>
            <h1>@{username}</h1>

            <div className="public-profile-stats" aria-label="Estadísticas del autor">
              <button type="button" onClick={() => openConnections("followers")} aria-label={`${pageData.followersCount} seguidores`}>
                <strong>{pageData.followersCount}</strong>
                <span>Seguidores</span>
              </button>
              <button type="button" onClick={() => openConnections("following")} aria-label={`${pageData.followingCount} personas seguidas`}>
                <strong>{pageData.followingCount}</strong>
                <span>Siguiendo</span>
              </button>
            </div>

            <div className="public-profile-follow-area">
              {isOwnProfile ? (
                <p className="public-profile-own-note">Este es tu perfil público.</p>
              ) : user ? (
                <button
                  type="button"
                  className={`public-profile-follow-button${pageData.isFollowing ? " is-following" : ""}`}
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  aria-pressed={pageData.isFollowing}
                >
                  {followLoading
                    ? "Actualizando..."
                    : pageData.isFollowing
                    ? "Siguiendo"
                    : "Seguir"}
                </button>
              ) : (
                <Link to="/login" className="public-profile-follow-button">
                  Inicia sesión para seguir
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="public-profile-section">
          <div className="public-profile-section-heading">
            <div>
              <p className="public-profile-eyebrow">OBRA PÚBLICA</p>
              <h2>Historias</h2>
            </div>
            <span className="public-profile-section-count">{pageData.stories.length}</span>
          </div>
          {pageData.stories.length === 0 ? (
            <div className="public-profile-empty-state">
              <span aria-hidden="true">✦</span>
              <h3>Aún no hay historias publicadas</h3>
              <p>Cuando este autor publique una historia, aparecerá aquí.</p>
            </div>
          ) : (
            <div className="public-profile-story-list">
              {pageData.stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </div>
          )}
        </section>

        <section className="public-profile-section">
          <div className="public-profile-section-heading">
            <div>
              <p className="public-profile-eyebrow">PARA LEER</p>
              <h2>Favoritos públicos</h2>
            </div>
            <span className="public-profile-section-count">{pageData.favorites.length}</span>
          </div>
          {pageData.favorites.length === 0 ? (
            <div className="public-profile-empty-state">
              <span aria-hidden="true">☆</span>
              <h3>Aún no hay favoritos públicos</h3>
              <p>Las historias favoritas de este autor aparecerán aquí cuando estén disponibles.</p>
            </div>
          ) : (
            <div className="public-profile-story-list">
              {pageData.favorites.map((favorite) => (
                favorite.stories && (
                  <StoryCard
                    key={favorite.id}
                    story={favorite.stories}
                    favorite
                  />
                )
              ))}
            </div>
          )}
        </section>
      </div>
      {connections.type && (
        <div className="public-profile-dialog-layer">
          <button
            className="public-profile-dialog-backdrop"
            type="button"
            aria-label="Cerrar lista"
            onClick={() => setConnections((current) => ({ ...current, type: null }))}
          />
          <section className="public-profile-connections-dialog" role="dialog" aria-modal="true" aria-labelledby="connections-dialog-title">
            <div className="public-profile-dialog-heading">
              <div>
                <p className="public-profile-eyebrow">COMUNIDAD</p>
                <h2 id="connections-dialog-title">
                  {connections.type === "followers" ? "Seguidores" : "Siguiendo"}
                </h2>
              </div>
              <button
                type="button"
                className="public-profile-dialog-close"
                aria-label="Cerrar"
                onClick={() => setConnections((current) => ({ ...current, type: null }))}
              >
                ×
              </button>
            </div>
            <div className="public-profile-connections-list" aria-live="polite">
              {connections.loading ? (
                <p className="public-profile-connections-state">Cargando perfiles...</p>
              ) : connections.error ? (
                <p className="public-profile-connections-state is-error" role="alert">{connections.error}</p>
              ) : connections.users.length === 0 ? (
                <p className="public-profile-connections-state">Esta lista todavía está vacía.</p>
              ) : (
                connections.users.map((connection) => (
                  <Link
                    className="public-profile-connection-item"
                    key={connection.id}
                    to={`/usuario/${connection.id}`}
                    onClick={() => setConnections((current) => ({ ...current, type: null }))}
                  >
                    <span className="public-profile-connection-avatar">
                      {connection.avatar_url ? (
                        <img src={connection.avatar_url} alt="" />
                      ) : (
                        (connection.username || "U").charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="public-profile-connection-username">@{connection.username || "Usuario de FriBuk"}</span>
                    <span className="public-profile-connection-arrow" aria-hidden="true">→</span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
