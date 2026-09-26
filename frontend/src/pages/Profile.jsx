import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

function StoryCover({ story }) {
  return (
    <div className="profile-story-cover">
      {story.cover_url ? (
        <img src={story.cover_url} alt={`Portada de ${story.title}`} />
      ) : (
        <img src="/logo-fribuk.jpg" alt="FriBuk" />
      )}
    </div>
  );
}

function statusLabel(status) {
  const labels = {
    published: "Publicada",
    draft: "Borrador",
    completed: "Terminada",
    paused: "Pausada",
  };

  return labels[status] || "En curso";
}

async function fetchProfileData() {
  const [storiesResponse, favoritesResponse] = await Promise.all([
    api.get("/my-stories"),
    api.get("/favorites"),
  ]);

  return {
    stories: storiesResponse.data.stories || [],
    favorites: favoritesResponse.data.favorites || [],
  };
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [activeSection, setActiveSection] = useState("stories");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [showClosureConfirmation, setShowClosureConfirmation] = useState(false);
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [closureRequestSent, setClosureRequestSent] = useState(false);
  const [closureFeedback, setClosureFeedback] = useState(null);
  const [stories, setStories] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const [removingFavoriteId, setRemovingFavoriteId] = useState(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const profileData = await fetchProfileData();
      setStories(profileData.stories);
      setFavorites(profileData.favorites);
    } catch (error) {
      console.error("Error al cargar el perfil:", error);
      setLoadError("No pudimos cargar tu perfil. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    fetchProfileData()
      .then((profileData) => {
        if (!isActive) return;
        setStories(profileData.stories);
        setFavorites(profileData.favorites);
      })
      .catch((error) => {
        console.error("Error al cargar el perfil:", error);
        if (isActive) {
          setLoadError("No pudimos cargar tu perfil. Inténtalo nuevamente.");
        }
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleRemoveFavorite = async (storyId) => {
    setFavoriteError("");
    setRemovingFavoriteId(storyId);

    try {
      await api.delete(`/favorites/${storyId}`);
      setFavorites((current) =>
        current.filter((favorite) => favorite.story_id !== storyId)
      );
    } catch (error) {
      console.error("Error al quitar favorito:", error);
      setFavoriteError("No pudimos quitar esta historia de tus favoritos.");
    } finally {
      setRemovingFavoriteId(null);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    if (!file) return;

    setAvatarError("");
    setAvatarMessage("");
    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/me/avatar", formData);
      const updatedAvatarUrl = response.data.avatar_url;
      setAvatarUrl(updatedAvatarUrl);
      updateUser({ avatar_url: updatedAvatarUrl });
      setAvatarMessage("Tu foto de perfil se actualizó correctamente.");
    } catch (error) {
      console.error("Error al subir la foto de perfil:", error);
      setAvatarError(
        error.response?.data?.detail || "No se pudo actualizar tu foto de perfil."
      );
    } finally {
      setAvatarUploading(false);
      input.value = "";
    }
  };

  const handleAccountClosureRequest = async () => {
    setClosureSubmitting(true);
    setClosureFeedback(null);

    try {
      await api.post("/support", {
        category: "Solicitud de cierre de cuenta",
        message: "Solicito el cierre de mi cuenta de FriBuk.",
      });
      setClosureRequestSent(true);
      setShowClosureConfirmation(false);
      setClosureFeedback({
        type: "success",
        message: "Enviamos tu solicitud al equipo de FriBuk. Tu cuenta no se ha cerrado automáticamente.",
      });
    } catch (error) {
      console.error("Error al solicitar el cierre de cuenta:", error);
      const detail = error.response?.data?.detail;
      setClosureFeedback({
        type: "error",
        message: typeof detail === "string"
          ? detail
          : "No pudimos enviar la solicitud. Inténtalo nuevamente.",
      });
    } finally {
      setClosureSubmitting(false);
    }
  };

  const username = user?.username || user?.email?.split("@")[0] || "usuario";

  return (
    <main className="profile-page">
      <div className="profile-container">
        <header className="profile-header">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`Foto de perfil de ${username}`} />
              ) : (
                username.charAt(0).toUpperCase()
              )}
            </div>
            <label className={`profile-avatar-upload${avatarUploading ? " is-loading" : ""}`}>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
                aria-label="Subir foto de perfil"
              />
              <span aria-hidden="true">✎</span>
              {avatarUploading ? "Subiendo..." : avatarUrl ? "Cambiar foto" : "Subir foto"}
            </label>
          </div>
          {avatarError && <p className="profile-avatar-feedback error" role="alert">{avatarError}</p>}
          {avatarMessage && <p className="profile-avatar-feedback success" role="status">{avatarMessage}</p>}
          <p className="profile-eyebrow">TU ESPACIO EN FRIBUK</p>
          <h1>Mi perfil</h1>
          <p className="profile-username">@{username}</p>

          <div className="profile-tabs" role="tablist" aria-label="Secciones del perfil">
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "stories"}
              className={activeSection === "stories" ? "active" : ""}
              onClick={() => setActiveSection("stories")}
            >
              Mis historias <span>{stories.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "favorites"}
              className={activeSection === "favorites" ? "active" : ""}
              onClick={() => setActiveSection("favorites")}
            >
              Favoritos <span>{favorites.length}</span>
            </button>
          </div>
        </header>

        {loading ? (
          <p className="profile-state">Cargando tu espacio...</p>
        ) : loadError ? (
          <div className="profile-state profile-state-error" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={loadProfile}>
              Reintentar
            </button>
          </div>
        ) : activeSection === "stories" ? (
          <section className="profile-section" role="tabpanel">
            <div className="profile-section-heading">
              <div>
                <p className="profile-eyebrow">TU OBRA</p>
                <h2>Mis historias</h2>
              </div>
              <Link to="/create-story" className="profile-create-button">
                ＋ Crear historia
              </Link>
            </div>

            {stories.length === 0 ? (
              <div className="profile-empty-state">
                <span aria-hidden="true">✦</span>
                <h3>Aún no tienes historias</h3>
                <p>Cuando crees una historia, aparecerá aquí para que puedas gestionarla.</p>
                <Link to="/create-story" className="profile-create-button">
                  Crear mi primera historia
                </Link>
              </div>
            ) : (
              <div className="profile-story-list">
                {stories.map((story) => (
                  <article className="profile-story-card" key={story.id}>
                    <StoryCover story={story} />
                    <div className="profile-story-info">
                      <p className="profile-story-genre">{story.genre || "Sin género"}</p>
                      <h3>{story.title}</h3>
                      <div className="profile-story-meta">
                        <span className={`profile-story-status status-${story.status || "ongoing"}`}>
                          {statusLabel(story.status)}
                        </span>
                        <span>{story.chapter_count || 0} capítulos</span>
                      </div>
                      <div className="profile-story-actions">
                        <Link to={`/stories/${story.id}`} className="profile-action-primary">
                          Ver
                        </Link>
                        <Link to={`/stories/${story.id}/edit`} className="profile-action-secondary">
                          Editar
                        </Link>
                        <Link to={`/stories/${story.id}/create-chapter`} className="profile-action-secondary">
                          Capítulos
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="profile-section" role="tabpanel">
            <div className="profile-section-heading">
              <div>
                <p className="profile-eyebrow">PARA LEER DESPUÉS</p>
                <h2>Favoritos</h2>
              </div>
            </div>

            {favoriteError && (
              <p className="profile-inline-error" role="alert">{favoriteError}</p>
            )}

            {favorites.length === 0 ? (
              <div className="profile-empty-state">
                <span aria-hidden="true">☆</span>
                <h3>Tu lista está esperando historias</h3>
                <p>Guarda tus historias favoritas y las encontrarás aquí.</p>
                <Link to="/" className="profile-create-button">Explorar historias</Link>
              </div>
            ) : (
              <div className="profile-story-list">
                {favorites.map((favorite) => {
                  const story = favorite.stories;
                  if (!story) return null;

                  return (
                    <article className="profile-story-card" key={favorite.id}>
                      <StoryCover story={story} />
                      <div className="profile-story-info">
                        <p className="profile-story-genre">{story.genre || "Sin género"}</p>
                        <h3>{story.title}</h3>
                        <div className="profile-story-meta">
                          <span>{story.chapter_count || 0} capítulos</span>
                          {story.author_username && <span>Por {story.author_username}</span>}
                        </div>
                        <div className="profile-story-actions">
                          <Link to={`/stories/${story.id}`} className="profile-action-primary">
                            Leer historia
                          </Link>
                          <button
                            type="button"
                            className="profile-action-secondary"
                            onClick={() => handleRemoveFavorite(favorite.story_id)}
                            disabled={removingFavoriteId === favorite.story_id}
                          >
                            {removingFavoriteId === favorite.story_id ? "Quitando..." : "Quitar de favoritos"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="profile-account-section" aria-labelledby="profile-account-title">
          <div>
            <p className="profile-eyebrow">GESTIÓN DE CUENTA</p>
            <h2 id="profile-account-title">Cuenta</h2>
            <p>
              Puedes solicitar el cierre de tu cuenta. El equipo de FriBuk revisará la solicitud;
              enviarla no cierra la cuenta automáticamente.
            </p>
          </div>

          {closureFeedback && (
            <p
              className={`profile-closure-feedback ${closureFeedback.type}`}
              role={closureFeedback.type === "error" ? "alert" : "status"}
            >
              {closureFeedback.message}
            </p>
          )}

          {!closureRequestSent && !showClosureConfirmation && (
            <button
              type="button"
              className="profile-closure-trigger"
              onClick={() => setShowClosureConfirmation(true)}
            >
              Solicitar cierre de cuenta
            </button>
          )}

          {showClosureConfirmation && (
            <div className="profile-closure-confirmation">
              <p>¿Quieres enviar esta solicitud al equipo de FriBuk?</p>
              <div>
                <button
                  type="button"
                  className="profile-closure-cancel"
                  onClick={() => setShowClosureConfirmation(false)}
                  disabled={closureSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="profile-closure-submit"
                  onClick={handleAccountClosureRequest}
                  disabled={closureSubmitting}
                >
                  {closureSubmitting ? "Enviando..." : "Enviar solicitud"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
