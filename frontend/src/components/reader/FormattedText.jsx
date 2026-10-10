import { parseInline } from "../../utils/richText";

// Texto de un capítulo con su negrita y cursiva (ver utils/richText.js).
// El contenido siempre se escribe como texto: nunca como HTML.
export default function FormattedText({ text }) {
  return parseInline(text).map((segment, index) => {
    let content = segment.text;

    if (segment.italic) content = <em>{content}</em>;
    if (segment.bold) content = <strong>{content}</strong>;

    return segment.bold || segment.italic
      ? <span key={index}>{content}</span>
      : content;
  });
}
