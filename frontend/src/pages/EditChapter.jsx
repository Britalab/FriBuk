import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useToast } from "../hooks/useToast";

export default function EditChapter() {
  const { storyId, chapterId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [chapterNumber, setChapterNumber] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [status, setStatus] = useState("draft");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadChapter = async () => {
      try {
        const response = await api.get(
          `/chapters/${chapterId}`
        );

        const chapter = response.data;

        setChapterNumber(chapter.chapter_number || "");
        setTitle(chapter.title || "");
        setContent(chapter.content || "");
        setStatus(chapter.status || "draft");
      } catch (err) {
        console.error(
          "Error al cargar el capítulo:",
          err
        );

        setError(
          err.response?.data?.detail ||
            "No se pudo cargar el capítulo."
        );
      } finally {
        setLoading(false);
      }
    };

    loadChapter();
  }, [chapterId]);

  const validateChapter = () => {
    setError("");

    if (!chapterNumber || Number(chapterNumber) < 1) {
      setError(
        "El número del capítulo debe ser mayor que 0."
      );
      return false;
    }

    if (!title.trim()) {
      setError(
        "El título del capítulo es obligatorio."
      );
      return false;
    }

    if (!content.trim()) {
      setError(
        "El contenido del capítulo es obligatorio."
      );
      return false;
    }

    return true;
  };

  // Publicar es una acción explícita del autor: guarda el texto actual y
  // cambia el capítulo de borrador a publicado. No se puede deshacer.
  const handlePublish = async () => {
    if (publishing || saving || !validateChapter()) return;

    const confirmed = window.confirm(
      "¿Publicar este capítulo? Será visible para los lectores y no podrá volver a borrador."
    );

    if (!confirmed) return;

    setPublishing(true);

    try {
      const response = await api.put(`/chapters/${chapterId}`, {
        chapter_number: Number(chapterNumber),
        title: title.trim(),
        content: content.trim(),
        status: "published",
      });

      setStatus(response.data.chapter?.status || "published");
      showToast("Capítulo publicado correctamente. Ya es visible para los lectores.");
    } catch (err) {
      console.error(
        "Error al publicar el capítulo:",
        err
      );

      showToast(err.response?.data?.detail || "No se pudo publicar el capítulo. Intenta nuevamente.", "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateChapter()) return;

    setSaving(true);

    try {
      await api.put(`/chapters/${chapterId}`, {
        chapter_number: Number(chapterNumber),
        title: title.trim(),
        content: content.trim(),
      });

      showToast("Capítulo actualizado correctamente.");
      navigate(`/stories/${storyId}`);
    } catch (err) {
      console.error(
        "Error al actualizar el capítulo:",
        err
      );

      showToast(err.response?.data?.detail || "No se pudo guardar el cambio. Intenta nuevamente.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="story-editor-page">
        <div className="story-editor-container">

          <Link
            to={`/stories/${storyId}`}
            className="story-editor-back"
          >
            ← Volver a la historia
          </Link>

          <p className="loading-text">
            Cargando capítulo...
          </p>

        </div>
      </main>
    );
  }

  return (
    <main className="story-editor-page">
      <div className="story-editor-container">

        <Link
          to={`/stories/${storyId}`}
          className="story-editor-back"
        >
          ← Volver a la historia
        </Link>

        <header className="story-editor-header">
          <p className="chapters-eyebrow">
            EDITAR CAPÍTULO
          </p>

          <h1>Editar capítulo</h1>

          <p>
            Modifica el contenido de tu capítulo y guarda
            los cambios cuando estés listo.
          </p>

          <p>
            <span className={`story-detail-status status-${status}`}>
              <span aria-hidden="true">
                {status === "published" ? "●" : "○"}
              </span>
              {status === "published"
                ? "Publicado · visible para los lectores"
                : "Borrador · solo tú puedes verlo"}
            </span>
          </p>
        </header>

        <form
          className="story-editor-form"
          onSubmit={handleSubmit}
        >

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">
                ✦
              </span>

              <div>
                <h2>Información del capítulo</h2>

                <p>
                  Ajusta el número y el título de este capítulo.
                </p>
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="chapterNumber">
                  Número del capítulo
                </label>
              </div>

              <input
                id="chapterNumber"
                type="number"
                min="1"
                value={chapterNumber}
                onChange={(event) =>
                  setChapterNumber(event.target.value)
                }
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="chapterTitle">
                  Título del capítulo
                </label>

                <span className="form-counter">
                  {title.length}/255
                </span>
              </div>

              <input
                id="chapterTitle"
                type="text"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                maxLength={255}
              />
            </div>
          </section>

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">
                ✎
              </span>

              <div>
                <h2>Contenido</h2>

                <p>
                  Aquí puedes continuar o corregir tu capítulo.
                </p>
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="chapterContent">
                  Texto del capítulo
                </label>
              </div>

              <textarea
                id="chapterContent"
                value={content}
                onChange={(event) =>
                  setContent(event.target.value)
                }
                rows={20}
                placeholder="Comienza a escribir tu capítulo..."
              />
            </div>
          </section>

          {error && (
            <div className="form-error">
              <span>!</span>
              <p>{error}</p>
            </div>
          )}

          <div className="story-editor-actions">
            <Link
              to={`/stories/${storyId}`}
              className="story-editor-cancel"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className="story-editor-submit"
              disabled={saving || publishing}
            >
              {saving
                ? "Guardando cambios..."
                : "Guardar cambios"}
            </button>

            {status === "draft" && (
              <button
                type="button"
                className="story-editor-submit"
                onClick={handlePublish}
                disabled={saving || publishing}
              >
                {publishing
                  ? "Publicando..."
                  : "Publicar capítulo"}
              </button>
            )}
          </div>

        </form>
      </div>
    </main>
  );
}
