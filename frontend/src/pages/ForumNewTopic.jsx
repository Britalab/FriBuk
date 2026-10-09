import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";

export default function ForumNewTopic() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topicImage, setTopicImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const topicImageInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      setError("Debes completar el título y el contenido.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("content", content.trim());
      if (topicImage) {
        formData.append("image", topicImage);
      }

      await api.post("/forum/topics", formData);

      setTopicImage(null);
      if (topicImageInputRef.current) {
        topicImageInputRef.current.value = "";
      }
      navigate("/forum");
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "No se pudo publicar el tema. Inténtalo nuevamente."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="forum-new-topic-page">
      <Link to="/forum" className="forum-back">
        ← Volver al foro
      </Link>

      <section className="forum-new-topic-card">
        <div className="forum-new-topic-header">
          <span className="forum-post-label">COMUNIDAD</span>

          <h1>Nuevo tema</h1>

          <p>
            Comparte una pregunta, recomendación, idea o conversación
            con la comunidad de FriBuk.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="forum-new-topic-form">
          <div className="forum-form-group">
            <label htmlFor="topic-title">Título</label>

            <input
              id="topic-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Escribe el título de tu tema..."
              maxLength={120}
            />

            <span className="forum-character-count">
              {title.length}/120
            </span>
          </div>

          <div className="forum-form-group">
            <label htmlFor="topic-content">Contenido</label>

            <textarea
              id="topic-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe aquí lo que quieres compartir con la comunidad..."
              rows="10"
            />
          </div>

          <div className="forum-form-group">
            <label htmlFor="topic-image">Imagen (opcional)</label>
            <input
              ref={topicImageInputRef}
              id="topic-image"
              className="forum-image-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setTopicImage(e.target.files?.[0] || null)}
            />
            {topicImage && (
              <span className="forum-selected-file">
                <span>{topicImage.name}</span>
                <button
                  type="button"
                  className="forum-selected-file-remove"
                  onClick={() => {
                    setTopicImage(null);
                    // Vacía también el selector, para poder elegir la misma imagen otra vez.
                    if (topicImageInputRef.current) topicImageInputRef.current.value = "";
                  }}
                  aria-label="Quitar la imagen elegida"
                  title="Quitar imagen"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            )}
          </div>

          {error && (
            <div className="forum-form-error">
              {error}
            </div>
          )}

          <div className="forum-new-topic-actions">
            <Link to="/forum" className="forum-cancel-button">
              Cancelar
            </Link>

            <button
              type="submit"
              className="forum-submit"
              disabled={loading}
            >
              {loading ? "Publicando..." : "Publicar tema"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
