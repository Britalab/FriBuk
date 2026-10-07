-- ============================================================
-- Progreso de lectura: donde quedo cada lector en cada historia
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Una fila por lector e historia
-- ------------------------------------------------------------

create table public.reading_progress (
    user_id         uuid        not null,
    story_id        uuid        not null,
    chapter_id      uuid        not null,
    paragraph_index integer     not null default 0,
    updated_at      timestamptz not null default now(),

    constraint reading_progress_pkey
        primary key (user_id, story_id),

    constraint reading_progress_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint reading_progress_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade,

    constraint reading_progress_chapter_id_fkey
        foreign key (chapter_id)
        references public.chapters (id)
        on delete cascade,

    constraint reading_progress_paragraph_valid
        check (paragraph_index >= 0)
);

comment on table public.reading_progress is
    'Ultimo punto de lectura de cada lector en cada historia. Solo escribe el backend con service role.';

comment on column public.reading_progress.chapter_id is
    'Capitulo que el lector estaba leyendo.';

comment on column public.reading_progress.paragraph_index is
    'Parrafo del capitulo (indice al separar el contenido por saltos de linea) que quedo arriba en la pantalla.';

create index reading_progress_recent_idx
    on public.reading_progress (user_id, updated_at desc);

-- ------------------------------------------------------------
-- 2. RLS: activado y sin politicas (sin acceso desde el navegador)
-- ------------------------------------------------------------

alter table public.reading_progress enable row level security;

-- ------------------------------------------------------------
-- 3. Permisos: solo el backend (service role)
-- ------------------------------------------------------------

revoke all on table public.reading_progress from anon;
revoke all on table public.reading_progress from authenticated;

grant select, insert, update, delete
    on table public.reading_progress
    to service_role;
