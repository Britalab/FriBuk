import { useEffect, useState } from "react";

const SEEN_KEY = "fribuk-comment-hint-seen";

function alreadySeen() {
  try {
    return Boolean(localStorage.getItem(SEEN_KEY));
  } catch {
    // Si el navegador no deja guardarlo, no se muestra, para no repetirlo
    // en cada capítulo.
    return true;
  }
}

// Globito que enseña a comentar un párrafo. Sale una sola vez por
// navegador: en cuanto aparece queda marcado como visto, aunque se cierre
// sin leerlo. Se monta solo en capítulos que admiten comentarios.
export default function ReaderCommentHint({ dismissed }) {
  const [visible, setVisible] = useState(() => !alreadySeen());

  useEffect(() => {
    if (!visible) return;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Sin almacenamiento no hay nada que recordar.
    }
  }, [visible]);

  // Al comentar un párrafo, el globito ya cumplió.
  if (visible && dismissed) setVisible(false);

  if (!visible) return null;

  return (
    <div className="reader-comment-hint" role="status">
      <span className="reader-comment-hint-icon" aria-hidden="true">💬</span>
      <p>
        <span className="reader-comments-hint-mouse">
          ¿Algo te hizo reír, llorar o gritar? Haz doble clic en un párrafo para comentarlo.
        </span>
        <span className="reader-comments-hint-touch">
          ¿Algo te hizo reír, llorar o gritar? Toca dos veces un párrafo para comentarlo.
        </span>
      </p>
      <button
        type="button"
        className="reader-comment-hint-close"
        onClick={() => setVisible(false)}
        aria-label="Cerrar aviso"
      >
        ×
      </button>
    </div>
  );
}
