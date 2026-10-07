import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import ReadingListForm from "./ReadingListForm";
import "../../styles/reading-lists.css";

function storyCountLabel(count) {
  return `${count} ${count === 1 ? "historia" : "historias"}`;
}

// Gestión de las listas de lectura del propietario (pestaña "Listas" de /perfil).
export default function ReadingListsPanel({ lists, maxLists, loadError, onChange, onRetry }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const limitReached = lists.length >= maxLists;

  const showRequestError = (requestError, fallback) => {
    const detail = requestError.response?.data?.detail;
    setError(typeof detail === "string" ? detail : fallback);
  };

  const handleCreate = async (data) => {
    const response = await api.post("/reading-lists", data);
    onChange([response.data.list, ...lists]);
    setCreating(false);
    setError("");
  };

  const handleUpdate = async (list, data) => {
    const response = await api.put(`/reading-lists/${list.id}`, data);
    onChange(lists.map((item) => (item.id === list.id ? response.data.list : item)));
    setEditingId(null);
    setError("");
  };

  const handleTogglePrivacy = async (list) => {
    setBusyId(list.id);
    setError("");

    try {
      await handleUpdate(list, {
        name: list.name,
        description: list.description || "",
        is_public: !list.is_public,
      });
    } catch (requestError) {
      console.error("Error al cambiar la privacidad:", requestError);
      showRequestError(requestError, "No pudimos cambiar la privacidad de la lista.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (list) => {
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la lista "${list.name}"? Las historias no se eliminan.`
    );
    if (!confirmed) return;

    setBusyId(list.id);
    setError("");

    try {
      await api.delete(`/reading-lists/${list.id}`);
      onChange(lists.filter((item) => item.id !== list.id));
    } catch (requestError) {
      console.error("Error al eliminar la lista:", requestError);
      showRequestError(requestError, "No pudimos eliminar la lista.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="profile-section" role="tabpanel">
      <div className="profile-section-heading">
        <div>
          <p className="profile-eyebrow">TUS COLECCIONES</p>
          <h2>Listas de lectura</h2>
        </div>
        {!creating && !loadError && (
          <button
            type="button"
            className="reading-list-button is-primary"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
            }}
            disabled={limitReached}
            title={limitReached ? `Máximo de ${maxLists} listas` : undefined}
          >
            ＋ Crear lista
          </button>
        )}
      </div>

      {limitReached && !creating && (
        <p className="reading-list-hint">
          Alcanzaste el máximo de {maxLists} listas. Elimina una para crear otra.
        </p>
      )}

      {error && <p className="profile-inline-error" role="alert">{error}</p>}

      {creating && (
        <ReadingListForm
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
          submitLabel="Crear lista"
        />
      )}

      {loadError ? (
        <div className="profile-state profile-state-error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={onRetry}>Reintentar</button>
        </div>
      ) : lists.length === 0 && !creating ? (
        <div className="profile-empty-state">
          <span aria-hidden="true">❖</span>
          <h3>Aún no tienes listas de lectura</h3>
          <p>
            Crea listas para organizar historias a tu manera. Puedes guardarlas
            desde la página de cada historia.
          </p>
        </div>
      ) : (
        <div className="reading-list-grid">
          {lists.map((list) =>
            editingId === list.id ? (
              <ReadingListForm
                key={list.id}
                initialList={list}
                onSubmit={(data) => handleUpdate(list, data)}
                onCancel={() => setEditingId(null)}
                submitLabel="Guardar cambios"
              />
            ) : (
              <article className="reading-list-card" key={list.id}>
                <div className="reading-list-card-top">
                  <h3>
                    <Link to={`/listas/${list.id}`}>{list.name}</Link>
                  </h3>
                  <span className={`reading-list-badge${list.is_public ? " is-public" : ""}`}>
                    {list.is_public ? "Pública" : "Privada"}
                  </span>
                </div>
                {list.description && (
                  <p className="reading-list-card-description">{list.description}</p>
                )}
                <p className="reading-list-card-count">{storyCountLabel(list.story_count || 0)}</p>
                <div className="reading-list-card-actions">
                  <Link to={`/listas/${list.id}`} className="reading-list-button is-primary">
                    Ver lista
                  </Link>
                  <button
                    type="button"
                    className="reading-list-button"
                    onClick={() => {
                      setEditingId(list.id);
                      setCreating(false);
                    }}
                    disabled={busyId === list.id}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="reading-list-button"
                    onClick={() => handleTogglePrivacy(list)}
                    disabled={busyId === list.id}
                  >
                    {list.is_public ? "Hacer privada" : "Hacer pública"}
                  </button>
                  <button
                    type="button"
                    className="reading-list-button is-danger"
                    onClick={() => handleDelete(list)}
                    disabled={busyId === list.id}
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            )
          )}
        </div>
      )}
    </section>
  );
}
