import { useState } from "react";
import api from "../../api/client";

const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 500;
const WEBSITE_MAX = 200;

export default function ProfileInfoForm({ profile, onSaved, onCancel }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [websiteUrl, setWebsiteUrl] = useState(profile?.website_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await api.put("/me/profile", {
        display_name: displayName,
        bio,
        website_url: websiteUrl,
      });
      onSaved(response.data.profile);
    } catch (requestError) {
      console.error("Error al guardar el perfil:", requestError);
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "No pudimos guardar tu perfil. Inténtalo nuevamente."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="profile-info-form" onSubmit={handleSubmit}>
      <div className="profile-info-form-header">
        <p className="profile-eyebrow">INFORMACIÓN PÚBLICA</p>
        <h2>Editar perfil</h2>
        <p>Estos datos se muestran en tu perfil público.</p>
      </div>

      <label className="profile-info-field">
        <span>Nombre visible</span>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          placeholder="Cómo quieres que te vean"
          disabled={saving}
        />
      </label>

      <label className="profile-info-field">
        <span>
          Biografía
          <small>{bio.length}/{BIO_MAX}</small>
        </span>
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={BIO_MAX}
          rows={4}
          placeholder="Cuéntale a la comunidad quién eres y qué escribes"
          disabled={saving}
        />
      </label>

      <label className="profile-info-field">
        <span>Sitio web</span>
        <input
          type="text"
          inputMode="url"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          maxLength={WEBSITE_MAX}
          placeholder="https://"
          disabled={saving}
        />
      </label>

      {error && (
        <p className="profile-inline-error" role="alert">{error}</p>
      )}

      <div className="profile-info-form-actions">
        <button
          type="button"
          className="profile-info-cancel"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="submit" className="profile-create-button" disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}
