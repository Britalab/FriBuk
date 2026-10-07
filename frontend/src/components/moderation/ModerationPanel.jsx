import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { RemoveButton, RestoreButton } from "./AdminModerationButtons";
import {
  CASE_ACTION_LABELS,
  CASE_FILTERS,
  CASE_STATUS_LABELS,
  formatModerationDate,
  moderationErrorDetail,
} from "../../utils/moderation";
import "../../styles/moderation.css";

function ModerationCase({ item, onChanged }) {
  const { showToast } = useToast();
  const [reviewing, setReviewing] = useState(false);

  // Marcar reportes como revisados o confirmar un retiro automático: las dos
  // acciones cierran la revisión y avisan a quienes reportaron.
  const closeReview = async (action, successMessage) => {
    setReviewing(true);

    try {
      const response = await api.post(`/moderation/cases/${item.id}/${action}`, {});
      showToast(successMessage);
      onChanged(response.data.case);
    } catch (error) {
      showToast(moderationErrorDetail(error, "No se pudo guardar el cambio."), "error");
    } finally {
      setReviewing(false);
    }
  };

  const handleReview = () =>
    closeReview("review", "Reportes marcados como revisados.");
  const handleConfirm = () =>
    closeReview("confirm", "Retiro confirmado. Avisamos a quienes lo reportaron.");

  // Un retiro automático queda a la espera de que alguien lo revise.
  const awaitingReview =
    item.status === "removed" && item.removal?.automatic && !item.removal.confirmed;

  return (
    <article className="moderation-case">
      <header className="moderation-case-top">
        <span className="moderation-case-type">{item.target_label}</span>
        <span className={`moderation-case-status is-${item.status}`}>
          {CASE_STATUS_LABELS[item.status] || item.status}
        </span>
      </header>

      <div className="moderation-case-body">
        {item.content.image_url && (
          <a
            className="moderation-case-image"
            href={item.content.image_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir la imagen en otra pestaña"
          >
            <img src={item.content.image_url} alt="" loading="lazy" />
          </a>
        )}

        <div className="moderation-case-text">
          <p className="moderation-case-owner">
            Publicado por{" "}
            {item.owner ? (
              <Link to={`/usuario/${item.owner.id}`}>@{item.owner.username}</Link>
            ) : (
              "la administración"
            )}
          </p>

          {item.content.title && <h3>{item.content.title}</h3>}
          {item.content.text && (
            <p className="moderation-case-content">{item.content.text}</p>
          )}

          <p className="moderation-case-counts">
            <strong>{item.report_count}</strong>{" "}
            {item.report_count === 1 ? "reporte" : "reportes"}
            {item.last_report_at &&
              ` · último: ${formatModerationDate(item.last_report_at)}`}
          </p>

          {item.reasons.length > 0 && (
            <ul className="moderation-case-reasons" aria-label="Motivos recibidos">
              {item.reasons.map((reason) => (
                <li key={reason.reason}>
                  {reason.label} · {reason.count}
                </li>
              ))}
            </ul>
          )}

          {item.explanations.map((explanation, index) => (
            <blockquote key={index} className="moderation-case-explanation">
              {explanation}
            </blockquote>
          ))}

          {item.removal && (
            <p className="moderation-case-removal">
              Retirado por: <strong>{item.removal.reason_label}</strong>
              {item.removal.automatic && " (automático)"} ·{" "}
              {formatModerationDate(item.removal.removed_at)}
              {awaitingReview && " · Pendiente de tu revisión"}
            </p>
          )}

          {item.history.length > 0 && (
            <details className="moderation-case-history">
              <summary>Historial</summary>
              <ul>
                {item.history.map((entry, index) => (
                  <li key={index}>
                    <strong>{CASE_ACTION_LABELS[entry.action] || entry.action}</strong>
                    {entry.reason_label && ` · ${entry.reason_label}`}
                    {" · "}
                    {entry.actor ? `@${entry.actor}` : "automático"}
                    {" · "}
                    {formatModerationDate(entry.created_at)}
                    {entry.note && <p>{entry.note}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <footer className="moderation-case-actions">
        <Link to={item.link} className="moderation-button">
          Ver en el sitio
        </Link>

        {item.status === "removed" ? (
          <RestoreButton caseId={item.id} onRestored={onChanged} />
        ) : (
          <RemoveButton
            targetType={item.target_type}
            targetId={item.target_id}
            onRemoved={onChanged}
          />
        )}

        {item.status === "open" && (
          <button
            type="button"
            className="moderation-button"
            onClick={handleReview}
            disabled={reviewing}
          >
            {reviewing ? "Guardando..." : "Marcar como revisado"}
          </button>
        )}

        {awaitingReview && (
          <button
            type="button"
            className="moderation-button"
            onClick={handleConfirm}
            disabled={reviewing}
          >
            {reviewing ? "Guardando..." : "Confirmar retiro"}
          </button>
        )}
      </footer>
    </article>
  );
}

// Sección de moderación del panel de administración: contenido reportado o
// retirado, con sus motivos y las acciones de retirar y restaurar.
export default function ModerationPanel() {
  const [filter, setFilter] = useState("open");
  const [cases, setCases] = useState([]);
  const [threshold, setThreshold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (status) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get(`/moderation/cases?status=${status}`);
      setCases(response.data.cases || []);
      setThreshold(response.data.auto_remove_threshold || null);
    } catch (requestError) {
      setError(
        requestError?.response?.status === 403
          ? "No tienes permisos para ver la moderación."
          : "No pudimos cargar los casos de moderación."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const start = () => load(filter);
    start();
  }, [filter, load]);

  return (
    <section className="moderation-panel" aria-labelledby="moderation-panel-title">
      <div className="moderation-panel-header">
        <div>
          <h2 id="moderation-panel-title">Moderación de contenido</h2>
          <p>
            Publicaciones e imágenes reportadas por la comunidad.
            {threshold &&
              ` Con ${threshold} reportes de personas distintas, el contenido se retira solo hasta que lo revises.`}
          </p>
        </div>

        <div className="moderation-filters" role="group" aria-label="Filtrar casos">
          {CASE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="moderation-button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="moderation-state">Cargando casos...</p>
      ) : error ? (
        <p className="moderation-state" role="alert">{error}</p>
      ) : cases.length === 0 ? (
        <p className="moderation-state">No hay casos en esta lista.</p>
      ) : (
        <div className="moderation-case-list">
          {cases.map((item) => (
            <ModerationCase key={item.id} item={item} onChanged={() => load(filter)} />
          ))}
        </div>
      )}
    </section>
  );
}
