-- ============================================================
-- Consejos para escribir, de tía FriBuk (/consejos)
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- Después, cargar el contenido inicial con consejos_contenido.sql.
-- ============================================================

-- Un consejo por fila. Solo la cuenta admin los crea y edita, desde el
-- sitio (/consejos); los borradores no los ve nadie más.
create table public.writing_tips (
    id           uuid        not null default gen_random_uuid(),
    -- Dirección del consejo: /consejos/<slug>.
    slug         text        not null,
    -- Orden en el índice (y número que se muestra: 01, 02...).
    position     smallint    not null default 0,
    title        text        not null,
    -- Para Google y al compartir el enlace.
    description  text        not null default '',
    -- Texto corto de la tarjeta del índice.
    summary      text        not null default '',
    -- Imagen de tía FriBuk (public/tia-fribuk/tia-fribuk-<pose>.webp).
    pose         text        not null default 'retrato',
    -- [{"heading": "...", "text": "..."}]; el texto con el formato del
    -- editor de capítulos (ver frontend/src/utils/richText.js).
    sections     jsonb       not null default '[]'::jsonb,
    status       text        not null default 'draft',
    published_at date,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint writing_tips_pkey primary key (id),
    constraint writing_tips_slug_key unique (slug),

    constraint writing_tips_slug_valid
        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),

    constraint writing_tips_status_valid
        check (status in ('draft', 'published')),

    constraint writing_tips_sections_is_list
        check (jsonb_typeof(sections) = 'array')
);

comment on table public.writing_tips is
    'Consejos para escribir de tía FriBuk. Los edita solo la cuenta admin.';

-- Solo el backend (service role) la usa: sin políticas, nadie más la lee.
alter table public.writing_tips enable row level security;
