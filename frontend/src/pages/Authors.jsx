import { useSearchParams } from "react-router-dom";
import UserSearchResult from "../components/UserSearchResult";
import { useUserSearch } from "../hooks/useUserSearch";

export default function Authors() {
  // El texto buscado vive en la URL (/autores?q=...): se puede compartir el
  // enlace y al volver atrás se conserva la búsqueda.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const { term, status, users, hasMore, error, retry } = useUserSearch(search, {
    browse: true,
  });

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchParams(value ? { q: value } : {}, { replace: true });
  };

  const isLoading = status === "loading";

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
              onChange={handleSearchChange}
              maxLength={31}
              placeholder="Buscar por username..."
              aria-label="Buscar autores por username"
            />
          </label>
        </header>

        <div aria-live="polite">
          {status === "short" ? (
            <p className="authors-state">Escribe al menos 2 caracteres para buscar.</p>
          ) : status === "error" ? (
            <div className="authors-state authors-error" role="alert">
              <p>{error}</p>
              <button type="button" className="authors-retry" onClick={retry}>
                Reintentar
              </button>
            </div>
          ) : isLoading && users.length === 0 ? (
            <p className="authors-state">
              {term ? "Buscando..." : "Cargando autores..."}
            </p>
          ) : users.length === 0 ? (
            <p className="authors-state">
              {term
                ? "No encontramos usuarios con ese username."
                : "Todavía no hay autores para mostrar."}
            </p>
          ) : (
            <>
              <div className="authors-results-heading">
                <h2>{term ? `Resultados para “${term}”` : "Autores de la comunidad"}</h2>
                {isLoading && <p>Buscando...</p>}
              </div>
              <div className={`authors-list${isLoading ? " is-loading" : ""}`}>
                {users.map((user) => (
                  <UserSearchResult key={user.id} user={user} />
                ))}
              </div>
              {hasMore && (
                <p className="authors-more">
                  {term
                    ? "Hay más resultados. Escribe algo más específico para afinar la búsqueda."
                    : "Hay más autores. Escribe un username para encontrar a alguien."}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
