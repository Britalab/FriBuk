import { useEffect, useState } from "react";
import api from "../../api/client";
import "../../styles/moderation.css";

// Aviso de retiro que ve quien publicó el contenido (o un administrador):
// el motivo general, nunca quién reportó ni cuántos reportes hubo.
export function ModerationNotice({ moderation, children }) {
  if (!moderation?.removed) return null;

  return (
    <div className="moderation-notice" role="status">
      <strong>Contenido retirado</strong>
      <p>
        {moderation.message || "Este contenido fue retirado por moderación."}
        {moderation.automatic &&
          " El retiro fue automático y queda pendiente de revisión."}
      </p>
      {children}
    </div>
  );
}

// Lista de avisos de moderación del usuario con sesión, para «Mi perfil».
// Si no hay nada retirado (o la consulta falla), no muestra nada.
export function MyModerationNotices() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    let isActive = true;

    api
      .get("/me/moderation")
      .then((response) => {
        if (isActive) setNotices(response.data.notices || []);
      })
      .catch((error) => {
        console.error("Error al cargar los avisos de moderación:", error);
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <section className="moderation-notice" aria-label="Avisos de moderación">
      <strong>Avisos de moderación</strong>
      <ul>
        {notices.map((notice) => (
          <li key={notice.id}>
            {notice.message}
            {notice.title && notice.target_type !== "avatar" &&
              notice.target_type !== "profile_banner" && (
                <span> («{notice.title}»)</span>
              )}
          </li>
        ))}
      </ul>
      <p>
        Si crees que fue un error, escríbenos desde el Centro de ayuda. Puedes
        subir otra imagen que cumpla las normas.
      </p>
    </section>
  );
}
