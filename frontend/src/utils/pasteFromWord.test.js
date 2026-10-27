import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { wordListsToHtml } from "./pasteFromWord";
import { editorExtensions } from "../components/story/editorExtensions";
import { docToText } from "./richTextDoc";

// Así copia Word de escritorio un punto de lista: un párrafo con la
// viñeta (o el número) escrita como texto.
const wordItem = (marker, text, font = "Symbol") =>
  "<p class=MsoListParagraphCxSpMiddle style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'>" +
  "<!--[if !supportLists]-->" +
  `<span style='font-family:${font}'><span style='mso-list:Ignore'>${marker}` +
  "<span style='font:7.0pt \"Times New Roman\"'>&nbsp;&nbsp;&nbsp; </span></span></span>" +
  `<!--[endif]-->${text}</p>`;

const paste = (html) => {
  const editor = new Editor({ extensions: editorExtensions(), content: "" });
  editor.commands.insertContent(wordListsToHtml(html));
  const text = docToText(editor.getJSON());
  editor.destroy();
  return text;
};

describe("wordListsToHtml", () => {
  it("convierte las viñetas de Word en una lista", () => {
    expect(
      paste(
        "<p class=MsoNormal>Mochila:</p>" +
          wordItem("·", "Pan") +
          wordItem("·", "<b>Leche</b>") +
          "<p class=MsoNormal>Fin</p>"
      )
    ).toBe("Mochila:\n[•]Pan\n[•]**Leche**\nFin");
  });

  it("convierte las listas numeradas de Word", () => {
    expect(paste(wordItem("1.", "Uno", "Calibri") + wordItem("2.", "Dos", "Calibri"))).toBe(
      "[#]Uno\n[#]Dos"
    );
  });

  it("no toca lo que no viene de una lista de Word", () => {
    const html = "<p>Hola</p><ul><li>uno</li></ul>";
    expect(wordListsToHtml(html)).toBe(html);
  });
});
