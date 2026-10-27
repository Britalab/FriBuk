import { parseBlock, parseInline } from "../../utils/richText";

// Texto de un párrafo con su negrita, cursiva y subrayado (ver
// utils/richText.js). La alineación y la lista las aplica quien lo contiene;
// aquí solo se quitan sus marcas. El contenido siempre se escribe como
// texto: nunca como HTML.
export default function FormattedText({ text }) {
  return parseInline(parseBlock(text).text).map((segment, index) => {
    let content = segment.text;

    if (segment.italic) content = <em>{content}</em>;
    if (segment.bold) content = <strong>{content}</strong>;
    if (segment.underline) content = <u>{content}</u>;

    return segment.bold || segment.italic || segment.underline
      ? <span key={index}>{content}</span>
      : content;
  });
}
