import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useToast } from "../hooks/useToast";
import ContentWarningFields from "../components/story/ContentWarningFields";
import TagEditor from "../components/story/TagEditor";
import { genreOptions } from "../utils/genres";

export default function CreateStory() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [genre, setGenre] = useState("");
  const [tags, setTags] = useState([]);
  const [workType, setWorkType] = useState("original");
  const [originalWork, setOriginalWork] = useState("");
  const [originalAuthor, setOriginalAuthor] = useState("");
  const [sensitiveContent, setSensitiveContent] = useState(false);
  const [contentWarnings, setContentWarnings] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("La portada debe ser JPG, JPEG o PNG.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("La portada no puede superar los 5 MB.");
      event.target.value = "";
      return;
    }

    setError("");
    setCoverFile(file);
    setCoverUrl("");

    const previewUrl = URL.createObjectURL(file);
    setCoverPreview(previewUrl);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    setLoading(true);

    try {
      let finalCoverUrl = coverUrl.trim() || null;

      if (coverFile) {
        const formData = new FormData();

        formData.append("file", coverFile);

        const uploadResponse = await api.post(
          "/upload-cover",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );

        finalCoverUrl = uploadResponse.data.url;
      }

      const response = await api.post("/stories", {
        title: title.trim(),
        description: description.trim() || null,
        cover_url: finalCoverUrl,
        genre: genre.trim() || null,
        tags,
        status: "draft",
        work_type: workType,
        original_work: originalWork.trim() || null,
        original_author: originalAuthor.trim() || null,
        sensitive_content: sensitiveContent,
        content_warnings: sensitiveContent ? contentWarnings : [],
      });

      const createdStory = response.data.story;

      showToast("Borrador de historia guardado correctamente.");
      navigate(`/stories/${createdStory.id}`);
    } catch (err) {
      console.error("Error al crear la historia:", err);

      showToast(err.response?.data?.detail || "No se pudo guardar la historia. Intenta nuevamente.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="story-editor-page">
      <div className="story-editor-container">

        <Link to="/" className="story-editor-back">
          ← Volver a explorar
        </Link>

        <header className="story-editor-header">
          <p className="chapters-eyebrow">
            NUEVA HISTORIA
          </p>

          <h1>Crear una historia</h1>

          <p>
            Dale un nombre a tu historia, cuéntanos de qué trata
            y prepárala para comenzar a escribir.
          </p>
        </header>

        <form
          className="story-editor-form"
          onSubmit={handleSubmit}
        >
            <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">©</span>

              <div>
                <h2>Origen de la obra</h2>
                <p>
                  Indica si tu historia es original o está basada en otra obra.
                </p>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="workType">
                Tipo de obra
              </label>

              <select
                id="workType"
                className="form-select"
                value={workType}
                onChange={(event) => {
                  setWorkType(event.target.value);

                  if (event.target.value === "original") {
                    setOriginalWork("");
                    setOriginalAuthor("");
                  }
                }}
              >
                <option value="original">
                  Obra original
                </option>

                <option value="fanfic">
                  Fanfic
                </option>

                <option value="adaptation">
                  Adaptación
                </option>

                <option value="translation">
                  Traducción
                </option>

                <option value="public_domain">
                  Obra de dominio público
                </option>

                <option value="other">
                  Otro
                </option>
              </select>
            </div>

            {workType !== "original" && (
              <>
                <div className="form-group">
                  <label htmlFor="originalWork">
                    Obra original
                  </label>

                  <input
                    id="originalWork"
                    type="text"
                    value={originalWork}
                    onChange={(event) =>
                      setOriginalWork(event.target.value)
                    }
                    placeholder="Ej: Harry Potter, Pokémon..."
                    maxLength={150}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="originalAuthor">
                    Autor o creador original
                  </label>

                  <input
                    id="originalAuthor"
                    type="text"
                    value={originalAuthor}
                    onChange={(event) =>
                      setOriginalAuthor(event.target.value)
                    }
                    placeholder="Nombre del autor o creador"
                    maxLength={150}
                  />
                </div>

                <div className="form-help">
                  <strong>Importante:</strong> Al publicar esta obra declaras
                  que cuentas con los derechos, permisos o condiciones necesarias
                  para compartir este contenido.
                </div>
              </>
            )}
          </section>
          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">✦</span>

              <div>
                <h2>Información principal</h2>
                <p>
                  Estos datos ayudarán a los lectores a descubrir
                  tu historia.
                </p>
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="title">
                  Título
                </label>

                <span className="form-counter">
                  {title.length}/150
                </span>
              </div>

              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Ej: Donde termina el invierno"
                maxLength={150}
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="description">
                  Descripción
                </label>

                <span className="form-counter">
                  {description.length}/1000
                </span>
              </div>

              <textarea
                id="description"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="Cuéntales a los lectores de qué trata tu historia..."
                rows={6}
                maxLength={1000}
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="genre">
                  Género
                </label>

                <span className="form-optional">
                  Opcional
                </span>
              </div>

              <select
                id="genre"
                className="form-select"
                value={genre}
                onChange={(event) =>
                  setGenre(event.target.value)
                }
              >
                <option value="">Sin género</option>
                {genreOptions(genre).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <TagEditor tags={tags} onChange={setTags} />
          </section>

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">◐</span>

              <div>
                <h2>Contenido sensible</h2>
                <p>
                  Avisa a tus lectores si la historia trata temas delicados.
                </p>
              </div>
            </div>

            <ContentWarningFields
              sensitive={sensitiveContent}
              warnings={contentWarnings}
              onSensitiveChange={setSensitiveContent}
              onWarningsChange={setContentWarnings}
            />
          </section>

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">▣</span>

              <div>
                <h2>Portada</h2>
                <p>
                  Agrega una imagen para darle identidad visual
                  a tu historia.
                </p>
              </div>
            </div>

            <div className="form-group">

              <div className="form-label-row">
                <label htmlFor="coverFile">
                  Subir portada
                </label>

                <span className="form-optional">
                  Opcional
                </span>
              </div>

              <input
                id="coverFile"
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={handleCoverChange}
              />

              <p className="form-help">
                JPG, JPEG o PNG. Máximo 5 MB.
              </p>

              {coverPreview && (
                <div className="cover-preview">
                  <img
                    src={coverPreview}
                    alt="Vista previa de la portada"
                  />
                </div>
              )}

              <div className="form-label-row cover-url-label">
                <label htmlFor="coverUrl">
                  O utiliza una URL
                </label>

                <span className="form-optional">
                  Alternativa
                </span>
              </div>

              <input
                id="coverUrl"
                type="url"
                value={coverUrl}
                onChange={(event) => {
                  setCoverUrl(event.target.value);
                  setCoverFile(null);
                  setCoverPreview("");
                }}
                placeholder="https://..."
              />

              <p className="form-help">
                Puedes utilizar la URL pública de una imagen.
              </p>

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
              to="/"
              className="story-editor-cancel"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              className="story-editor-submit"
              disabled={loading}
            >
              {loading
                ? "Creando historia..."
                : "Crear historia"}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}

