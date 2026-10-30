import { useRef } from "react";
import { Link } from "react-router-dom";

// Fila horizontal de portadas del inicio. Las historias llegan ya
// revueltas y filtradas desde el Feed; toda la tarjeta lleva a la historia.
export default function ExploreStories({ stories }) {
  const listRef = useRef(null);

  // Flechas del computador: avanzan casi un ancho de fila.
  const scroll = (direction) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * list.clientWidth * 0.85,
      behavior: "smooth",
    });
  };

  if (stories.length === 0) return null;

  return (
    <section className="explore-stories" aria-label="Explora historias">
      <h2>Explora historias</h2>

      <div className="explore-stories-row">
        <button
          type="button"
          className="explore-stories-arrow is-prev"
          onClick={() => scroll(-1)}
          aria-label="Ver historias anteriores"
        >
          ‹
        </button>

        <div className="explore-stories-list" ref={listRef}>
          {stories.map((story) => (
            <Link
              key={story.id}
              to={`/stories/${story.id}`}
              className="explore-story"
            >
              <span className="explore-story-cover">
                {story.cover_url ? (
                  <img
                    src={story.cover_url}
                    alt={`Portada de ${story.title}`}
                    loading="lazy"
                  />
                ) : (
                  <img
                    src="/logo-fribuk.jpg"
                    alt="FriBuk"
                    className="explore-story-logo"
                  />
                )}
              </span>

              <span className="explore-story-title">{story.title}</span>

              <span className="explore-story-author">
                {story.author_username || "Autor de FriBuk"}
              </span>

              <span className="explore-story-genre">
                {story.genre || "Sin género"}
              </span>
            </Link>
          ))}
        </div>

        <button
          type="button"
          className="explore-stories-arrow is-next"
          onClick={() => scroll(1)}
          aria-label="Ver más historias"
        >
          ›
        </button>
      </div>
    </section>
  );
}
