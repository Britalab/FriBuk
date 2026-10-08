import { useState } from "react";

const SUGGESTED_TAGS = [
  "enemies to lovers",
  "slow burn",
  "found family",
  "amor prohibido",
  "segunda oportunidad",
  "magia",
  "dragones",
  "romance",
  "amistad",
  "LGBTQ+",
  "misterio",
  "aventura",
];

const MAX_TAG_LENGTH = 30;

// Etiquetas de una historia (tropos y temas), compartidas por crear y editar.
// Los lectores las usan para buscar y filtrar historias en el inicio.
export default function TagEditor({ tags, onChange }) {
  const [tagInput, setTagInput] = useState("");

  const addTag = (tag) => {
    const cleanTag = tag.trim();
    setTagInput("");

    if (!cleanTag) return;
    // La misma etiqueta con otras mayúsculas no se repite.
    if (tags.some((item) => item.toLowerCase() === cleanTag.toLowerCase())) return;

    onChange([...tags, cleanTag]);
  };

  const removeTag = (tagToRemove) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const suggestions = SUGGESTED_TAGS.filter(
    (suggestion) => !tags.some((tag) => tag.toLowerCase() === suggestion.toLowerCase())
  );

  return (
    <div className="form-group">
      <div className="form-label-row">
        <label htmlFor="tagInput">Etiquetas</label>

        <span className="form-optional">Opcional</span>
      </div>

      <p className="form-help">
        Agrega tropos y temas que describan tu historia, como «enemies to
        lovers» o «viajes en el tiempo». Sirven para que los lectores la
        encuentren al buscar.
      </p>

      <div className="tag-input-row">
        <input
          id="tagInput"
          type="text"
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="Ej: vampiros, viajes en el tiempo..."
          maxLength={MAX_TAG_LENGTH}
        />

        <button
          type="button"
          className="tag-add-button"
          onClick={() => addTag(tagInput)}
        >
          Agregar
        </button>
      </div>

      {tags.length > 0 && (
        <div className="story-tags" aria-label="Etiquetas de la historia">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="story-tag selected"
              onClick={() => removeTag(tag)}
              aria-label={`Quitar la etiqueta ${tag}`}
            >
              {tag} ×
            </button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="tag-suggestions">
          <span className="tag-suggestions-label">Sugerencias:</span>

          <div className="story-tags">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                className="story-tag"
                onClick={() => addTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
