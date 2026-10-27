import FormattedText from "./FormattedText";
import { blockAttributes, listNumbers } from "../../utils/richText";

// Texto de varios párrafos con todo su formato: alineación, listas,
// negrita, cursiva y subrayado. Por ejemplo, la descripción de una historia.
export default function FormattedBlocks({ text, className }) {
  const lines = String(text ?? "").split("\n");
  const numbers = listNumbers(lines);

  return (
    <div className={className}>
      {lines.map((line, index) => {
        const block = blockAttributes(line, numbers[index]);
        return (
          <p
            key={index}
            className={["rich-paragraph", block.className].filter(Boolean).join(" ")}
            style={block.style}
            data-number={block.number}
          >
            <FormattedText text={line} />
          </p>
        );
      })}
    </div>
  );
}
