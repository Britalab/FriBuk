import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useToast } from "../hooks/useToast";

export default function CreateChapter() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [chapterNumber, setChapterNumber] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Acción en curso: null, "draft" (guardar borrador) o "published" (publicar).
  const [savingAs, setSavingAs] = useState(null);
  const loading = savingAs !== null;
  const [error, setError] = useState("");

  const validateChapter = () => {
    setError("");

    if (!chapterNumber || Number(chapterNumber) < 1) {
      setError("El número del capítulo debe ser mayor que 0.");
      return false;
    }

    if (!title.trim()) {
      setError("El título del capítulo es obligatorio.");
      return false;
    }

    if (!content.trim()) {
      setError("El contenido del capítulo es obligatorio.");
      return false;
    }

    return true;
  };

  // Crea el capítulo con el estado elegido por el autor.
  const createChapter = async (status) => {
    setSavingAs(status);

    try {
      await api.post("/chapters", {
        story_id: storyId,
        chapter_number: Number(chapterNumber),
        title: title.trim(),
        content: content.trim(),
        status,
      });

      showToast(
        status === "published"
          ? "Capítulo publicado correctamente. Ya es visible para los lectores."
          : "Borrador del capítulo guardado correctamente."
      );
      navigate(`/stories/${storyId}`);
    } catch (err) {
      console.error("Error al crear el capítulo:", err);

      showToast(
        err.response?.data?.detail ||
          (status === "published"
            ? "No se pudo publicar el capítulo. Intenta nuevamente."
            : "No se pudo guardar el capítulo. Intenta nuevamente."),
        "error"
      );
    } finally {
      setSavingAs(null);
    }
  };

  // Guardar borrador: el comportamiento de siempre.
  const handleSubmit = (event) => {
    event.preventDefault();

    if (loading || !validateChapter()) return;

    createChapter("draft");
  };

  // Publicar: acción explícita y con confirmación, porque no se puede deshacer.
  const handlePublish = () => {
    if (loading || !validateChapter()) return;

    const confirmed = window.confirm(
      "¿Publicar este capítulo? Será visible para los lectores y no podrá volver a borrador."
    );

    if (!confirmed) return;

    createChapter("published");
  };

  return (
    <main className="story-editor-page">
      <div className="story-editor-container">

        <button
          type="button"
          className="story-editor-back"
          onClick={() => navigate(`/stories/${storyId}`)}
        >
          ← Volver a la historia
        </button>

        <header className="story-editor-header">
          <p className="chapters-eyebrow">
            NUEVO CAPÍTULO
          </p>

          <h1>Escribe tu capítulo</h1>

          <p>
            Continúa construyendo tu historia y dale vida a sus
            personajes.
          </p>
        </header>

        <form
          className="story-editor-form"
          onSubmit={handleSubmit}
        >

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">✦</span>

              <div>
                <h2>Información del capítulo</h2>

                <p>
                  Define el número y el título de este capítulo.
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
                placeholder="Ej: 1"
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
                placeholder="Ej: Donde todo comenzó"
                maxLength={255}
              />
            </div>
          </section>

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">✎</span>

              <div>
                <h2>Contenido</h2>

                <p>
                  Escribe aquí el contenido de tu capítulo.
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
                placeholder="Comienza a escribir tu capítulo..."
                rows={20}
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
            <button
              type="button"
              className="story-editor-cancel"
              onClick={() => navigate(`/stories/${storyId}`)}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="story-editor-submit"
              disabled={loading}
            >
              {savingAs === "draft"
                ? "Guardando borrador..."
                : "Guardar borrador"}
            </button>

            <button
              type="button"
              className="story-editor-submit"
              onClick={handlePublish}
              disabled={loading}
            >
              {savingAs === "published"
                ? "Publicando..."
                : "Publicar capítulo"}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}
