import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-container">

        <p className="not-found-eyebrow">
          FRI­BUK
        </p>

        <div className="not-found-number">
          404
        </div>

        <h1>
          Parece que esta página se perdió.
        </h1>

        <p className="not-found-text">
          La página que buscas no existe, fue movida o quizás
          tomó otro camino. Pero no te preocupes, todavía
          podemos llevarte de vuelta a FriBuk.
        </p>

            <div className="not-found-image">
                <img
                    src="/404.jpg"
                    alt="Tres gatitos de FriBuk"
                    className="not-found-image-real"
                />
            </div>

        <Link to="/" className="not-found-button">
          Volver a explorar
          <span>→</span>
        </Link>

      </div>
    </main>
  );
}

