import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";
import { FAQ } from "../data/faq";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Faq() {
  usePageTitle("Preguntas frecuentes");

  return (
    <div className="legal-page">
      <div className="legal-container">

        <Link to="/" className="legal-back">
          ← Volver a FriBuk
        </Link>

        <header className="legal-header">
          <span className="legal-label">AYUDA</span>
          <h1>Preguntas frecuentes</h1>
        </header>

        <div className="legal-intro">
          <p>
            Lo que más nos preguntan sobre leer y publicar en{" "}
            <strong>FriBuk</strong>. Si no encuentras tu respuesta, escríbenos
            al <Link to="/support">Centro de ayuda</Link>.
          </p>
        </div>

        {FAQ.map((item) => (
          <section className="legal-section" key={item.question}>
            <h2>{item.question}</h2>

            <p>{item.answer}</p>

            {item.link && (
              <p>
                <Link to={item.link.to}>{item.link.label} →</Link>
              </p>
            )}
          </section>
        ))}

      </div>

      <SiteFooter />
    </div>
  );
}
