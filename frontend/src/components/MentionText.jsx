import { Link } from "react-router-dom";
import { splitMentions } from "../utils/mentions";

// Texto de un comentario, con las menciones (@nombre) como enlaces al
// perfil. El contenido siempre se escribe como texto: nunca como HTML.
export default function MentionText({ text }) {
  return splitMentions(text).map((piece, index) => (
    piece.username ? (
      <Link
        key={index}
        to={`/u/${encodeURIComponent(piece.username)}`}
        className="mention-link"
      >
        {piece.text}
      </Link>
    ) : (
      piece.text
    )
  ));
}
