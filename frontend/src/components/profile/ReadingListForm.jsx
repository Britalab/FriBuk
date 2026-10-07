import { useState } from "react";
import "../../styles/reading-lists.css";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

// Formulario para crear o editar una lista. `onSubmit` recibe los datos y
// debe lanzar el error de la petición si no se pudo guardar.
export default function ReadingListForm({ initialList, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initialList?.name || "");
  const [description, setDescription] = useState(initialList?.description || "");
  const [isPublic, setIsPublic] = useState(Boolean(initialList?.is_public));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    if (!name.trim()) {
      setError("La lista necesita un nombre.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSubmit({ name, description, is_public: isPublic });
    } catch (requestError) {
      console.error("Error al guardar la lista:", requestError);
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "No pudimos guardar la lista. Inténtalo nuevamente."
      );
      setSaving(false);
    }
  };

  return (
    <form className="reading-list-form" onSubmit={handleSubmit}>
      <label className="reading-list-field">
        <span>Nombre</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          placeholder="Por ejemplo: Fantasía para el invierno"
          disabled={saving}
          autoFocus
        />
      </label>

      <label className="reading-list-field">
        <span>
          Descripción <em>(opcional)</em>
          <small>{description.length}/{DESCRIPTION_MAX}</small>
        </span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          disabled={saving}
        />
      </label>

      <fieldset className="reading-list-privacy" disabled={saving}>
        <legend>Privacidad</legend>
        <label>
          <input
            type="radio"
            name="reading-list-privacy"
            checked={!isPublic}
            onChange={() => setIsPublic(false)}
          />
          <span>
            <strong>Privada</strong>
            Solo tú puedes verla.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="reading-list-privacy"
            checked={isPublic}
            onChange={() => setIsPublic(true)}
          />
          <span>
            <strong>Pública</strong>
            Aparece en tu perfil público.
          </span>
        </label>
      </fieldset>

      {error && <p className="reading-list-error" role="alert">{error}</p>}

      <div className="reading-list-form-actions">
        <button
          type="button"
          className="reading-list-button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="reading-list-button is-primary"
          disabled={saving}
        >
          {saving ? "Guardando..." : submitLabel || "Guardar"}
        </button>
      </div>
    </form>
  );
}
