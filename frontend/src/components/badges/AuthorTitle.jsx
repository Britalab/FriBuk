import { useEffect, useId, useRef, useState } from "react";
import { badgeLabel } from "./labels";
import "../../styles/badges.css";

// Título principal del autor y un "+N" que despliega los demás. Va en su
// propia línea o junto a "Por …", nunca dentro del nombre: así no se
// confunde con los emojis decorativos de «Mi espacio».
export default function AuthorTitle({ title, className = "" }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "mousedown" && wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const main = title?.main_title;
  if (!main) return null;
  const others = title.other_titles || [];

  return (
    <span className={`author-title ${className}`.trim()} ref={wrapperRef}>
      <span className="badge-chip is-title" title={main.description}>
        <span aria-hidden="true">{main.emoji}</span> {badgeLabel(main)}
      </span>
      {others.length > 0 && (
        <span className="author-title-more">
          <button
            type="button"
            className="author-title-more-button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`Ver ${others.length} ${others.length === 1 ? "título más" : "títulos más"}`}
            onClick={(event) => {
              // En las tarjetas, el botón no debe abrir la historia.
              event.preventDefault();
              event.stopPropagation();
              setOpen((current) => !current);
            }}
          >
            +{others.length}
          </button>
          {open && (
            <ul id={listId} className="author-title-list">
              {others.map((other) => (
                <li key={other.id} title={other.description}>
                  <span aria-hidden="true">{other.emoji}</span> {badgeLabel(other)}
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </span>
  );
}

// Hasta 4 insignias elegidas por el usuario, bajo su nombre.
export function FeaturedBadges({ badges }) {
  if (!badges?.length) return null;

  return (
    <ul className="featured-badges" aria-label="Insignias destacadas">
      {badges.map((badge) => (
        <li key={badge.id} className="featured-badge" title={badgeLabel(badge)}>
          <span aria-hidden="true">{badge.emoji}</span>
          <span className="badges-visually-hidden">{badgeLabel(badge)}</span>
        </li>
      ))}
    </ul>
  );
}

// ⭐ Historia Destacada, en tarjetas y en la página de la historia.
export function FeaturedStoryChip({ story }) {
  if (!story?.is_featured) return null;

  return (
    <span
      className="badge-chip is-featured-story"
      title="Promedio de 4,5 o más con más de 30 valoraciones"
    >
      <span aria-hidden="true">⭐</span> Historia Destacada
    </span>
  );
}
