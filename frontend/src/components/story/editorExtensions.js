// Lo que admite el editor visual (ver RichTextEditor.jsx).

import { Extension } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { docToText } from "../../utils/richTextDoc";

// Listas de un solo nivel: Tab dentro de una lista no la anida (al guardar
// no podría conservarse) y fuera de ella deja pasar al siguiente campo.
// Mayús+Enter hace lo mismo que Enter: cada línea es un párrafo.
const SimpleLines = Extension.create({
  name: "simpleLines",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => editor.isActive("listItem"),
      "Shift-Tab": ({ editor }) => editor.isActive("listItem"),
      "Shift-Enter": ({ editor }) => editor.commands.keyboardShortcut("Enter"),
    };
  },
});

// Límite de caracteres del texto tal como se guarda. Siempre deja borrar,
// aunque el texto ya pase del límite.
const MaxTextLength = Extension.create({
  name: "maxTextLength",
  addOptions() {
    return { limit: null };
  },
  addProseMirrorPlugins() {
    const { limit } = this.options;
    if (!limit) return [];
    const length = (doc) => docToText(doc.toJSON()).length;

    return [
      new Plugin({
        filterTransaction(transaction, state) {
          if (!transaction.docChanged) return true;
          const next = length(transaction.doc);
          return next <= limit || next <= length(state.doc);
        },
      }),
    ];
  },
});

// También la usan las pruebas, para pegar con el mismo editor.
export function editorExtensions({ placeholder = "", maxLength = null } = {}) {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      link: false,
      strike: false,
      trailingNode: false,
    }),
    TextAlign.configure({
      types: ["paragraph"],
      alignments: ["left", "center", "right", "justify"],
    }),
    Placeholder.configure({ placeholder }),
    SimpleLines,
    MaxTextLength.configure({ limit: maxLength }),
  ];
}
