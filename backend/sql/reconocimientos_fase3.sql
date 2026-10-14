-- ============================================================
-- Reconocimientos (fase 3): Descubridor de Historias
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- reconocimientos_fase2.sql. No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cuántos lectores tenía el autor cuando alguien recomendó su historia
-- ------------------------------------------------------------

create table public.recommendation_snapshots (
    user_id         uuid        not null,
    story_id        uuid        not null,
    author_id       uuid        not null,
    author_readers  integer     not null,
    created_at      timestamptz not null default now(),

    constraint recommendation_snapshots_pkey
        primary key (user_id, story_id),

    constraint recommendation_snapshots_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint recommendation_snapshots_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade,

    constraint recommendation_snapshots_author_id_fkey
        foreign key (author_id)
        references auth.users (id)
        on delete cascade
);

comment on table public.recommendation_snapshots is
    'Lectores únicos del autor al momento de cada recomendación (Descubridor). Solo escribe el backend con service role.';

create index recommendation_snapshots_author_idx
    on public.recommendation_snapshots (author_id);

-- ------------------------------------------------------------
-- 2. RLS activado y sin políticas; permisos solo para el backend
-- ------------------------------------------------------------

alter table public.recommendation_snapshots enable row level security;

revoke all on table public.recommendation_snapshots from anon, authenticated;

grant select, insert, update, delete
    on table public.recommendation_snapshots
    to service_role;
