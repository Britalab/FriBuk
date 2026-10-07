import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../hooks/useToast";
import "../../styles/reading-lists.css";

// Botón "Guardar en lista" de la página de una historia.
// Es independiente de favoritos: solo usa los endpoints de listas de lectura.
export default function AddToListMenu({ storyId }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lists, setLists] = useState([]);
  const [maxLists, setMaxLists] = useState(20);
  const [busyId, setBusyId] = useState(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const requestErrorMessage = (requestError, fallback) => {
    const detail = requestError.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
  };

  const handleToggleOpen = async () => {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setError("");
    if (!user) return;

    setLoading(true);
    try {
      const response = await api.get("/me/reading-lists", {
        params: { story_id: storyId },
      });
      setLists(response.data.lists || []);
      setMaxLists(response.data.max_lists || 20);
    } catch (requestError) {
      console.error("Error al cargar las listas:", requestError);
      setLists([]);
      setError(requestErrorMessage(requestError, "No pudimos cargar tus listas."));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleList = async (list) => {
    if (busyId) return;

    setBusyId(list.id);
    setError("");
    const removing = Boolean(list.contains_story);

    try {
      if (removing) {
        await api.delete(`/reading-lists/${list.id}/stories/${storyId}`);
      } else {
        await api.post(`/reading-lists/${list.id}/stories/${storyId}`);
      }

      setLists((current) =>
        current.map((item) =>
          item.id === list.id ? { ...item, contains_story: !removing } : item
        )
      );
      showToast(
        removing
          ? `Historia quitada de "${list.name}".`
          : `Historia guardada en "${list.name}".`
      );
    } catch (requestError) {
      console.error("Error al actualizar la lista:", requestError);
      setError(requestErrorMessage(requestError, "No pudimos actualizar la lista."));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;

    setCreating(true);
    setError("");

    try {
      const response = await api.post("/reading-lists", { name, is_public: false });
      const createdList = response.data.list;
      setLists((current) => [{ ...createdList, contains_story: false }, ...current]);
      setNewName("");

      await api.post(`/reading-lists/${createdList.id}/stories/${storyId}`);
      setLists((current) =>
        current.map((item) =>
          item.id === createdList.id ? { ...item, contains_story: true } : item
        )
      );
      showToast(`Historia guardada en "${createdList.name}".`);
    } catch (requestError) {
      console.error("Error al crear la lista:", requestError);
      setError(requestErrorMessage(requestError, "No pudimos crear la lista."));
    } finally {
      setCreating(false);
    }
  };

  const savedCount = lists.filter((list) => list.contains_story).length;

  return (
    <div className="add-to-list" ref={containerRef}>
      <button
        type="button"
        className={`add-to-list-button${savedCount > 0 ? " active" : ""}`}
        onClick={handleToggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">❖</span>
        Guardar en lista
      </button>

      {open && (
        <div className="add-to-list-menu" role="dialog" aria-label="Guardar en una lista de lectura">
          <p className="add-to-list-title">Guardar en lista</p>

          {!user ? (
            <p className="add-to-list-state">
              Debes iniciar sesión para usar listas de lectura.{" "}
              <Link to="/login">Iniciar sesión</Link>
            </p>
          ) : loading ? (
            <p className="add-to-list-state">Cargando tus listas...</p>
          ) : (
            <>
              {lists.length === 0 && !error && (
                <p className="add-to-list-state">Todavía no tienes listas. Crea la primera aquí.</p>
              )}

              {lists.length > 0 && (
                <ul className="add-to-list-options">
                  {lists.map((list) => (
                    <li key={list.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(list.contains_story)}
                          onChange={() => handleToggleList(list)}
                          disabled={busyId !== null}
                        />
                        <span className="add-to-list-name">{list.name}</span>
                        <span className="add-to-list-privacy">
                          {list.is_public ? "Pública" : "Privada"}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {lists.length < maxLists ? (
                <form className="add-to-list-create" onSubmit={handleCreate}>
                  <input
                    type="text"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    maxLength={80}
                    placeholder="Nueva lista"
                    aria-label="Nombre de la nueva lista"
                    disabled={creating}
                  />
                  <button type="submit" disabled={creating || !newName.trim()}>
                    {creating ? "..." : "Crear"}
                  </button>
                </form>
              ) : (
                <p className="add-to-list-state">Alcanzaste el máximo de {maxLists} listas.</p>
              )}
            </>
          )}

          {error && <p className="reading-list-error" role="alert">{error}</p>}

          {user && (
            <Link to="/perfil" className="add-to-list-manage">
              Administrar mis listas
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
