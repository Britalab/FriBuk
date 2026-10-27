import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import SiteFooter from "../components/SiteFooter";
import FormattedBlocks from "../components/reader/FormattedBlocks";
import TiaFribuk from "../components/tips/TiaFribuk";
import WritingTipsInvite from "../components/tips/WritingTipsInvite";
import { TIPS_AUTHOR, formatTipDate, tipNumber } from "../data/consejos";
import { useAuth } from "../context/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";
import NotFound from "./NotFound";
import "../styles/writing-tips.css";

// Cantidad de consejos sugeridos al final de cada artículo.
const MORE_TIPS = 3;

// Los siguientes consejos de la lista, volviendo al inicio al llegar al final.
function nextTips(tips, current) {
  const index = tips.findIndex((tip) => tip.id === current.id);
  const others = tips.length - 1;
  return Array.from(
    { length: Math.max(0, Math.min(MORE_TIPS, others)) },
    (_, offset) => tips[(index + offset + 1) % tips.length]
  );
}

// Un consejo completo: /consejos/:slug.
export default function WritingTip() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ status: "loading", slug: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/tips/${encodeURIComponent(slug)}`), api.get("/tips")])
      .then(([tipResponse, listResponse]) => {
        if (cancelled) return;
        setState({
          status: "ready",
          slug,
          tip: tipResponse.data.tip,
          canEdit: Boolean(tipResponse.data.can_edit),
          tips: listResponse.data.tips || [],
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.response?.status === 404) {
          setState({ status: "missing", slug });
        } else {
          console.error("Error al cargar el consejo:", error);
          setState({ status: "error", slug });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, user?.id]);

  // Mientras llega otro consejo, no se muestra el anterior.
  const status = state.slug === slug ? state.status : "loading";
  const { tip, tips, canEdit } = state;
  usePageTitle(status === "ready" ? tip.title : "Consejos para escribir");

  if (status === "missing") return <NotFound />;

  if (status !== "ready") {
    return (
      <main className="writing-tips-page">
        <p className="writing-tips-state" role={status === "error" ? "alert" : undefined}>
          {status === "error"
            ? "No pudimos cargar este consejo. Intenta nuevamente en un momento."
            : "Cargando consejo..."}
        </p>
      </main>
    );
  }

  const sections = tip.sections?.length ? tip.sections : [{ text: tip.summary }];
  const more = nextTips(tips, tip);

  return (
    <main className="writing-tips-page">
      <article className="writing-tip-article">
        <div className="writing-tip-toolbar">
          <Link to="/consejos" className="writing-tip-back">
            ← Todos los consejos
          </Link>

          {canEdit && (
            <Link to={`/consejos/editar/${tip.slug}`} className="writing-tip-edit">
              ✏️ Editar
            </Link>
          )}
        </div>

        <header className="writing-tip-article-header">
          <div>
            <span className="writing-tips-kicker">
              Consejo {tipNumber(tip.position)}
              {tip.status === "draft" && <span className="writing-tip-draft">Borrador</span>}
            </span>
            <h1>{tip.title}</h1>
            <p className="writing-tip-byline">
              <TiaFribuk pose="retrato" className="writing-tip-byline-avatar" />
              <span>
                Por <strong>{TIPS_AUTHOR}</strong>
                {tip.published_at && (
                  <>
                    {" · "}
                    <time dateTime={tip.published_at}>{formatTipDate(tip.published_at)}</time>
                  </>
                )}
              </span>
            </p>
          </div>

          <TiaFribuk pose={tip.pose} variant="figure" className="writing-tip-figure" />
        </header>

        {sections.map((section, index) => (
          <section className="writing-tip-section" key={`${index}-${section.heading}`}>
            {section.heading && <h2>{section.heading}</h2>}
            <FormattedBlocks text={section.text} className="writing-tip-text" />
          </section>
        ))}

        <WritingTipsInvite user={user} compact />
      </article>

      {more.length > 0 && (
        <section className="writing-tip-more-list" aria-labelledby="more-tips-title">
          <h2 id="more-tips-title">Más consejos de {TIPS_AUTHOR}</h2>
          <div className="writing-tip-more-grid">
            {more.map((other) => (
              <Link to={`/consejos/${other.slug}`} className="writing-tip-mini" key={other.id}>
                <TiaFribuk pose={other.pose} />
                <span>{other.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}
