import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/useToast";
import ProfileAbout from "../components/profile/ProfileAbout";
import ProfileSpace, { ProfileEmojis, ProfileStickers } from "../components/profile/ProfileSpace";
import {
  ACCENTS,
  AMBIENTS,
  EMOJIS,
  EMOJI_CATEGORIES,
  MAX_AMBIENT_DECORATIONS,
  MAX_EMOJI_DECORATIONS,
  STICKERS_ID,
  THEMES,
  emojiUrl,
  emptyCustomization,
  getEmoji,
  getTheme,
  isAmbient,
  normalizeCustomization,
} from "../profile/catalog";
import "../styles/profile-customize.css";

function normalizeSearch(value) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function isSameCustomization(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function Preview({ customization, user, profileInfo }) {
  const username = user?.username || "usuario";
  const displayName = profileInfo?.display_name;

  // `inert` deja la vista previa fuera del foco y de los clics: es solo una muestra.
  return (
    <ProfileSpace className="customize-preview-page" customization={customization} inert>
      <header className={`public-profile-header${user?.banner_url ? " has-banner" : ""}`}>
        <ProfileStickers customization={customization} />
        {user?.banner_url && (
          <div className="public-profile-banner">
            <img src={user.banner_url} alt="" />
          </div>
        )}
        <div className="public-profile-avatar">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" />
          ) : (
            username.charAt(0).toUpperCase()
          )}
        </div>
        <div className="public-profile-identity">
          <p className="public-profile-eyebrow">PERFIL DE AUTOR · FRIBUK</p>
          <h1>
            {displayName || `@${username}`}
            <ProfileEmojis customization={customization} />
          </h1>
          {displayName && <p className="public-profile-username">@{username}</p>}
          <ProfileAbout
            bio={profileInfo?.bio || "Así se verá tu biografía en tu perfil público."}
            websiteUrl={profileInfo?.website_url}
          />
          <div className="public-profile-stats">
            <button type="button" tabIndex={-1}>
              <strong>128</strong>
              <span>Seguidores</span>
            </button>
            <button type="button" tabIndex={-1}>
              <strong>42</strong>
              <span>Siguiendo</span>
            </button>
          </div>
          <div className="public-profile-follow-area">
            <span className="public-profile-follow-button">Seguir</span>
          </div>
        </div>
      </header>

      <section className="public-profile-section">
        <div className="public-profile-section-heading">
          <div>
            <p className="public-profile-eyebrow">OBRA PÚBLICA</p>
            <h2>Historias</h2>
          </div>
          <span className="public-profile-section-count">1</span>
        </div>
        <article className="public-profile-story-card">
          <div className="public-profile-story-cover">
            <img src="/logo-fribuk.jpg" alt="" />
          </div>
          <div className="public-profile-story-info">
            <p className="public-profile-story-genre">Fantasía</p>
            <h3>Una historia de ejemplo</h3>
            <p className="public-profile-story-description">
              Este texto muestra cómo se leerán las descripciones con el tema elegido.
            </p>
            <div className="public-profile-story-meta">
              <span>12 capítulos</span>
              <span>❤️ 34</span>
            </div>
            <div className="public-profile-story-actions">
              <span className="public-profile-story-link">Ver historia</span>
            </div>
          </div>
        </article>
      </section>
    </ProfileSpace>
  );
}

export default function ProfileCustomize() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(emptyCustomization);
  const [draft, setDraft] = useState(emptyCustomization);
  const [profileInfo, setProfileInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api.get("/me/customization"),
      // La información de perfil solo alimenta la vista previa.
      api.get("/me/profile").catch(() => null),
    ])
      .then(([customizationResponse, profileResponse]) => {
        if (!isActive) return;
        const loaded = normalizeCustomization(customizationResponse.data.customization);
        setSaved(loaded);
        setDraft(loaded);
        setProfileInfo(profileResponse?.data?.profile || null);
        setLoadError("");
      })
      .catch((requestError) => {
        console.error("Error al cargar la personalización:", requestError);
        if (isActive) setLoadError("No pudimos cargar tu personalización. Inténtalo nuevamente.");
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const isDirty = !isSameCustomization(draft, saved);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const theme = getTheme(draft.theme);
  const selectedEmojis = draft.decorations.filter((id) => getEmoji(id));
  const selectedAmbient = draft.decorations.find(isAmbient);
  const stickersOn = draft.decorations.includes(STICKERS_ID);

  const emojiGroups = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return EMOJI_CATEGORIES.map((category) => ({
      ...category,
      items: EMOJIS.filter(
        (item) =>
          item.category === category.id &&
          (!query || normalizeSearch(item.name).includes(query))
      ),
    })).filter((category) => category.items.length > 0);
  }, [search]);

  const updateDraft = (changes) => {
    setError("");
    setDraft((current) => normalizeCustomization({ ...current, ...changes }));
  };

  const handleSelectTheme = (themeId) => {
    const nextTheme = getTheme(themeId);
    const accent = draft.colors.accent;
    setNotice(
      accent && !nextTheme.accents.includes(accent)
        ? "El color de acento que tenías no está disponible en este tema; se usarán los colores del tema."
        : ""
    );
    updateDraft({ theme: themeId });
  };

  const handleSelectAccent = (accentId) => {
    setNotice("");
    updateDraft({ colors: accentId ? { accent: accentId } : {} });
  };

  const handleToggleDecoration = (decorationId) => {
    setNotice("");
    updateDraft({
      decorations: draft.decorations.includes(decorationId)
        ? draft.decorations.filter((id) => id !== decorationId)
        : [...draft.decorations, decorationId],
    });
  };

  // El fondo es uno solo: elegir otro reemplaza al anterior.
  const handleSelectAmbient = (ambientId) => {
    setNotice("");
    updateDraft({
      decorations: [
        ...draft.decorations.filter((id) => !isAmbient(id)),
        ...(ambientId ? [ambientId] : []),
      ],
    });
  };

  const emojisFull = selectedEmojis.length >= MAX_EMOJI_DECORATIONS;

  const handleSave = async () => {
    if (saving || !isDirty) return;

    setSaving(true);
    setError("");

    try {
      const response = await api.put("/me/customization", draft);
      const stored = normalizeCustomization(response.data.customization);
      setSaved(stored);
      setDraft(stored);
      setNotice("");
      showToast("Tu espacio se guardó correctamente.");
    } catch (requestError) {
      console.error("Error al guardar la personalización:", requestError);
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "No pudimos guardar tu espacio. Inténtalo nuevamente."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres salir sin guardarlos?")) {
      return;
    }
    navigate("/perfil");
  };

  if (loading) {
    return (
      <main className="customize-page">
        <div className="customize-container">
          <p className="customize-state">Cargando tu espacio...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="customize-page">
        <div className="customize-container">
          <div className="customize-state" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="customize-button is-primary"
              onClick={() => {
                setLoading(true);
                setReloadKey((key) => key + 1);
              }}
            >
              Reintentar
            </button>
            <Link to="/perfil">Volver al perfil</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="customize-page">
      <div className="customize-container">
        <header className="customize-header">
          <p className="customize-eyebrow">MI ESPACIO</p>
          <h1>Personaliza tu perfil</h1>
          <p>
            Elige un tema, tus emojis y el color de acento. Los cambios se
            aplican a tu perfil público cuando los guardas.
          </p>
        </header>

        <div className="customize-layout">
          <div className="customize-options">
            <details className="customize-step" open>
              <summary>
                <span className="customize-step-number">1</span>
                <span className="customize-step-title">Tema</span>
                <span className="customize-step-value">{theme.name}</span>
              </summary>
              <div className="customize-theme-grid">
                {THEMES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="customize-theme-card"
                    aria-pressed={draft.theme === item.id}
                    onClick={() => handleSelectTheme(item.id)}
                  >
                    <span
                      className="profile-space customize-theme-swatch"
                      data-profile-theme={item.id}
                      data-profile-surface={item.surface}
                      aria-hidden="true"
                    >
                      <span className="customize-theme-swatch-card">
                        <span className="customize-theme-swatch-title" />
                        <span className="customize-theme-swatch-text" />
                        <span className="customize-theme-swatch-accent" />
                      </span>
                    </span>
                    <span className="customize-theme-name">{item.name}</span>
                  </button>
                ))}
              </div>
            </details>

            <details className="customize-step" open>
              <summary>
                <span className="customize-step-number">2</span>
                <span className="customize-step-title">Emojis y fondo</span>
                <span className="customize-step-value">
                  Emojis {selectedEmojis.length}/{MAX_EMOJI_DECORATIONS} · Fondo{" "}
                  {selectedAmbient ? 1 : 0}/{MAX_AMBIENT_DECORATIONS}
                </span>
              </summary>

              <p className="customize-hint">
                Elige hasta {MAX_EMOJI_DECORATIONS} emojis: aparecen junto a tu nombre, en el
                orden en que los tocas.
              </p>

              <div className="customize-decor-toolbar">
                <label className="customize-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar emoji..."
                    aria-label="Buscar emoji"
                  />
                </label>
                <button
                  type="button"
                  className="customize-button"
                  onClick={() =>
                    updateDraft({
                      decorations: draft.decorations.filter((id) => !getEmoji(id)),
                    })
                  }
                  disabled={selectedEmojis.length === 0}
                >
                  Quitar emojis
                </button>
              </div>

              {emojiGroups.length === 0 ? (
                <p className="customize-hint">No encontramos emojis con ese nombre.</p>
              ) : (
                emojiGroups.map((category) => (
                  <div className="customize-decor-group" key={category.id}>
                    <h3>{category.name}</h3>
                    <div className="customize-emoji-grid">
                      {category.items.map((emoji) => {
                        const selected = draft.decorations.includes(emoji.id);
                        return (
                          <button
                            type="button"
                            key={emoji.id}
                            className="customize-emoji"
                            aria-pressed={selected}
                            aria-label={emoji.name}
                            title={emoji.name}
                            disabled={!selected && emojisFull}
                            onClick={() => handleToggleDecoration(emoji.id)}
                          >
                            <img src={emojiUrl(emoji.id)} alt="" loading="lazy" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              <div className="customize-decor-group">
                <h3>Pegatinas</h3>
                <div className="customize-decor-list">
                  <button
                    type="button"
                    className="customize-decor-chip"
                    aria-pressed={stickersOn}
                    onClick={() => handleToggleDecoration(STICKERS_ID)}
                  >
                    Mostrarlos también como pegatinas en mi cabecera
                  </button>
                </div>
              </div>

              <div className="customize-decor-group">
                <h3>Fondo</h3>
                <div className="customize-decor-list">
                  <button
                    type="button"
                    className="customize-decor-chip"
                    aria-pressed={!selectedAmbient}
                    onClick={() => handleSelectAmbient(null)}
                  >
                    Sin fondo
                  </button>
                  {AMBIENTS.map((ambient) => (
                    <button
                      type="button"
                      key={ambient.id}
                      className="customize-decor-chip"
                      aria-pressed={selectedAmbient === ambient.id}
                      onClick={() => handleSelectAmbient(ambient.id)}
                    >
                      <span className="customize-decor-ambient" aria-hidden="true" />
                      {ambient.name}
                    </button>
                  ))}
                </div>
              </div>
            </details>

            <details className="customize-step" open>
              <summary>
                <span className="customize-step-number">3</span>
                <span className="customize-step-title">Color de acento</span>
                <span className="customize-step-value">
                  {ACCENTS.find((accent) => accent.id === draft.colors.accent)?.name ||
                    "Colores del tema"}
                </span>
              </summary>
              <p className="customize-hint">
                Solo se muestran los colores que se leen bien con el tema {theme.name}.
              </p>
              <div className="customize-accent-list">
                <button
                  type="button"
                  className="customize-accent"
                  aria-pressed={!draft.colors.accent}
                  onClick={() => handleSelectAccent(null)}
                >
                  <span
                    className="profile-space customize-accent-dot"
                    data-profile-theme={theme.id}
                    data-profile-surface={theme.surface}
                    aria-hidden="true"
                  />
                  Colores del tema
                </button>
                {ACCENTS.filter((accent) => theme.accents.includes(accent.id)).map((accent) => (
                  <button
                    type="button"
                    key={accent.id}
                    className="customize-accent"
                    aria-pressed={draft.colors.accent === accent.id}
                    onClick={() => handleSelectAccent(accent.id)}
                  >
                    <span
                      className="profile-space customize-accent-dot"
                      data-profile-theme={theme.id}
                      data-profile-surface={theme.surface}
                      data-profile-accent={accent.id}
                      aria-hidden="true"
                    />
                    {accent.name}
                  </button>
                ))}
              </div>
            </details>
          </div>

          <aside className="customize-preview" aria-label="Vista previa de tu perfil público">
            <p className="customize-preview-label">Vista previa</p>
            <Preview customization={draft} user={user} profileInfo={profileInfo} />
          </aside>
        </div>

        <div className="customize-actions">
          <div className="customize-actions-status" aria-live="polite">
            {error ? (
              <p className="customize-error" role="alert">{error}</p>
            ) : notice ? (
              <p>{notice}</p>
            ) : isDirty ? (
              <p>Tienes cambios sin guardar.</p>
            ) : (
              <p>Todo está guardado.</p>
            )}
          </div>
          <div className="customize-actions-buttons">
            <button type="button" className="customize-button" onClick={handleBack}>
              Volver al perfil
            </button>
            <button
              type="button"
              className="customize-button"
              onClick={() => {
                setNotice("");
                setError("");
                setDraft(emptyCustomization());
              }}
              disabled={saving || isSameCustomization(draft, emptyCustomization())}
            >
              Restablecer
            </button>
            <button
              type="button"
              className="customize-button"
              onClick={() => {
                setNotice("");
                setError("");
                setDraft(saved);
              }}
              disabled={saving || !isDirty}
            >
              Descartar cambios
            </button>
            <button
              type="button"
              className="customize-button is-primary"
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
