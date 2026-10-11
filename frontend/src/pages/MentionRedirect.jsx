import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import api from "../api/client";

// Destino de una mención (@nombre): busca a esa persona por su nombre de
// usuario y lleva a su perfil público.
export default function MentionRedirect() {
  const { username } = useParams();
  const [result, setResult] = useState({ username: null, userId: null, missing: false });

  useEffect(() => {
    let isActive = true;

    api
      .get(`/users/by-username/${encodeURIComponent(username)}`)
      .then((response) => {
        if (isActive) setResult({ username, userId: response.data.id, missing: false });
      })
      .catch(() => {
        if (isActive) setResult({ username, userId: null, missing: true });
      });

    return () => {
      isActive = false;
    };
  }, [username]);

  const current = result.username === username ? result : null;

  if (current?.userId) {
    return <Navigate to={`/usuario/${current.userId}`} replace />;
  }

  return (
    <main className="public-profile-page">
      <div className="public-profile-container">
        {current?.missing ? (
          <div className="public-profile-state public-profile-state-error" role="alert">
            <p>No encontramos a @{username}. Puede que haya cambiado su nombre.</p>
            <Link to="/autores">Buscar personas</Link>
          </div>
        ) : (
          <p className="loading-text">Buscando a @{username}...</p>
        )}
      </div>
    </main>
  );
}
