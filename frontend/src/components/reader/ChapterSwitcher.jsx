import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

// Índice de capítulos de la barra del lector: flechas al anterior y al
// siguiente, y en medio un menú con todos los capítulos para saltar a
// cualquiera sin volver a la historia.
export default function ChapterSwitcher({ storyId, chapters, currentIndex, onOpenChange }) {
  // El menú queda abierto para un capítulo: al cambiar de capítulo se cierra.
  const currentId = chapters[currentIndex]?.id;
  const [openFor, setOpenFor] = useState(null);
  const open = openFor !== null && openFor === currentId;
  const setOpen = useCallback(
    (value) => setOpenFor(value ? currentId : null),
    [currentId]
  );
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const chapterPath = (item) => `/stories/${storyId}/chapters/${item.id}`;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;

    // En historias largas, el capítulo actual queda a la vista al abrir.
    listRef.current
      ?.querySelector("[aria-current='page']")
      ?.scrollIntoView({ block: "center" });

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector(".chapter-switcher-toggle")?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  return (
    <div className="chapter-switcher" ref={rootRef}>
      {previous ? (
        <Link
          to={chapterPath(previous)}
          className="chapter-switcher-arrow"
          aria-label={`Capítulo anterior: ${previous.title}`}
          title={previous.title}
        >
          ‹
        </Link>
      ) : (
        <span className="chapter-switcher-arrow is-disabled" aria-hidden="true">‹</span>
      )}

      <button
        type="button"
        className="chapter-switcher-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span className="chapter-switcher-label">Capítulo</span>{" "}
        {currentIndex + 1} de {chapters.length}
        <span className="chapter-switcher-caret" aria-hidden="true">▾</span>
      </button>

      {next ? (
        <Link
          to={chapterPath(next)}
          className="chapter-switcher-arrow"
          aria-label={`Capítulo siguiente: ${next.title}`}
          title={next.title}
        >
          ›
        </Link>
      ) : (
        <span className="chapter-switcher-arrow is-disabled" aria-hidden="true">›</span>
      )}

      {open && (
        <nav className="chapter-switcher-menu" id={listId} aria-label="Índice de capítulos">
          <p className="chapter-switcher-heading">Índice</p>
          <ol ref={listRef}>
            {chapters.map((item, index) => (
              <li key={item.id}>
                <Link
                  to={chapterPath(item)}
                  aria-current={index === currentIndex ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="chapter-switcher-number">{index + 1}</span>
                  <span className="chapter-switcher-title">{item.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
