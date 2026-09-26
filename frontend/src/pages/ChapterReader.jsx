import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";

export default function ChapterReader() {
  const { storyId, chapterId } = useParams();

  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/stories/${storyId}/chapters`)
      .then((response) => {
        const data = response.data;

        setChapters(data);

        const currentIndex = data.findIndex(
          (item) => item.id === chapterId
        );

        if (currentIndex !== -1) {
          setChapter(data[currentIndex]);
        } else {
          setChapter(null);
        }
      })
      .finally(() => setLoading(false));
  }, [storyId, chapterId]);

  if (loading) {
    return (
      <main className="reader-page">
        <p className="loading-text">Cargando capítulo...</p>
      </main>
    );
  }

  if (!chapter) {
    return (
      <main className="reader-page">
        <div className="reader-error">
          <div className="empty-icon">✦</div>

          <h2>No pudimos encontrar este capítulo</h2>

          <p>
            El capítulo que buscas no está disponible.
          </p>

          <Link
            to={`/stories/${storyId}`}
            className="reader-back-button"
          >
            Volver a la historia
          </Link>
        </div>
      </main>
    );
  }

  const currentIndex = chapters.findIndex(
    (item) => item.id === chapterId
  );

  const previousChapter =
    currentIndex > 0
      ? chapters[currentIndex - 1]
      : null;

  const nextChapter =
    currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : null;

  return (
    <main className="reader-page">

      {/* Barra superior */}
      <div className="reader-topbar">

        <Link
          to={`/stories/${storyId}`}
          className="reader-back-link"
        >
          ← Volver a la historia
        </Link>

        <span className="reader-brand">
          FriBuk
        </span>

      </div>

      {/* Contenido */}
      <article className="reader-content">

        <header className="reader-header">

          <p className="reader-chapter-number">
            CAPÍTULO {currentIndex + 1} DE {chapters.length}
          </p>

          <h1>
            {chapter.title}
          </h1>

        </header>

        <div className="reader-divider">
          <span>✦</span>
        </div>

        {/* Texto */}
        <div className="reader-text">
          {chapter.content
            ?.split("\n")
            .map((paragraph, index) => (
              <p key={index}>
                {paragraph}
              </p>
            ))}
        </div>

        {/* Navegación */}
        <nav className="chapter-navigation">

          {previousChapter ? (
            <Link
              to={`/stories/${storyId}/chapters/${previousChapter.id}`}
              className="chapter-nav-button previous"
            >
              <span className="chapter-nav-arrow">
                ←
              </span>

              <span className="chapter-nav-text">
                <small>ANTERIOR</small>
                {previousChapter.title}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {nextChapter ? (
            <Link
              to={`/stories/${storyId}/chapters/${nextChapter.id}`}
              className="chapter-nav-button next"
            >
              <span className="chapter-nav-text">
                <small>SIGUIENTE</small>
                {nextChapter.title}
              </span>

              <span className="chapter-nav-arrow">
                →
              </span>
            </Link>
          ) : (
            <div />
          )}

        </nav>

        {/* Fin */}
        <footer className="reader-footer">

          <Link
            to={`/stories/${storyId}`}
            className="reader-story-link"
          >
            ← Ver todos los capítulos
          </Link>

          <div className="reader-finish">
            <span>Fin del capítulo</span>
            <span>✦</span>
          </div>

        </footer>

      </article>

    </main>
  );
}
