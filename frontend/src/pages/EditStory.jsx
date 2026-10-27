import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useToast } from "../hooks/useToast";
import ContentWarningFields from "../components/story/ContentWarningFields";
import TagEditor from "../components/story/TagEditor";
import ChapterTextEditor from "../components/story/ChapterTextEditor";
import ModerationDialog from "../components/moderation/ModerationDialog";
import WritingScheduleFields from "../components/story/WritingScheduleFields";
import { DEFAULT_SCHEDULE_HOUR, browserTimeZone } from "../utils/writingSchedule";
import { genreOptions } from "../utils/genres";

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
  const [showPausedNotice, setShowPausedNotice] = useState(false);
  const [schedule, setSchedule] = useState({
    days: [],
    hour: DEFAULT_SCHEDULE_HOUR,
    showPublicly: true,
  });
  const [hadSchedule, setHadSchedule] = useState(false);

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

        // Si el calendario no carga, el resto del formulario funciona igual.
        try {
          const scheduleResponse = await api.get(`/stories/${storyId}/schedule`);
          const saved = scheduleResponse.data.schedule;
          if (saved) {
            setSchedule({
              days: saved.days || [],
              hour: saved.hour ?? DEFAULT_SCHEDULE_HOUR,
              showPublicly: saved.show_publicly ?? true,
            });
            setHadSchedule(true);
          }
        } catch (scheduleError) {
          console.error("Error al cargar los días de escritura:", scheduleError);
        }
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

      // Sin días elegidos no se guarda nada, salvo que haya que borrar un
      // calendario anterior.
      if (schedule.days.length > 0 || hadSchedule) {
        await api.put(`/stories/${storyId}/schedule`, {
          days: schedule.days,
          hour: schedule.hour,
          timezone: browserTimeZone(),
          show_publicly: schedule.showPublicly,
        });
      }

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
      <main className="story-editor-page">
        <div className="story-editor-container">
          <p className="loading-text">Cargando historia...</p>
        </div>
      </main>
    );
  }

  return (
      <main className="story-editor-page">
  <div className="story-editor-container">

    <Link to={`/stories/${storyId}`} className="story-editor-back">
      ← Volver a la historia
    </Link>

    <header className="story-editor-header">
      <p className="chapters-eyebrow">
        EDITAR HISTORIA
      </p>

      <h1>Editar historia</h1>

      <p>
        Modifica los datos de tu historia y guarda los
        cambios.
      </p>
    </header>

    <form
      className="story-editor-form"
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
        <div className="form-label-row">
          <label htmlFor="description">
            Descripción
          </label>

          <span className="form-counter">
            {description.length}/1000
          </span>
        </div>

        <ChapterTextEditor
          id="description"
          ariaLabel="Descripción"
          value={description}
          onChange={setDescription}
          rows={5}
          maxLength={1000}
          help={false}
        />
      </div>

      <div className="form-group">
        <label htmlFor="genre">
          Género
        </label>

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

      {/* ORIGEN DE LA OBRA */}
      <div className="form-group">
        <label htmlFor="workType">
          Tipo de obra
        </label>

        <select
          id="workType"
          className="form-select"
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
          className="form-select"
          value={status}
          onChange={(event) => {
            // Al pausarla se avisa que dejan de llegar los recordatorios.
            if (event.target.value === "paused" && status !== "paused") {
              setShowPausedNotice(true);
            }
            setStatus(event.target.value);
          }}
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

      <WritingScheduleFields schedule={schedule} onChange={setSchedule} />

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
        <div className="form-error" role="alert">
          <span>!</span>
          <p>{error}</p>
        </div>
      )}

      <div className="story-editor-actions">
        <Link to={`/stories/${storyId}`} className="story-editor-cancel">
          Cancelar
        </Link>

        <button
          type="submit"
          className="story-editor-submit"
          disabled={saving}
        >
          {saving
            ? "Guardando cambios..."
            : "Guardar cambios"}
        </button>
      </div>

    </form>
  </div>

  {showPausedNotice && (
    <ModerationDialog
      title="Historia en pausa"
      onClose={() => setShowPausedNotice(false)}
    >
      <div className="moderation-form">
        <p>
          Mientras esta historia esté pausada, no te llegarán más
          notificaciones de recordatorio para publicar capítulos.
        </p>
        <p className="moderation-hint">
          Cuando quieras retomarla, vuelve a marcarla como Publicada.
          Recuerda guardar los cambios.
        </p>
        <div className="moderation-form-actions">
          <button
            type="button"
            className="moderation-button is-primary"
            onClick={() => setShowPausedNotice(false)}
          >
            Entendido
          </button>
        </div>
      </div>
    </ModerationDialog>
  )}
</main>
  );
}
