import { Link } from "react-router-dom";
import "../styles/user-search.css";

// Un resultado de la búsqueda de usuarios: enlaza al perfil público.
// variant "row" es la tarjeta de /autores; "chip" es la de la franja del inicio.
export default function UserSearchResult({ user, variant = "row" }) {
  const username = user.username || "Usuario de FriBuk";
  const avatar = user.avatar_url ? (
    <img src={user.avatar_url} alt="" loading="lazy" />
  ) : (
    username.charAt(0).toUpperCase()
  );

  if (variant === "chip") {
    return (
      <Link className="user-chip" to={`/usuario/${user.id}`}>
        <span className="user-chip-avatar" aria-hidden="true">{avatar}</span>
        <span className="user-chip-text">
          {user.display_name && (
            <span className="user-chip-name">{user.display_name}</span>
          )}
          <span className="user-chip-username">@{username}</span>
        </span>
      </Link>
    );
  }

  return (
    <Link className="author-result" to={`/usuario/${user.id}`}>
      <span className="author-result-avatar" aria-hidden="true">{avatar}</span>
      <span className="author-result-text">
        {user.display_name && (
          <span className="author-result-display-name">{user.display_name}</span>
        )}
        <span className="author-result-name">@{username}</span>
      </span>
      <span className="author-result-arrow" aria-hidden="true">→</span>
    </Link>
  );
}
