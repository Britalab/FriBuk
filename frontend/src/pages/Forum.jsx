import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Forum() {
  usePageTitle("Foro");
  const [topics, setTopics] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadTopics = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/forum/topics");

        const topicsData = response.data;

        // Cargar los contadores de interacciones de cada tema
        const topicsWithInteractions = await Promise.all(
          topicsData.map(async (topic) => {
            try {
              const interactions = await api.get(
                `/forum/topics/${topic.id}/interactions`
              );

              return {
                ...topic,
                interactions: interactions.data,
              };
            } catch (err) {
              console.error(
                `Error cargando interacciones del tema ${topic.id}:`,
                err
              );

              return {
                ...topic,
                interactions: {
                  votes: {
                    up: 0,
                    down: 0,
                  },
                  heart: 0,
                },
              };
            }
          })
        );

        setTopics(topicsWithInteractions);
      } catch (err) {
        console.error("Error cargando temas:", err);

        setError(
          err.response?.data?.detail ||
            "No se pudieron cargar los temas del foro."
        );
      } finally {
        setLoading(false);
      }
    };

    loadTopics();
  }, []);

  const filteredTopics = topics.filter((topic) =>
    topic.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="forum-page">

      {/* ENCABEZADO */}
      <section className="forum-header">

        <div>
          <span className="forum-label">COMUNIDAD</span>

          <h1>Foro</h1>

          <p>
            Conversa, comparte ideas y descubre nuevas historias
            junto a otros lectores y escritores.
          </p>
        </div>

        <Link to="/forum/new" className="forum-new-button">
          + Nuevo tema
        </Link>

      </section>

      {/* BUSCADOR */}
      <section className="forum-toolbar">

        <div className="forum-search">
          <span>🔍</span>

          <input
            type="text"
            placeholder="Buscar temas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

      </section>

      {/* TEMAS */}
      <section className="forum-topics">

        {loading ? (
          <div className="forum-empty">
            <div className="forum-empty-icon">⏳</div>

            <h2>Cargando temas...</h2>

            <p>
              Estamos buscando las conversaciones de la comunidad.
            </p>
          </div>
        ) : error ? (
          <div className="forum-empty">
            <div className="forum-empty-icon">⚠️</div>

            <h2>No pudimos cargar el foro</h2>

            <p>{error}</p>
          </div>
        ) : filteredTopics.length > 0 ? (
          filteredTopics.map((topic) => {
            const interactions = topic.interactions || {};

            const votes = interactions.votes || {
              up: 0,
              down: 0,
            };

            return (
              <Link
                key={topic.id}
                to={`/forum/${topic.id}`}
                className="forum-topic-card"
              >
                <div className="forum-topic-icon">
                  💬
                </div>

                <div className="forum-topic-info">
                  <h2>{topic.title}</h2>

                  <span className="forum-topic-user">
                    @{topic.username || "Usuario"}
                  </span>

                  {/* RESUMEN DE INTERACCIONES */}
                  <div className="forum-topic-interactions">
                    <span>
                      👍 {votes.up || 0}
                    </span>

                    <span>
                      👎 {votes.down || 0}
                    </span>

                    <span>
                      ❤️ {interactions.heart || 0}
                    </span>
                  </div>
                </div>

                <span className="forum-topic-arrow">
                  →
                </span>
              </Link>
            );
          })
        ) : (
          <div className="forum-empty">
            <div className="forum-empty-icon">🔎</div>

            <h2>
              {search
                ? "No encontramos temas"
                : "Todavía no hay temas"}
            </h2>

            <p>
              {search
                ? "Prueba con otra palabra en el buscador."
                : "Sé la primera persona en iniciar una conversación."}
            </p>
          </div>
        )}

      </section>

    </main>
  );
}
