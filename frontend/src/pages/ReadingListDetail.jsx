import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import ReadingListForm from "../components/profile/ReadingListForm";
import "../styles/reading-lists.css";

function emptyPageData(listId) {
  return { listId, loading: true, error: "", list: null, stories: [] };
}

export default function ReadingListDetail() {
  const { listId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [pageData, setPageData] = useState(() => emptyPageData(null));
  const [editing, setEditing] = useState(false);
  const [removingStoryId, setRemovingStoryId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authLoading) return undefined;

    let isActive = true;
    api.get(`/reading-lists/${listId}`)
      .then((response) => {
        if (!isActive) return;
        setPageData({
          listId,
          loading: false,
          error: "",
          list: response.data.list,
          stories: response.data.stories || [],
        });
      })
      .catch((error) => {
        console.error("Error al cargar la lista:", error);
        if (!isActive) return;
        setPageData({
          ...emptyPageData(listId),
          loading: false,
          error: error.response?.status === 404
            ? "No encontramos esta lista. Puede que no exista o que sea privada."
            : "No se pudo cargar esta lista.",
        });
      });

    return () => {
      isActive = false;
    };
  }, [listId, user?.id, authLoading, reloadKey]);

  const isLoading = authLoading || pageData.listId !== listId || pageData.loading;
  const { list, stories } = pageData;
  // Los controles de administración solo existen para el propietario;
  // el backend vuelve a comprobarlo en cada operación.
  const isOwner = Boolean(list?.is_owner);

  const requestErrorMessage = (error, fallback) => {
    const detail = error.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
  };

  const handleUpdate = async (data) => {
    const response = await api.put(`/reading-lists/${listId}`, data);
    setPageData((current) => ({
      ...current,
      list: { ...current.list, ...response.data.list },
    }));
    setEditing(false);
    showToast("Lista actualizada.");
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la lista "${list.name}"? Las historias no se eliminan.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api.delete(`/reading-lists/${listId}`);
      showToast("Lista eliminada.");
      navigate("/perfil");
    } catch (error) {
      console.error("Error al eliminar la lista:", error);
      showToast(requestErrorMessage(error, "No pudimos eliminar la lista."), "error");
      setDeleting(false);
    }
  };

  const handleRemoveStory = async (story) => {
    setRemovingStoryId(story.id);
    try {
      await api.delete(`/reading-lists/${listId}/stories/${story.id}`);
      setPageData((current) => {
        const nextStories = current.stories.filter((item) => item.id !== story.id);
        return {
          ...current,
          stories: nextStories,
          list: { ...current.list, story_count: nextStories.length },
        };
      });
      showToast(`"${story.title}" se quitó de la lista.`);
    } catch (error) {
      console.error("Error al quitar la historia:", error);
      showToast(requestErrorMessage(error, "No pudimos quitar la historia."), "error");
    } finally {
      setRemovingStoryId(null);
    }
  };

  if (isLoading) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-container">
          <p className="public-profile-state">Cargando lista...</p>
        </div>
      </main>
    );
  }

  if (pageData.error || !list) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-container">
          <div className="public-profile-state public-profile-state-error" role="alert">
            <p>{pageData.error || "No encontramos esta lista."}</p>
            <button
              className="public-profile-retry"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Reintentar
            </button>
            <Link to="/">Volver a explorar</Link>
          </div>
        </div>
      </main>
    );
  }

  const ownerName = list.owner?.username || "Usuario de FriBuk";

  return (
    <main className="public-profile-page">
      <div className="public-profile-container">
        <header className="reading-list-header">
          <p className="public-profile-eyebrow">LISTA DE LECTURA</p>

          {editing ? (
            <ReadingListForm
              initialList={list}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
              submitLabel="Guardar cambios"
            />
          ) : (
            <>
              <div className="reading-list-header-title">
                <h1>{list.name}</h1>
                {isOwner && (
                  <span className={`reading-list-badge${list.is_public ? " is-public" : ""}`}>
                    {list.is_public ? "Pública" : "Privada"}
                  </span>
                )}
              </div>
              {list.description && (
                <p className="reading-list-header-description">{list.description}</p>
              )}
              <p className="reading-list-header-meta">
                <Link to={`/usuario/${list.user_id}`} className="reading-list-owner">
                  <span className="reading-list-owner-avatar" aria-hidden="true">
                    {list.owner?.avatar_url ? (
                      <img src={list.owner.avatar_url} alt="" />
                    ) : (
                      ownerName.charAt(0).toUpperCase()
                    )}
                  </span>
                  @{ownerName}
                </Link>
                <span>
                  {stories.length} {stories.length === 1 ? "historia" : "historias"}
                </span>
              </p>

              {isOwner && (
                <div className="reading-list-header-actions">
                  <button
                    type="button"
                    className="reading-list-button"
                    onClick={() => setEditing(true)}
                    disabled={deleting}
                  >
                    Editar lista
                  </button>
                  <button
                    type="button"
                    className="reading-list-button is-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Eliminando..." : "Eliminar lista"}
                  </button>
                  <Link to="/perfil" className="reading-list-button">
                    Volver a mi perfil
                  </Link>
                </div>
              )}
            </>
          )}
        </header>

        <section className="public-profile-section">
          {stories.length === 0 ? (
            <div className="public-profile-empty-state">
              <span aria-hidden="true">❖</span>
              <h3>Esta lista todavía no tiene historias</h3>
              {isOwner && (
                <p>Abre una historia y usa “Guardar en lista” para agregarla aquí.</p>
              )}
            </div>
          ) : (
            <div className="public-profile-story-list">
              {stories.map((story) => (
                <article className="public-profile-story-card" key={story.id}>
                  <div className="public-profile-story-cover">
                    <img
                      src={story.cover_url || "/logo-fribuk.jpg"}
                      alt={story.cover_url ? `Portada de ${story.title}` : "FriBuk"}
                    />
                  </div>
                  <div className="public-profile-story-info">
                    <p className="public-profile-story-genre">{story.genre || "Sin género"}</p>
                    <h3>{story.title}</h3>
                    {story.description && (
                      <p className="public-profile-story-description">{story.description}</p>
                    )}
                    <div className="public-profile-story-meta">
                      <span>{story.chapter_count || 0} capítulos</span>
                      {story.author_username && <span>Por {story.author_username}</span>}
                      <span>❤️ {story.recommendation_count || 0}</span>
                      <span>
                        ⭐ {story.general_rating == null ? "—" : Number(story.general_rating).toFixed(1)}
                      </span>
                    </div>
                    <div className="public-profile-story-actions reading-list-story-actions">
                      <Link to={`/stories/${story.id}`} className="public-profile-story-link">
                        Leer historia
                      </Link>
                      {isOwner && (
                        <button
                          type="button"
                          className="reading-list-button"
                          onClick={() => handleRemoveStory(story)}
                          disabled={removingStoryId === story.id}
                        >
                          {removingStoryId === story.id ? "Quitando..." : "Quitar de la lista"}
                        </button>
                      )}
                    </div>
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
