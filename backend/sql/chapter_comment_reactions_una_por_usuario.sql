-- ============================================================
-- Ajuste de chapter_comment_reactions
--
-- SOLO es necesario si la tabla ya se creo con la columna "slot"
-- (version anterior de chapter_comments.sql, que permitia hasta
-- 12 reacciones por usuario y comentario).
--
-- Deja la tabla con UNA reaccion por usuario y comentario.
-- No toca chapter_comments ni ninguna otra tabla.
-- En una instalacion nueva no hace falta: basta chapter_comments.sql.
-- ============================================================

begin;

-- Si un usuario tuviera varias reacciones en un comentario,
-- se conserva solo la mas reciente.
delete from public.chapter_comment_reactions as older
using public.chapter_comment_reactions as newer
where older.comment_id = newer.comment_id
  and older.user_id = newer.user_id
  and (older.created_at, older.slot) < (newer.created_at, newer.slot);

alter table public.chapter_comment_reactions
    drop constraint chapter_comment_reactions_pkey;

alter table public.chapter_comment_reactions
    drop constraint chapter_comment_reactions_slot_valid;

alter table public.chapter_comment_reactions
    drop column slot;

alter table public.chapter_comment_reactions
    add constraint chapter_comment_reactions_pkey
    primary key (comment_id, user_id);

comment on column public.chapter_comment_reactions.reaction is
    'Reaccion elegida por el usuario. Elegir otra reemplaza la anterior.';

commit;
