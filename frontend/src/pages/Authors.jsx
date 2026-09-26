import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

function normalizeSearch(value) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function Authors() {
  const [authors, setAuthors] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    api.get("/users")
      .then((response) => {
        if (!isActive) return;
        const users = Array.isArray(response.data) ? response.data : [];
        setAuthors(users.filter((author) => author.id));
        setError("");
      })
      .catch((requestError) => {
        console.error("Error al cargar autores:", requestError);
        if (isActive) setError("No se pudieron cargar los autores. Inténtalo nuevamente.");
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const filteredAuthors = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return authors.filter((author) =>
      normalizeSearch(author.username || "Usuario de FriBuk").includes(query)
    );
  }, [authors, search]);

  return (
    <main className="authors-page">
      <div className="authors-container">
        <header className="authors-header">
          <p className="authors-eyebrow">COMUNIDAD FRIBUK</p>
          <h1>Buscar autores</h1>
          <p>Encuentra a quienes escriben y descubre sus historias, favoritos y perfiles.</p>
          <label className="authors-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por username..."
              aria-label="Buscar autores por username"
            />
          </label>
        </header>

        {loading ? (
          <p className="authors-state">Cargando autores...</p>
        ) : error ? (
          <p className="authors-state authors-error" role="alert">{error}</p>
        ) : filteredAuthors.length === 0 ? (
          <p className="authors-state">
            {search ? "No encontramos autores con ese username." : "Todavía no hay autores para mostrar."}
          </p>
        ) : (
          <div className="authors-list">
            {filteredAuthors.map((author) => {
              const username = author.username || "Usuario de FriBuk";
              return (
                <Link className="author-result" key={author.id} to={`/usuario/${author.id}`}>
                  <span className="author-result-avatar" aria-hidden="true">
                    {username.charAt(0).toUpperCase()}
                  </span>
                  <span className="author-result-name">@{username}</span>
                  <span className="author-result-arrow" aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
