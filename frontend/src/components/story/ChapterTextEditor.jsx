import { Suspense, lazy } from "react";

// El editor (y su librería) se descarga solo en las páginas donde se
// escribe: el resto del sitio no carga ese peso.
const RichTextEditor = lazy(() => import("./RichTextEditor"));

// Texto de un capítulo o de la descripción de una historia, con formato
// como en Word (ver RichTextEditor y utils/richText.js).
export default function ChapterTextEditor({ help = true, ...props }) {
  return (
    <div className="chapter-text-editor">
      <Suspense fallback={<div className="rich-text-editor is-loading">Cargando el editor...</div>}>
        <RichTextEditor {...props} />
      </Suspense>

      {help && (
        <p className="form-help">
          Selecciona el texto y usa los botones de arriba, como en Word. Al pegar
          desde Word se conservan la negrita, la cursiva, el subrayado, la
          alineación y las listas.
        </p>
      )}
    </div>
  );
}
