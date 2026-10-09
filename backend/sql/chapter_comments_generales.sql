-- ============================================================
-- Comentarios generales de un capitulo ("¿Que te parecio este
-- capitulo?"): comentarios que no apuntan a un parrafo.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ningun comentario existente: solo amplia la regla
-- que valida como se guarda un comentario.
-- ============================================================

alter table public.chapter_comments
    drop constraint chapter_comments_anchor_valid;

-- Un comentario es valido en una de dos formas:
--   1. Sin parrafo: una respuesta (parent_id) o un comentario general
--      del capitulo.
--   2. Con parrafo: un comentario principal anclado al texto.
alter table public.chapter_comments
    add constraint chapter_comments_anchor_valid
    check (
        (
            paragraph_index is null
            and start_offset is null
            and end_offset is null
            and quote is null
        )
        or
        (
            parent_id is null
            and paragraph_index is not null
            and start_offset is not null
            and end_offset is not null
            and quote is not null
            and prefix is not null
            and suffix is not null
            and paragraph_index >= 0
            and start_offset >= 0
            and end_offset > start_offset
            and char_length(quote) between 1 and 600
        )
    );

comment on column public.chapter_comments.paragraph_index is
    'Parrafo del capitulo (indice al separar el contenido por saltos de linea). Nulo en las respuestas y en los comentarios generales del capitulo.';
