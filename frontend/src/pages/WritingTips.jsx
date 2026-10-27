import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import SiteFooter from "../components/SiteFooter";
import TiaFribuk from "../components/tips/TiaFribuk";
import WritingTipsInvite from "../components/tips/WritingTipsInvite";
import { TIPS_AUTHOR, tipNumber } from "../data/consejos";
import { useAuth } from "../context/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";
import "../styles/writing-tips.css";

// Índice de los consejos para escribir (/consejos). Cada tarjeta lleva a su
// artículo completo (WritingTip). La cuenta admin ve también los borradores
// y los enlaces para editar.
export default function WritingTips() {
  usePageTitle("Consejos para escribir");
  const { user } = useAuth();
  const [state, setState] = useState({ status: "loading", tips: [], canEdit: false });

  useEffect(() => {
    let cancelled = false;
    api
      .get("/tips")
      .then((response) => {
        if (cancelled) return;
        setState({
          status: "ready",
          tips: response.data.tips || [],
          canEdit: Boolean(response.data.can_edit),
        });
      })
      .catch((error) => {
        console.error("Error al cargar los consejos:", error);
        if (!cancelled) setState({ status: "error", tips: [], canEdit: false });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const { status, tips, canEdit } = state;

  return (
    <main className="writing-tips-page">
      <section className="writing-tips-header">
        <div className="writing-tips-header-text">
          <span className="writing-tips-kicker">✦ Consejos para escribir</span>

          <h1>Ideas para darle vida a tus historias</h1>

          <p className="writing-tips-tagline">
            Consejos de escritura con un poco de sarcasmo y mucha experiencia,
            de {TIPS_AUTHOR}.
          </p>

          <p>
            A veces una pequeña idea es todo lo que necesitas para empezar.
            Aquí encontrarás algunos consejos para escribir, crear personajes
            y poner a volar tu imaginación.
          </p>

          <p>
            Si tienes sugerencias para agregar, puedes expresarlas en
            nuestro <Link to="/forum">foro</Link>. Podemos agregarlas al blog
            y te damos el crédito por ello. ¡Todas las ideas son bienvenidas!
          </p>

          {canEdit && (
            <Link to="/consejos/nuevo" className="writing-tips-cta writing-tips-admin-new">
              ＋ Nuevo consejo
            </Link>
          )}
        </div>

        <TiaFribuk pose="retrato" variant="figure" alt="Tía FriBuk, con su regla" className="writing-tips-hero" />
      </section>

      <section className="writing-tips-list" aria-label="Consejos" aria-busy={status === "loading"}>
        {status === "loading" && <p className="writing-tips-state">Cargando consejos...</p>}

        {status === "error" && (
          <p className="writing-tips-state" role="alert">
            No pudimos cargar los consejos. Intenta nuevamente en un momento.
          </p>
        )}

        {status === "ready" && tips.length === 0 && (
          <p className="writing-tips-state">Muy pronto, los primeros consejos de {TIPS_AUTHOR}.</p>
        )}

        {tips.map((tip) => (
          <div className="writing-tip-card-wrap" key={tip.id}>
            <Link to={`/consejos/${tip.slug}`} className="writing-tip-card">
              <div className="writing-tip-side">
                <TiaFribuk pose={tip.pose} />
                <span className="writing-tip-number" aria-hidden="true">{tipNumber(tip.position)}</span>
              </div>

              <div className="writing-tip-content">
                {tip.status === "draft" && <span className="writing-tip-draft">Borrador</span>}
                <h2>{tip.title}</h2>
                <p>{tip.summary}</p>
                <span className="writing-tip-more">Leer consejo →</span>
              </div>
            </Link>

            {canEdit && (
              <Link to={`/consejos/editar/${tip.slug}`} className="writing-tip-edit">
                ✏️ Editar
              </Link>
            )}
          </div>
        ))}
      </section>

      <WritingTipsInvite user={user} />

      <SiteFooter />
    </main>
  );
}
