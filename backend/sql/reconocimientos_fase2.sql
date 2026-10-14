-- ============================================================
-- Reconocimientos (fase 2): registro de lecturas y lectores
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- reconocimientos.sql. No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lectura de cada capítulo por cada lector
-- ------------------------------------------------------------

create table public.chapter_reads (
    user_id        uuid        not null,
    chapter_id     uuid        not null,
    story_id       uuid        not null,
    seconds_read   integer     not null default 0,
    first_read_at  timestamptz not null default now(),
    last_read_at   timestamptz not null default now(),
    -- Llegó al final del capítulo tras leerlo un tiempo razonable.
    completed_at   timestamptz,
    -- Leyó 10 minutos o el capítulo completo: puede ser Primer Lector.
    qualified_at   timestamptz,

    constraint chapter_reads_pkey
        primary key (user_id, chapter_id),

    constraint chapter_reads_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint chapter_reads_chapter_id_fkey
        foreign key (chapter_id)
        references public.chapters (id)
        on delete cascade,

    constraint chapter_reads_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade,

    constraint chapter_reads_seconds_valid
        check (seconds_read >= 0)
);

comment on table public.chapter_reads is
    'Tiempo de lectura de cada lector en cada capítulo. Solo escribe el backend con service role.';

create index chapter_reads_story_idx
    on public.chapter_reads (story_id);

-- ------------------------------------------------------------
-- 2. Días de lectura (Lector Fiel y lectores únicos del mes)
-- ------------------------------------------------------------

create table public.reading_activity (
    user_id   uuid    not null,
    story_id  uuid    not null,
    day       date    not null,
    seconds   integer not null default 0,

    constraint reading_activity_pkey
        primary key (user_id, story_id, day),

    constraint reading_activity_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint reading_activity_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade
);

comment on table public.reading_activity is
    'Qué historias leyó cada lector cada día (UTC). Solo escribe el backend con service role.';

create index reading_activity_day_idx
    on public.reading_activity (day);

-- ------------------------------------------------------------
-- 3. Primer Lector: el primer comentario válido de cada capítulo
-- ------------------------------------------------------------

create table public.first_reader_claims (
    chapter_id  uuid        primary key,
    user_id     uuid        not null,
    comment_id  uuid,
    claimed_at  timestamptz not null default now(),

    constraint first_reader_claims_chapter_id_fkey
        foreign key (chapter_id)
        references public.chapters (id)
        on delete cascade,

    constraint first_reader_claims_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade
);

create index first_reader_claims_user_idx
    on public.first_reader_claims (user_id);

-- ------------------------------------------------------------
-- 4. Autor Popular: top 10 de cada mes, calculado al terminar el mes
-- ------------------------------------------------------------

create table public.popular_authors (
    month    date    not null,
    user_id  uuid    not null,
    rank     smallint not null,
    readers  integer not null,

    constraint popular_authors_pkey
        primary key (month, user_id),

    constraint popular_authors_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint popular_authors_rank_valid
        check (rank between 1 and 10)
);

-- ------------------------------------------------------------
-- 5. Títulos temporales (Autor en Ascenso: 30 días)
-- ------------------------------------------------------------

create table public.temporary_titles (
    user_id     uuid        not null,
    badge_id    text        not null,
    starts_at   timestamptz not null default now(),
    ends_at     timestamptz not null,

    constraint temporary_titles_pkey
        primary key (user_id, badge_id),

    constraint temporary_titles_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade
);

-- ------------------------------------------------------------
-- 6. RLS activado y sin políticas; permisos solo para el backend
-- ------------------------------------------------------------

alter table public.chapter_reads enable row level security;
alter table public.reading_activity enable row level security;
alter table public.first_reader_claims enable row level security;
alter table public.popular_authors enable row level security;
alter table public.temporary_titles enable row level security;

revoke all on table public.chapter_reads from anon, authenticated;
revoke all on table public.reading_activity from anon, authenticated;
revoke all on table public.first_reader_claims from anon, authenticated;
revoke all on table public.popular_authors from anon, authenticated;
revoke all on table public.temporary_titles from anon, authenticated;

grant select, insert, update, delete on table public.chapter_reads to service_role;
grant select, insert, update, delete on table public.reading_activity to service_role;
grant select, insert, update, delete on table public.first_reader_claims to service_role;
grant select, insert, update, delete on table public.popular_authors to service_role;
grant select, insert, update, delete on table public.temporary_titles to service_role;
