import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import ProfileAbout from "../components/profile/ProfileAbout";
import ProfileInfoForm from "../components/profile/ProfileInfoForm";
import ReadingListsPanel from "../components/profile/ReadingListsPanel";
import { MyModerationNotices } from "../components/moderation/ModerationNotices";

const EMPTY_PROFILE_INFO = { display_name: null, bio: null, website_url: null };

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

async function fetchProfileData(userId) {
  const [
    storiesResponse,
    favoritesResponse,
    followStatsResponse,
    profileResponse,
    readingListsResponse,
  ] =
    await Promise.all([
      api.get("/my-stories"),
      api.get("/favorites"),
      api.get(`/users/${userId}/follow-stats`),
      // Si la información de perfil falla, el resto de la página carga igual.
      api.get("/me/profile").catch((error) => {
        console.error("Error al cargar la información de perfil:", error);
        return null;
      }),
      api.get("/me/reading-lists").catch((error) => {
        console.error("Error al cargar las listas de lectura:", error);
        return null;
      }),
    ]);

  return {
    readingLists: readingListsResponse?.data?.lists || [],
    maxReadingLists: readingListsResponse?.data?.max_lists || 20,
    readingListsError: readingListsResponse
      ? ""
      : "No pudimos cargar tus listas de lectura.",
    profileInfo: profileResponse?.data?.profile || EMPTY_PROFILE_INFO,
    stories: storiesResponse.data.stories || [],
    favorites: favoritesResponse.data.favorites || [],
    followStats: {
      followers: followStatsResponse.data?.followers || 0,
      following: followStatsResponse.data?.following || 0,
    },
  };
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const userId = user?.id;
  const [activeSection, setActiveSection] = useState("stories");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [bannerUrl, setBannerUrl] = useState(user?.banner_url || "");
  const [bannerAction, setBannerAction] = useState(null);
  const [bannerError, setBannerError] = useState("");
  const [bannerMessage, setBannerMessage] = useState("");
  const [showClosureConfirmation, setShowClosureConfirmation] = useState(false);
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [closureRequestSent, setClosureRequestSent] = useState(false);
  const [closureFeedback, setClosureFeedback] = useState(null);
  const [stories, setStories] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followStats, setFollowStats] = useState({
    followers: 0,
    following: 0,
  });
  const [followList, setFollowList] = useState([]);
  const [followListType, setFollowListType] = useState(null);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [followListError, setFollowListError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const [removingFavoriteId, setRemovingFavoriteId] = useState(null);
  const [deletingStoryId, setDeletingStoryId] = useState(null);
  const [storyError, setStoryError] = useState("");
  const [profileInfo, setProfileInfo] = useState(EMPTY_PROFILE_INFO);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [readingLists, setReadingLists] = useState([]);
  const [maxReadingLists, setMaxReadingLists] = useState(20);
  const [readingListsError, setReadingListsError] = useState("");

  const applyProfileData = (profileData) => {
    setStories(profileData.stories);
    setFavorites(profileData.favorites);
    setFollowStats(profileData.followStats);
    setProfileInfo(profileData.profileInfo);
    setReadingLists(profileData.readingLists);
    setMaxReadingLists(profileData.maxReadingLists);
    setReadingListsError(profileData.readingListsError);
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      applyProfileData(await fetchProfileData(userId));
    } catch (error) {
      console.error("Error al cargar el perfil:", error);
      setLoadError("No pudimos cargar tu perfil. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isActive = true;

    fetchProfileData(userId)
      .then((profileData) => {
        if (isActive) applyProfileData(profileData);
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
  }, [userId]);

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

const handleDeleteStory = async (storyId, storyTitle) => {
  const confirmed = window.confirm(
    `¿Seguro que quieres eliminar "${storyTitle}"? Esta acción no se puede deshacer.`
  );

    if (!confirmed) return;

    setStoryError("");
    setDeletingStoryId(storyId);

    try {
      await api.delete(`/stories/${storyId}`);

      setStories((current) =>
        current.filter((story) => story.id !== storyId)
      );
    } catch (error) {
      console.error("Error al eliminar historia:", error);

      setStoryError(
        error.response?.data?.detail ||
        "No pudimos eliminar esta historia."
      );
    } finally {
      setDeletingStoryId(null);
    }
  };

  const handleOpenFollowList = async (type) => {
  if (followListType === type) {
    setFollowListType(null);
    return;
  }

  setFollowListType(type);
  setFollowList([]);
  setFollowListError("");
  setFollowListLoading(true);

  try {
    const endpoint =
      type === "followers"
        ? `/users/${userId}/followers`
        : `/users/${userId}/following`;

    const response = await api.get(endpoint);

    setFollowList(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error("Error al cargar lista de seguidores:", error);

    setFollowListError(
      error.response?.data?.detail ||
      "No pudimos cargar esta lista."
    );
  } finally {
    setFollowListLoading(false);
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

  const handleBannerUpload = async (event) => {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    if (!file) return;

    setBannerError("");
    setBannerMessage("");
    setBannerAction("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/me/banner", formData);
      const updatedBannerUrl = response.data.banner_url;
      setBannerUrl(updatedBannerUrl);
      updateUser({ banner_url: updatedBannerUrl });
      setBannerMessage("Tu banner se actualizó correctamente.");
    } catch (error) {
      console.error("Error al subir el banner:", error);
      setBannerError(
        error.response?.data?.detail || "No se pudo actualizar tu banner."
      );
    } finally {
      setBannerAction(null);
      input.value = "";
    }
  };

  const handleBannerRemove = async () => {
    setBannerError("");
    setBannerMessage("");
    setBannerAction("remove");

    try {
      await api.delete("/me/banner");
      setBannerUrl("");
      updateUser({ banner_url: null });
      setBannerMessage("Quitaste el banner de tu perfil.");
    } catch (error) {
      console.error("Error al quitar el banner:", error);
      setBannerError(
        error.response?.data?.detail || "No se pudo quitar tu banner."
      );
    } finally {
      setBannerAction(null);
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

  const handleProfileSaved = (savedProfile) => {
    setProfileInfo(savedProfile || EMPTY_PROFILE_INFO);
    setEditingProfile(false);
    setProfileMessage("Tu información de perfil se actualizó correctamente.");
  };

  const username = user?.username || user?.email?.split("@")[0] || "usuario";

  return (
    <main className="profile-page">
      <div className="profile-container">
        <MyModerationNotices />

        <header className={`profile-header${bannerUrl ? " has-banner" : ""}`}>
          <div className="profile-banner">
            {bannerUrl && <img src={bannerUrl} alt="" />}
            <div className="profile-banner-actions">
              <label className={`profile-banner-action${bannerAction ? " is-loading" : ""}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleBannerUpload}
                  disabled={Boolean(bannerAction)}
                  aria-label="Subir banner de perfil"
                />
                <span aria-hidden="true">✎</span>
                {bannerAction === "upload"
                  ? "Subiendo..."
                  : bannerUrl
                  ? "Cambiar banner"
                  : "Añadir banner"}
              </label>
              {bannerUrl && (
                <button
                  type="button"
                  className="profile-banner-action"
                  onClick={handleBannerRemove}
                  disabled={Boolean(bannerAction)}
                >
                  {bannerAction === "remove" ? "Quitando..." : "Quitar"}
                </button>
              )}
            </div>
            {!bannerUrl && (
              <p className="profile-banner-hint">
                JPG o PNG de hasta 5 MB. Se ve mejor una imagen horizontal de 1600 × 400 px.
              </p>
            )}
          </div>
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
          {bannerError && <p className="profile-avatar-feedback error" role="alert">{bannerError}</p>}
          {bannerMessage && <p className="profile-avatar-feedback success" role="status">{bannerMessage}</p>}
          <p className="profile-eyebrow">TU ESPACIO EN FRIBUK</p>
          <h1>Mi perfil</h1>
          {profileInfo.display_name && (
            <p className="profile-display-name">{profileInfo.display_name}</p>
          )}
          <p className="profile-username">@{username}</p>
          <ProfileAbout bio={profileInfo.bio} websiteUrl={profileInfo.website_url} />
          <p className="profile-private-note">
            Esta página es solo tuya. Aquí gestionas tu cuenta y tus obras.
          </p>
          <div className="profile-header-actions">
            <Link to={`/usuario/${userId}`} className="profile-header-action">
              {/* El mismo ojo del campo de contraseña. */}
              <svg
                className="profile-eye-icon"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Ver mi perfil público
            </Link>
            <Link to="/perfil/personalizar" className="profile-header-action">
              <span aria-hidden="true">✦</span> Personalizar mi espacio
            </Link>
            <button
              type="button"
              className="profile-header-action"
              onClick={() => {
                setProfileMessage("");
                setEditingProfile((current) => !current);
              }}
              aria-expanded={editingProfile}
            >
              <span aria-hidden="true">✎</span> Editar perfil
            </button>
            <Link to="/mensajes/ajustes" className="profile-header-action">
              <span aria-hidden="true">✉</span> Privacidad de mensajes
            </Link>
            {user?.is_admin && (
              <Link to="/support/admin" className="profile-header-action">
                <span aria-hidden="true">⚙</span> Panel de administración
              </Link>
            )}
          </div>
          {profileMessage && (
            <p className="profile-avatar-feedback success" role="status">{profileMessage}</p>
          )}
          {editingProfile && (
            <ProfileInfoForm
              profile={profileInfo}
              onSaved={handleProfileSaved}
              onCancel={() => setEditingProfile(false)}
            />
          )}
            <div className="profile-follow-stats">
            <button
              type="button"
              className={`profile-follow-stat ${
                followListType === "followers" ? "active" : ""
              }`}
              onClick={() => handleOpenFollowList("followers")}
            >
              <strong>{followStats.followers}</strong>
              <span>Seguidores</span>
            </button>

            <button
              type="button"
              className={`profile-follow-stat ${
                followListType === "following" ? "active" : ""
              }`}
              onClick={() => handleOpenFollowList("following")}
            >
              <strong>{followStats.following}</strong>
              <span>Siguiendo</span>
            </button>
          </div>
                    {followListType && (
            <section className="profile-follow-list">
              <div className="profile-follow-list-header">
                <div>
                  <p className="profile-eyebrow">COMUNIDAD</p>
                  <h2>
                    {followListType === "followers"
                      ? "Seguidores"
                      : "Siguiendo"}
                  </h2>
                </div>

                <button
                  type="button"
                  className="profile-follow-list-close"
                  onClick={() => setFollowListType(null)}
                  aria-label="Cerrar lista"
                >
                  ×
                </button>
              </div>

              {followListLoading ? (
                <p className="profile-state">Cargando...</p>
              ) : followListError ? (
                <p className="profile-inline-error" role="alert">
                  {followListError}
                </p>
              ) : followList.length === 0 ? (
                <div className="profile-empty-state">
                  <span aria-hidden="true">♡</span>
                  <h3>
                    {followListType === "followers"
                      ? "Todavía no tienes seguidores"
                      : "Todavía no sigues a nadie"}
                  </h3>
                </div>
              ) : (
                <div className="profile-follow-users">
                  {followList.map((followUser) => (
                    <div className="profile-follow-user" key={followUser.id}>
                      <div className="profile-follow-user-avatar">
                        {followUser.avatar_url ? (
                          <img src={followUser.avatar_url} alt="" />
                        ) : (
                          (followUser.username || "U").charAt(0).toUpperCase()
                        )}
                      </div>

                      <div>
                        <strong>@{followUser.username || "Usuario de FriBuk"}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

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
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === "lists"}
              className={activeSection === "lists" ? "active" : ""}
              onClick={() => setActiveSection("lists")}
            >
              Listas <span>{readingLists.length}</span>
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
          {storyError && (
            <p className="profile-inline-error" role="alert">
              {storyError}
            </p>
          )}
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

                        <button
                          type="button"
                          className="profile-action-danger"
                          onClick={() => handleDeleteStory(story.id, story.title)}
                          disabled={deletingStoryId === story.id}
                          aria-label={`Eliminar ${story.title}`}
                          title="Eliminar historia"
                        >
                          {deletingStoryId === story.id ? "..." : "🗑️"}
                        </button>
                      </div>
                      
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeSection === "lists" ? (
          <ReadingListsPanel
            lists={readingLists}
            maxLists={maxReadingLists}
            loadError={readingListsError}
            onChange={setReadingLists}
            onRetry={loadProfile}
          />
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
