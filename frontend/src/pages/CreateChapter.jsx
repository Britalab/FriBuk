import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useToast } from "../hooks/useToast";

export default function CreateChapter() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Posición que tendrá el capítulo: se asigna sola, a continuación del
  // último. Solo se consulta para mostrársela a quien escribe.
  const [chapterPosition, setChapterPosition] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Acción en curso: null, "draft" (guardar borrador) o "published" (publicar).
  const [savingAs, setSavingAs] = useState(null);
  const loading = savingAs !== null;
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    api
      .get(`/stories/${storyId}/chapters`)
      .then((response) => {
        if (isActive && Array.isArray(response.data)) {
          setChapterPosition(response.data.length + 1);
        }
      })
      .catch((err) => {
        console.error("Error al consultar los capítulos:", err);
      });

    return () => {
      isActive = false;
    };
  }, [storyId]);

  const validateChapter = () => {
    setError("");

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

        <Link to={`/stories/${storyId}`} className="story-editor-back">
          ← Volver a la historia
        </Link>

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
                  Ponle un título a este capítulo.
                </p>
              </div>
            </div>

            <p className="form-help chapter-position-note">
              {chapterPosition
                ? `Será el capítulo ${chapterPosition} de tu historia. El número se asigna solo.`
                : "El número del capítulo se asigna solo, a continuación del último."}
            </p>

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
