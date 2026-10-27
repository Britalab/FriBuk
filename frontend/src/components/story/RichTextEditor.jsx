import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { editorExtensions } from "./editorExtensions";
import { docToText, textToDoc } from "../../utils/richTextDoc";
import { wordListsToHtml } from "../../utils/pasteFromWord";

// Editor visual, como Word, para capítulos y descripciones. Lo escrito se
// guarda como texto con marcas (ver utils/richText.js): solo admite lo que
// esas marcas pueden guardar. Al pegar desde Word se conserva la negrita,
// la cursiva, el subrayado, la alineación y las listas; lo demás queda como
// texto normal.

function Icon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ALIGN_ICONS = {
  left: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  center: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  right: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  justify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
};

const ALIGN_LABELS = {
  left: ["Alinear a la izquierda", "Ctrl+Mayús+L"],
  center: ["Centrar", "Ctrl+Mayús+E"],
  right: ["Alinear a la derecha", "Ctrl+Mayús+R"],
  justify: ["Justificar", "Ctrl+Mayús+J"],
};

function ToolButton({ label, shortcut, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      className={`rich-text-tool${active ? " is-active" : ""}`}
      // Mantiene la selección del texto al pulsar el botón.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active === undefined ? undefined : active}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 20,
  maxLength = null,
}) {
  // Último texto enviado hacia afuera: si `value` cambia por otra razón
  // (por ejemplo, termina de cargar el capítulo), se vuelve a cargar.
  const lastValue = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: editorExtensions({ placeholder, maxLength }),
    content: textToDoc(value),
    editorProps: {
      // Las listas de Word llegan como párrafos: se vuelven listas.
      transformPastedHTML: wordListsToHtml,
      attributes: {
        id,
        class: "rich-text-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
        style: `min-height: ${Math.max(rows, 3) * 1.7}em`,
      },
    },
    onUpdate: ({ editor: current }) => {
      const text = docToText(current.getJSON());
      lastValue.current = text;
      onChangeRef.current(text);
    },
  });

  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    editor.commands.setContent(textToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const alignment =
        ["center", "right", "justify"].find((align) => current.isActive({ textAlign: align })) ||
        "left";
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        alignment,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  if (!editor || !state) return <div className="rich-text-editor is-loading" />;

  const run = (command) => command(editor.chain().focus()).run();

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Formato del texto">
        <div className="rich-text-group">
          <ToolButton
            label="Negrita"
            shortcut="Ctrl+B"
            active={state.bold}
            onClick={() => run((chain) => chain.toggleBold())}
          >
            <strong aria-hidden="true">N</strong>
          </ToolButton>
          <ToolButton
            label="Cursiva"
            shortcut="Ctrl+I"
            active={state.italic}
            onClick={() => run((chain) => chain.toggleItalic())}
          >
            <em aria-hidden="true">K</em>
          </ToolButton>
          <ToolButton
            label="Subrayado"
            shortcut="Ctrl+U"
            active={state.underline}
            onClick={() => run((chain) => chain.toggleUnderline())}
          >
            <u aria-hidden="true">S</u>
          </ToolButton>
        </div>

        <div className="rich-text-group">
          {Object.entries(ALIGN_ICONS).map(([align, icon]) => (
            <ToolButton
              key={align}
              label={ALIGN_LABELS[align][0]}
              shortcut={ALIGN_LABELS[align][1]}
              active={state.alignment === align}
              onClick={() => run((chain) => chain.setTextAlign(align))}
            >
              <Icon>{icon}</Icon>
            </ToolButton>
          ))}
        </div>

        <div className="rich-text-group">
          <ToolButton
            label="Viñetas"
            shortcut="Ctrl+Mayús+8"
            active={state.bulletList}
            onClick={() => run((chain) => chain.toggleBulletList())}
          >
            <Icon>
              <path d="M9 6h11M9 12h11M9 18h11" />
              <circle cx="4.5" cy="6" r="1" fill="currentColor" />
              <circle cx="4.5" cy="12" r="1" fill="currentColor" />
              <circle cx="4.5" cy="18" r="1" fill="currentColor" />
            </Icon>
          </ToolButton>
          <ToolButton
            label="Lista numerada"
            shortcut="Ctrl+Mayús+7"
            active={state.orderedList}
            onClick={() => run((chain) => chain.toggleOrderedList())}
          >
            <Icon>
              <path d="M10 6h10M10 12h10M10 18h10" />
              <path d="M4 5h1.5v4M4 9h3" strokeWidth="1.6" />
              <path d="M4 14.5a1.5 1.5 0 0 1 3 0c0 1.2-3 2-3 3.5h3" strokeWidth="1.6" />
            </Icon>
          </ToolButton>
        </div>

        <div className="rich-text-group">
          <ToolButton
            label="Deshacer"
            shortcut="Ctrl+Z"
            disabled={!state.canUndo}
            onClick={() => run((chain) => chain.undo())}
          >
            <Icon>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </Icon>
          </ToolButton>
          <ToolButton
            label="Rehacer"
            shortcut="Ctrl+Y"
            disabled={!state.canRedo}
            onClick={() => run((chain) => chain.redo())}
          >
            <Icon>
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </Icon>
          </ToolButton>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
