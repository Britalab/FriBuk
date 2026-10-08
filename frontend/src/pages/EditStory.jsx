import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useToast } from "../hooks/useToast";
import ContentWarningFields from "../components/story/ContentWarningFields";
import TagEditor from "../components/story/TagEditor";

export default function EditStory() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [genre, setGenre] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("draft");
  const [workType, setWorkType] = useState("original");
  const [originalWork, setOriginalWork] = useState("");
  const [originalAuthor, setOriginalAuthor] = useState("");
  const [sensitiveContent, setSensitiveContent] = useState(false);
  const [contentWarnings, setContentWarnings] = useState([]);
  const [tags, setTags] = useState([]);

  useEffect(() => {
    if (!coverPreview.startsWith("blob:")) return undefined;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  useEffect(() => {
    const loadStory = async () => {
      try {
        const response = await api.get(`/stories/${storyId}`);

        const story = response.data;

        setTitle(story.title || "");
        setDescription(story.description || "");
        setCoverUrl(story.cover_url || "");
        setGenre(story.genre || "");
        setStatus(story.status || "draft");
        setWorkType(story.work_type || "original");
        setOriginalWork(story.original_work || "");
        setOriginalAuthor(story.original_author || "");
        setSensitiveContent(Boolean(story.sensitive_content));
        setContentWarnings(story.content_warnings || []);
        setTags(Array.isArray(story.tags) ? story.tags : []);
      } catch (err) {
        console.error("Error al cargar la historia:", err);

        setError(
          err.response?.data?.detail ||
            "No se pudo cargar la historia."
        );
      } finally {
        setLoading(false);
      }
    };

    loadStory();
  }, [storyId]);

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
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
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }

    setSaving(true);

    try {
      let finalCoverUrl = coverUrl.trim() || null;

      if (coverFile) {
        const formData = new FormData();
        formData.append("file", coverFile);

        const uploadResponse = await api.post("/upload-cover", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        finalCoverUrl = uploadResponse.data.url;
      }

      await api.put(`/stories/${storyId}`, {
      title: title.trim(),
      description: description.trim() || null,
      cover_url: finalCoverUrl,
      genre: genre.trim() || null,
      status,
      work_type: workType,
      original_work: originalWork.trim() || null,
      original_author: originalAuthor.trim() || null,
      sensitive_content: sensitiveContent,
      content_warnings: sensitiveContent ? contentWarnings : [],
      tags,
    });

      showToast(status === "published"
        ? "Historia publicada correctamente."
        : "Historia actualizada correctamente.");
      navigate(`/stories/${storyId}`);
    } catch (err) {
      console.error("Error al actualizar la historia:", err);

      showToast(err.response?.data?.detail || "No se pudo guardar el cambio. Intenta nuevamente.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="create-story-page">
        <div className="create-story-container">
          <p>Cargando historia...</p>
        </div>
      </main>
    );
  }

  return (
      <main className="create-story-page">
  <div className="create-story-container">

    <div className="create-story-header">
      <button
        type="button"
        className="back-button"
        onClick={() => navigate(-1)}
      >
        ← Volver
      </button>

      <p className="chapters-eyebrow">
        EDITAR HISTORIA
      </p>

      <h1>Editar historia</h1>

      <p>
        Modifica los datos de tu historia y guarda los
        cambios.
      </p>
    </div>

    <form
      className="create-story-form"
      onSubmit={handleSubmit}
    >

      <div className="form-group">
        <label htmlFor="title">
          Título
        </label>

        <input
          id="title"
          type="text"
          value={title}
          onChange={(event) =>
            setTitle(event.target.value)
          }
          maxLength={150}
        />
      </div>

      <div className="form-group">
        <label htmlFor="description">
          Descripción
        </label>

        <textarea
          id="description"
          value={description}
          onChange={(event) =>
            setDescription(event.target.value)
          }
          rows={5}
          maxLength={1000}
        />
      </div>

      <div className="form-group">
        <label htmlFor="genre">
          Género
        </label>

        <input
          id="genre"
          type="text"
          value={genre}
          onChange={(event) =>
            setGenre(event.target.value)
          }
          maxLength={50}
        />
      </div>

      <TagEditor tags={tags} onChange={setTags} />

      {/* ORIGEN DE LA OBRA */}
      <div className="form-group">
        <label htmlFor="workType">
          Tipo de obra
        </label>

        <select
          id="workType"
          value={workType}
          onChange={(event) => {
            const newType = event.target.value;

            setWorkType(newType);

            if (newType === "original") {
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

        <p className="form-help">
          Indica si tu historia es original o está basada en otra obra.
        </p>
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

          <p className="form-help">
            <strong>Importante:</strong> Al publicar esta obra declaras
            que cuentas con los derechos, permisos o condiciones necesarias
            para compartir este contenido.
          </p>
        </>
      )}

      <ContentWarningFields
        sensitive={sensitiveContent}
        warnings={contentWarnings}
        onSensitiveChange={setSensitiveContent}
        onWarningsChange={setContentWarnings}
      />

      <div className="form-group">
        <label htmlFor="status">
          Estado de la historia
        </label>

        <select
          id="status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value)
          }
        >
          <option value="draft">
            Borrador
          </option>

          <option value="published">
            Publicada
          </option>

          <option value="paused">
            Pausada
          </option>

          <option value="completed">
            Terminada
          </option>
        </select>

        <p className="form-help">
          Marca la historia como terminada cuando hayas finalizado todos sus capítulos.
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="coverUrl">
          URL de portada
        </label>

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
          Puedes agregar una imagen mediante su URL.
        </p>

        <label htmlFor="coverFile">
          O sube una imagen desde tu dispositivo
        </label>
        <input
          id="coverFile"
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={handleCoverChange}
        />
        <p className="form-help">
          JPG, JPEG o PNG. Máximo 5 MB. La imagen subida reemplazará la URL al guardar.
        </p>

        {(coverPreview || coverUrl) && (
          <div className="cover-preview">
            <img
              src={coverPreview || coverUrl}
              alt="Vista previa de la portada"
            />
          </div>
        )}
      </div>

      {error && (
        <p className="form-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="create-story-button"
        disabled={saving}
      >
        {saving
          ? "Guardando cambios..."
          : "Guardar cambios"}
      </button>

    </form>
  </div>
</main>
  );
}
