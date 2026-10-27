import { Link } from "react-router-dom";
import TiaFribuk from "./TiaFribuk";
import { TIPS_AUTHOR } from "../../data/consejos";

// Invitación a escribir, con tía FriBuk. También va al final de cada consejo.
export default function WritingTipsInvite({ user, compact = false }) {
  return (
    <section className={`writing-tips-footer${compact ? " is-compact" : ""}`}>
      <TiaFribuk pose="sonrie" className="writing-tips-footer-avatar" />

      <div>
        <h2>Ahora te toca escribir ✍️</h2>

        <blockquote className="writing-tips-quote">
          «No es solo una historia, es tu historia. Haz que valga la pena.»
          <cite>— {TIPS_AUTHOR}</cite>
        </blockquote>

        <Link to={user ? "/create-story" : "/register"} className="writing-tips-cta">
          {user ? "Empezar mi historia" : "Crear mi cuenta y empezar"}
        </Link>
      </div>
    </section>
  );
}
