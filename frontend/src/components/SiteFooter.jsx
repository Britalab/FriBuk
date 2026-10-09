import { NavLink } from "react-router-dom";

const FOOTER_COLUMNS = [
  {
    title: "Información",
    links: [
      { to: "/terminos", label: "Términos y Condiciones" },
      { to: "/privacidad", label: "Política de Privacidad" },
      { to: "/contenido", label: "Política de Contenido" }
    ]
  },
  {
    title: "Comunidad",
    links: [
      { to: "/comunidad", label: "Normas de Comunidad" },
      { to: "/moderacion", label: "Política de Moderación" },
      { to: "/derechos-autor", label: "Derechos de Autor" }
    ]
  },
  {
    title: "Ayuda",
    links: [
      { to: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
      { to: "/support", label: "Centro de ayuda" }
    ]
  }
];

export default function SiteFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer-content">

        <div className="home-footer-brand">
          <strong>FriBuk</strong>
          <span>
            Lee, escribe y descubre nuevas historias.
          </span>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <nav
            key={column.title}
            className="home-footer-column"
            aria-label={column.title}
          >
            <h3>{column.title}</h3>

            <ul>
              {column.links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end
                    className="home-footer-link"
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}

      </div>

      <div className="home-footer-bottom">
        <span>
          © {new Date().getFullYear()} FriBuk. Todos los derechos reservados.
        </span>

        <span className="home-footer-credit">
          Personaliza tu perfil con nuestros emojis, cortesía de{" "}
          <a href="https://openmoji.org/" target="_blank" rel="noreferrer">
            OpenMoji
          </a>
          , el proyecto de emojis e iconos de código abierto. Licencia:{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-SA 4.0
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
