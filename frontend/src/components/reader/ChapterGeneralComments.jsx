import { useState } from "react";
import { Link } from "react-router-dom";
import { CommentForm, CommentThread } from "./ChapterCommentsPanel";

// Apartado al final del capítulo para comentarlo completo, sin apuntar a
// un párrafo.
export default function ChapterGeneralComments({
  threads,
  repliesByParent,
  isAuthenticated,
  actions,
}) {
  // Cambia tras publicar para dejar el formulario vacío otra vez.
  const [formKey, setFormKey] = useState(0);
  const total = threads.reduce(
    (sum, thread) => sum + 1 + (repliesByParent.get(thread.id)?.length || 0),
    0
  );

  return (
    <section className="reader-general-comments" aria-labelledby="reader-general-title">
      <h2 id="reader-general-title">
        ¿Qué te pareció este capítulo?
        {total > 0 && <span className="reader-comments-total">{total}</span>}
      </h2>

      {isAuthenticated ? (
        <CommentForm
          key={formKey}
          label="Tu comentario sobre este capítulo"
          placeholder="Cuenta qué sentiste al leerlo..."
          submitLabel="Publicar"
          autoFocus={false}
          onSubmit={async (content) => {
            await actions.createGeneralComment(content);
            setFormKey((current) => current + 1);
          }}
        />
      ) : (
        <p className="reader-comments-note">
          <Link to="/login">Inicia sesión</Link> para dejar tu comentario.
        </p>
      )}

      {threads.length === 0 ? (
        <p className="reader-comments-note">
          Todavía nadie comentó este capítulo.
        </p>
      ) : (
        <div className="reader-general-list">
          {threads.map((thread) => (
            <CommentThread
              key={thread.id}
              comment={thread}
              replies={repliesByParent.get(thread.id) || []}
              actions={actions}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      )}
    </section>
  );
}
