import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import ChapterTextEditor from "../components/story/ChapterTextEditor";
import ModerationDialog from "../components/moderation/ModerationDialog";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import { usePageTitle } from "../hooks/usePageTitle";
import { TIP_DESCRIPTION_RECOMMENDED, TIP_POSES, slugify, tipImage } from "../data/consejos";
import NotFound from "./NotFound";
import "../styles/writing-tips.css";

// Los mismos límites que backend/tips.py.
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 200;
const SUMMARY_MAX = 700;
const HEADING_MAX = 150;

let nextSectionKey = 0;
const withKey = (section) => ({ key: `seccion-${(nextSectionKey += 1)}`, ...section });

const EMPTY_TIP = {
  slug: "",
  title: "",
  description: "",
  summary: "",
  pose: "retrato",
  position: 0,
  sections: [],
  status: "draft",
};

function errorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

// Crear y editar consejos de tía FriBuk: /consejos/nuevo y
// /consejos/editar/:slug. Solo para la cuenta admin (el backend lo exige).
export default function WritingTipEditor() {
  const { slug: editingSlug } = useParams();
  const isNew = !editingSlug;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  usePageTitle(isNew ? "Nuevo consejo" : "Editar consejo");

  const [status, setStatus] = useState(isNew ? "ready" : "loading");
  const [tipId, setTipId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_TIP, sections: [withKey({ heading: "", text: "" })] });
  const [savedSlug, setSavedSlug] = useState(editingSlug || null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // En un consejo nuevo, la dirección sigue al título hasta que se edita.
  const slugTouched = useRef(!isNew);

  useEffect(() => {
    if (isNew || !user?.is_admin) return undefined;
    let cancelled = false;

    api
      .get(`/tips/${encodeURIComponent(editingSlug)}`)
      .then((response) => {
        if (cancelled) return;
        const tip = response.data.tip;
        setTipId(tip.id);
        setSavedSlug(tip.slug);
        setForm({
          ...EMPTY_TIP,
          ...tip,
          description: tip.description || "",
          summary: tip.summary || "",
          sections: (tip.sections?.length ? tip.sections : [{ heading: "", text: "" }]).map(withKey),
        });
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error.response?.status === 404 ? "missing" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [editingSlug, isNew, user?.is_admin]);

  const update = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "title" && !slugTouched.current) next.slug = slugify(value);
      return next;
    });
  };

  const updateSection = useCallback((key, field, value) => {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) => (
        section.key === key ? { ...section, [field]: value } : section
      )),
    }));
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (!saving) setConfirmingDelete(false);
  }, [saving]);

  const moveSection = (index, offset) => {
    setForm((current) => {
      const sections = [...current.sections];
      const target = index + offset;
      if (target < 0 || target >= sections.length) return current;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, sections };
    });
  };

  const removeSection = (key) => {
    setForm((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.key !== key),
    }));
  };

  const addSection = () => {
    setForm((current) => ({
      ...current,
      sections: [...current.sections, withKey({ heading: "", text: "" })],
    }));
  };

  const save = async (nextStatus) => {
    if (saving) return;
    setSaving(true);

    const body = {
      slug: form.slug,
      title: form.title,
      description: form.description,
      summary: form.summary,
      pose: form.pose,
      position: Number(form.position) || 0,
      sections: form.sections.map(({ heading, text }) => ({ heading, text })),
      status: nextStatus,
    };

    try {
      const response = tipId
        ? await api.put(`/tips/${tipId}`, body)
        : await api.post("/tips", body);
      const tip = response.data.tip;

      setTipId(tip.id);
      setSavedSlug(tip.slug);
      setForm((current) => ({ ...current, status: tip.status, slug: tip.slug }));
      slugTouched.current = true;
      showToast(
        nextStatus === "published"
          ? "Consejo publicado. Ya lo puede leer todo el mundo."
          : "Borrador guardado. Solo tú lo puedes ver."
      );

      // La dirección del editor sigue a la del consejo.
      if (tip.slug !== editingSlug) {
        navigate(`/consejos/editar/${tip.slug}`, { replace: true });
      }
    } catch (error) {
      console.error("Error al guardar el consejo:", error);
      showToast(errorMessage(error, "No se pudo guardar el consejo. Intenta nuevamente."), "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteTip = async () => {
    setSaving(true);
    try {
      await api.delete(`/tips/${tipId}`);
      showToast("Consejo eliminado.");
      navigate("/consejos");
    } catch (error) {
      console.error("Error al eliminar el consejo:", error);
      showToast(errorMessage(error, "No se pudo eliminar el consejo."), "error");
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  if (!user?.is_admin || status === "missing") return <NotFound />;

  if (status !== "ready") {
    return (
      <main className="story-editor-page">
        <p className="writing-tips-state" role={status === "error" ? "alert" : undefined}>
          {status === "error" ? "No pudimos cargar el consejo." : "Cargando consejo..."}
        </p>
      </main>
    );
  }

  const published = form.status === "published";

  return (
    <main className="story-editor-page">
      <div className="story-editor-container">
        <Link to={savedSlug ? `/consejos/${savedSlug}` : "/consejos"} className="story-editor-back">
          ← {savedSlug ? "Ver el consejo" : "Volver a los consejos"}
        </Link>

        <header className="story-editor-header">
          <p className="chapters-eyebrow">
            CONSEJOS DE TÍA FRIBUK · {published ? "PUBLICADO" : "BORRADOR"}
          </p>
          <h1>{isNew ? "Nuevo consejo" : "Editar consejo"}</h1>
          <p>
            Los borradores solo los ves tú. Al publicar, el consejo aparece en
            /consejos y lo pueden encontrar Google y las IAs.
          </p>
        </header>

        <form className="story-editor-form" onSubmit={(event) => event.preventDefault()}>
          <section className="story-form-section">
            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="tipTitle">Título (en forma de pregunta)</label>
                <span className="form-counter">{form.title.length}/{TITLE_MAX}</span>
              </div>
              <input
                id="tipTitle"
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="¿Cómo crear un personaje memorable?"
                maxLength={TITLE_MAX}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tipSlug">Dirección</label>
              <div className="writing-tip-slug-field">
                <span>fribuk.com/consejos/</span>
                <input
                  id="tipSlug"
                  value={form.slug}
                  onChange={(event) => {
                    slugTouched.current = true;
                    update("slug", slugify(event.target.value));
                  }}
                  placeholder="como-crear-un-personaje-memorable"
                />
              </div>
              {published && savedSlug && form.slug !== savedSlug && (
                <p className="form-help writing-tip-warning">
                  Ojo: este consejo ya está publicado. Si cambias la dirección,
                  los enlaces que ya se compartieron dejarán de funcionar.
                </p>
              )}
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="tipDescription">Descripción para Google</label>
                <span
                  className={`form-counter${form.description.length > TIP_DESCRIPTION_RECOMMENDED ? " is-over" : ""}`}
                >
                  {form.description.length}/{TIP_DESCRIPTION_RECOMMENDED}
                </span>
              </div>
              <textarea
                id="tipDescription"
                rows={2}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="Una o dos frases con lo que la gente busca. Es lo que aparece en Google y al compartir el enlace."
                maxLength={DESCRIPTION_MAX}
              />
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="tipSummary">Resumen para la tarjeta</label>
                <span className="form-counter">{form.summary.length}/{SUMMARY_MAX}</span>
              </div>
              <textarea
                id="tipSummary"
                rows={4}
                value={form.summary}
                onChange={(event) => update("summary", event.target.value)}
                placeholder="El texto corto que aparece en la lista de consejos."
                maxLength={SUMMARY_MAX}
              />
            </div>

            <div className="form-group">
              <span className="form-label-text">Pose de tía FriBuk</span>
              <div className="writing-tip-poses" role="radiogroup" aria-label="Pose de tía FriBuk">
                {TIP_POSES.map((pose) => (
                  <button
                    type="button"
                    key={pose.id}
                    role="radio"
                    aria-checked={form.pose === pose.id}
                    className={`writing-tip-pose${form.pose === pose.id ? " is-selected" : ""}`}
                    onClick={() => update("pose", pose.id)}
                  >
                    <span className="tia-fribuk is-figure">
                      <img src={tipImage(pose.id)} alt="" />
                    </span>
                    {pose.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group writing-tip-position">
              <label htmlFor="tipPosition">Orden en la lista</label>
              <input
                id="tipPosition"
                type="number"
                min={0}
                max={999}
                value={form.position}
                onChange={(event) => update("position", event.target.value)}
              />
              <p className="form-help">También es el número que se muestra: 1 se ve como «01».</p>
            </div>
          </section>

          <section className="story-form-section">
            <div className="story-form-section-heading">
              <span className="story-form-icon">✍</span>
              <div>
                <h2>Contenido</h2>
                <p>
                  Una sección por subtítulo. Deja el subtítulo vacío en la
                  primera para la introducción. Termina con «En resumen».
                </p>
              </div>
            </div>

            {form.sections.map((section, index) => (
              <TipSectionFields
                key={section.key}
                section={section}
                index={index}
                isLast={index === form.sections.length - 1}
                onChange={updateSection}
                onMove={moveSection}
                onRemove={removeSection}
              />
            ))}

            <button type="button" className="writing-tip-add-section" onClick={addSection}>
              ＋ Agregar sección
            </button>
          </section>

          <div className="story-editor-actions">
            {tipId && (
              <button
                type="button"
                className="story-editor-cancel writing-tip-delete"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Eliminar
              </button>
            )}

            {published ? (
              <>
                <button
                  type="button"
                  className="story-editor-cancel"
                  onClick={() => save("draft")}
                  disabled={saving}
                >
                  Pasar a borrador
                </button>
                <button
                  type="button"
                  className="story-editor-submit"
                  onClick={() => save("published")}
                  disabled={saving}
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="story-editor-cancel"
                  onClick={() => save("draft")}
                  disabled={saving}
                >
                  {saving ? "Guardando..." : "Guardar borrador"}
                </button>
                <button
                  type="button"
                  className="story-editor-submit"
                  onClick={() => save("published")}
                  disabled={saving}
                >
                  Publicar
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      {confirmingDelete && (
        <ModerationDialog title="¿Eliminar este consejo?" onClose={closeDeleteDialog}>
          <div className="moderation-form">
            <p className="chapter-delete-text">
              Vas a eliminar <strong>«{form.title}»</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="moderation-form-actions">
              <button
                type="button"
                className="moderation-button"
                onClick={closeDeleteDialog}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="moderation-button is-danger"
                onClick={deleteTip}
                disabled={saving}
              >
                {saving ? "Eliminando..." : "Eliminar consejo"}
              </button>
            </div>
          </div>
        </ModerationDialog>
      )}
    </main>
  );
}

// Una sección del consejo: subtítulo y texto, con botones para moverla o
// quitarla. El texto se pasa al editor con una función estable.
function TipSectionFields({ section, index, isLast, onChange, onMove, onRemove }) {
  const handleText = useCallback((text) => onChange(section.key, "text", text), [onChange, section.key]);

  return (
    <div className="writing-tip-section-editor">
      <div className="writing-tip-section-bar">
        <strong>Sección {index + 1}</strong>
        <div>
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label={`Subir la sección ${index + 1}`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={isLast}
            aria-label={`Bajar la sección ${index + 1}`}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => onRemove(section.key)}
            aria-label={`Quitar la sección ${index + 1}`}
          >
            Quitar
          </button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={`heading-${section.key}`}>Subtítulo</label>
        <input
          id={`heading-${section.key}`}
          value={section.heading}
          onChange={(event) => onChange(section.key, "heading", event.target.value)}
          placeholder={index === 0 ? "(vacío para la introducción)" : "¿Qué quiere tu personaje?"}
          maxLength={HEADING_MAX}
        />
      </div>

      <ChapterTextEditor
        id={`text-${section.key}`}
        ariaLabel={`Texto de la sección ${index + 1}`}
        value={section.text}
        onChange={handleText}
        placeholder="Escribe aquí..."
        rows={6}
        help={false}
      />
    </div>
  );
}
