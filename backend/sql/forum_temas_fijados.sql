-- ============================================================
-- Temas fijados del foro (anuncios de la administracion).
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ningun tema existente: solo agrega una columna,
-- vacia en todos los temas actuales.
-- ============================================================

alter table public.forum_topics
    add column if not exists pinned_at timestamptz;

comment on column public.forum_topics.pinned_at is
    'Momento en que un administrador fijo el tema como anuncio. Nulo en los temas normales. Los fijados van primero en el foro.';
