import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { badgeLabel } from "./labels";
import "../../styles/badges.css";

const MAX_FEATURED = 4;

function ProgressBar({ progress }) {
  if (!progress?.next) return null;
  const percent = Math.min(100, Math.round((progress.current / progress.next) * 100));

  return (
    <div className="badge-progress">
      <div
        className="badge-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.next}
        aria-valuenow={Math.min(progress.current, progress.next)}
        aria-label="Progreso hacia el siguiente nivel"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="badge-progress-text">
        {progress.current}/{progress.next}
      </span>
    </div>
  );
}

function BadgeCard({ badge, children, extra }) {
  const earned = badge.earned !== false;

  return (
    <li className={`badge-card${earned ? "" : " is-locked"}`}>
      <span className="badge-card-emoji" aria-hidden="true">{badge.emoji}</span>
      <div className="badge-card-body">
        <p className="badge-card-name">
          {earned ? badgeLabel(badge) : badge.name}
          {!earned && <span className="badge-card-locked"> · sin ganar</span>}
        </p>
        <p className="badge-card-description">{badge.description}</p>
        {extra}
        {!(earned && badge.temporary) && <ProgressBar progress={badge.progress} />}
        {children}
      </div>
    </li>
  );
}

function BadgeGroup({ title, badges, renderCard }) {
  if (badges.length === 0) return null;

  return (
    <>
      <h3 className="achievements-group-title">{title}</h3>
      <ul className="badge-grid">
        {badges.map((badge) =>
          renderCard ? renderCard(badge) : <BadgeCard key={badge.id} badge={badge} />
        )}
      </ul>
    </>
  );
}

const byGroup = (badges, group) => badges.filter((badge) => badge.group === group);

// Perfil público: solo lo ganado, sin progreso.
export function PublicAchievements({ badges }) {
  const titles = badges?.titles || [];
  const insignias = badges?.insignias || [];
  if (titles.length === 0 && insignias.length === 0) return null;

  return (
    <div className="achievements">
      <BadgeGroup title="Títulos" badges={titles} />
      <BadgeGroup title="Insignias de escritor" badges={byGroup(insignias, "escritor")} />
      <BadgeGroup title="Insignias de lector" badges={byGroup(insignias, "lector")} />
    </div>
  );
}

// Lo que falta para Lector Fundador: una historia leída completa y 3 comentarios.
function ReaderFounderNote({ data }) {
  const founders = data?.founders?.reader;
  const progress = data?.reader_progress;
  if (!founders) return null;

  return (
    <p className="badge-card-note">
      Quedan {founders.remaining} de {founders.total} cupos.
      {progress && (
        <>
          {" "}Historias leídas completas: {Math.min(progress.finished_stories, 1)}/1 ·
          comentarios: {Math.min(progress.visible_comments, progress.comments_needed)}/
          {progress.comments_needed}.
        </>
      )}
    </p>
  );
}

// Perfil propio: todo el catálogo, con progreso, lo no ganado en gris y la
// elección del título principal y de las insignias destacadas.
export default function AchievementsPanel({ data, onChange }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const catalog = data?.catalog || [];
  const titles = catalog.filter((badge) => badge.kind === "title");
  const insignias = catalog.filter((badge) => badge.kind === "insignia");
  const earnedTitles = titles.filter((badge) => badge.earned);
  const featuredIds = (data?.featured || []).map((badge) => badge.id);
  const chosenFeatured = data?.display?.featured || [];

  const saveDisplay = async (display) => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await api.put("/me/badges/display", display);
      onChange({ ...data, ...response.data, display });
      setMessage("Guardado.");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "No se pudo guardar tu elección.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatured = (badgeId) => {
    // Si nunca eligió, se parte de las que se muestran ahora.
    const current = chosenFeatured.length > 0 ? chosenFeatured : featuredIds;
    const next = current.includes(badgeId)
      ? current.filter((id) => id !== badgeId)
      : [...current, badgeId];
    if (next.length > MAX_FEATURED) {
      setError(`Puedes destacar hasta ${MAX_FEATURED} insignias.`);
      return;
    }
    saveDisplay({ main_title: data?.display?.main_title || null, featured: next });
  };

  // Quien nunca publicó no ve los títulos de escritor que no ganó.
  const titleCards = titles.filter(
    (badge) => badge.group === "lector" || data?.has_published || badge.earned
  );

  const titleExtra = (badge) => {
    if (badge.earned) return null;
    if (badge.id === "autor_fundador" && data?.founders?.author) {
      const founders = data.founders.author;
      return (
        <p className="badge-card-note">
          Quedan {founders.remaining} de {founders.total} cupos.
        </p>
      );
    }
    if (badge.id === "lector_fundador") return <ReaderFounderNote data={data} />;
    return null;
  };

  const insigniaCard = (badge) => (
    <BadgeCard key={badge.id} badge={badge}>
      {badge.earned && (
        <label className="badge-card-feature">
          <input
            type="checkbox"
            checked={featuredIds.includes(badge.id)}
            disabled={saving}
            onChange={() => toggleFeatured(badge.id)}
          />
          Destacar en mi perfil
        </label>
      )}
    </BadgeCard>
  );

  return (
    <section className="profile-section achievements" role="tabpanel">
      <div className="profile-section-heading">
        <div>
          <p className="profile-eyebrow">TUS RECONOCIMIENTOS</p>
          <h2>Logros</h2>
        </div>
      </div>

      {(message || error) && (
        <p
          className={error ? "profile-inline-error" : "achievements-saved"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      )}

      {earnedTitles.length > 0 && (
        <label className="achievements-main-title">
          Título principal
          <select
            value={data?.main_title?.id || ""}
            disabled={saving}
            onChange={(event) =>
              saveDisplay({
                main_title: event.target.value || null,
                featured: chosenFeatured,
              })
            }
          >
            {earnedTitles.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.emoji} {badgeLabel(badge)}
              </option>
            ))}
          </select>
        </label>
      )}

      <BadgeGroup
        title="Títulos"
        badges={titleCards}
        renderCard={(badge) => (
          <BadgeCard key={badge.id} badge={badge} extra={titleExtra(badge)} />
        )}
      />

      <h3 className="achievements-group-title">Insignias de escritor</h3>
      {data?.has_published ? (
        <ul className="badge-grid">
          {byGroup(insignias, "escritor").map(insigniaCard)}
        </ul>
      ) : (
        <div className="achievements-invite">
          <p>
            Publica tu primera historia y gana <span aria-hidden="true">🌟</span>{" "}
            <strong>Primera Publicación</strong>.
          </p>
          <Link to="/create-story" className="profile-create-button">
            Escribir una historia
          </Link>
        </div>
      )}

      <BadgeGroup
        title="Insignias de lector"
        badges={byGroup(insignias, "lector")}
        renderCard={insigniaCard}
      />
    </section>
  );
}
