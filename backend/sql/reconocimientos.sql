-- ============================================================
-- Reconocimientos: títulos e insignias (fase 1)
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nivel ganado por cada usuario en cada título o insignia
-- ------------------------------------------------------------

create table public.user_badges (
    user_id     uuid        not null,
    badge_id    text        not null,
    level       smallint    not null default 1,
    awarded_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint user_badges_pkey
        primary key (user_id, badge_id),

    constraint user_badges_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint user_badges_level_valid
        check (level >= 1)
);

comment on table public.user_badges is
    'Títulos e insignias ganados. El nivel solo sube: lo ganado no se pierde. Solo escribe el backend con service role.';

create index user_badges_badge_idx
    on public.user_badges (badge_id);

-- ------------------------------------------------------------
-- 2. Cupos fundadores (100 autores; en la fase 2, 500 lectores)
-- ------------------------------------------------------------

create table public.founder_slots (
    kind        text        not null,
    slot        integer     not null,
    user_id     uuid        not null,
    story_id    uuid,
    awarded_at  timestamptz not null default now(),

    constraint founder_slots_pkey
        primary key (kind, slot),

    constraint founder_slots_one_per_user
        unique (kind, user_id),

    constraint founder_slots_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint founder_slots_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete set null,

    -- El límite vive también en la base de datos: nunca habrá más cupos.
    constraint founder_slots_limit
        check (
            (kind = 'author' and slot between 1 and 100)
            or (kind = 'reader' and slot between 1 and 500)
        )
);

comment on table public.founder_slots is
    'Cupo de cada Autor Fundador (y, más adelante, Lector Fundador). Un cupo otorgado no se libera.';

-- ------------------------------------------------------------
-- 3. Qué muestra cada usuario: título principal e insignias destacadas
-- ------------------------------------------------------------

create table public.user_badge_display (
    user_id     uuid        primary key,
    main_title  text,
    featured    text[]      not null default '{}',
    updated_at  timestamptz not null default now(),

    constraint user_badge_display_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint user_badge_display_featured_max
        check (cardinality(featured) <= 4)
);

comment on table public.user_badge_display is
    'Título principal y hasta 4 insignias destacadas que elige cada usuario.';

-- ------------------------------------------------------------
-- 4. RLS: activado y sin políticas (sin acceso desde el navegador)
-- ------------------------------------------------------------

alter table public.user_badges enable row level security;
alter table public.founder_slots enable row level security;
alter table public.user_badge_display enable row level security;

-- ------------------------------------------------------------
-- 5. Permisos: solo el backend (service role)
-- ------------------------------------------------------------

revoke all on table public.user_badges from anon;
revoke all on table public.user_badges from authenticated;
revoke all on table public.founder_slots from anon;
revoke all on table public.founder_slots from authenticated;
revoke all on table public.user_badge_display from anon;
revoke all on table public.user_badge_display from authenticated;

grant select, insert, update, delete
    on table public.user_badges
    to service_role;

grant select, insert, update, delete
    on table public.founder_slots
    to service_role;

grant select, insert, update, delete
    on table public.user_badge_display
    to service_role;
