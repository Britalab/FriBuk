-- ============================================================
-- Moderacion de contenido: reportes, retiro y restauracion de
-- publicaciones del foro e imagenes subidas por usuarios (avatar,
-- banner de perfil y portada de historia).
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Un caso por contenido reportado o retirado
-- ------------------------------------------------------------

create table public.moderation_cases (
    id                uuid        primary key default gen_random_uuid(),
    target_type       text        not null,
    target_id         text        not null,
    owner_id          uuid,
    status            text        not null default 'open',
    snapshot          jsonb       not null default '{}'::jsonb,
    report_count      integer     not null default 0,
    last_report_at    timestamptz,
    counting_since    timestamptz,
    removal_reason    text,
    removal_automatic boolean     not null default false,
    removed_at        timestamptz,
    removed_by        uuid,
    restored_at       timestamptz,
    restored_by       uuid,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    constraint moderation_cases_target_unique
        unique (target_type, target_id),

    constraint moderation_cases_target_type_valid
        check (target_type in (
            'forum_topic', 'forum_reply', 'avatar',
            'profile_banner', 'story_cover'
        )),

    constraint moderation_cases_status_valid
        check (status in ('open', 'removed', 'restored', 'reviewed')),

    constraint moderation_cases_removal_reason_valid
        check (removal_reason is null or removal_reason in (
            'prohibited', 'sexual', 'graphic_violence', 'harassment',
            'spam', 'copyright', 'other', 'many_reports'
        )),

    constraint moderation_cases_owner_id_fkey
        foreign key (owner_id)
        references auth.users (id)
        on delete set null,

    constraint moderation_cases_removed_by_fkey
        foreign key (removed_by)
        references auth.users (id)
        on delete set null,

    constraint moderation_cases_restored_by_fkey
        foreign key (restored_by)
        references auth.users (id)
        on delete set null
);

comment on table public.moderation_cases is
    'Estado de moderacion de un contenido. Mientras status = removed, el contenido no se muestra. Solo escribe el backend con service role.';

comment on column public.moderation_cases.target_id is
    'Id del contenido: tema o respuesta del foro, usuario (avatar y banner de perfil) o historia (portada).';

comment on column public.moderation_cases.snapshot is
    'Copia del contenido al reportarlo o retirarlo (texto, imagen y donde quedo guardada), para que la revision no dependa del original.';

comment on column public.moderation_cases.counting_since is
    'Los reportes anteriores a esta fecha ya fueron revisados y no cuentan para el retiro automatico.';

comment on column public.moderation_cases.removed_by is
    'Administrador que retiro el contenido. Nulo si el retiro fue automatico.';

create index moderation_cases_status_idx
    on public.moderation_cases (status, updated_at desc);

create index moderation_cases_owner_idx
    on public.moderation_cases (owner_id, status);

-- ------------------------------------------------------------
-- 2. Reportes: uno por persona y contenido
-- ------------------------------------------------------------

create table public.content_reports (
    id              uuid        primary key default gen_random_uuid(),
    case_id         uuid        not null,
    target_type     text        not null,
    target_id       text        not null,
    reporter_id     uuid        not null,
    reason          text        not null,
    details         text,
    counts_for_auto boolean     not null default true,
    created_at      timestamptz not null default now(),

    constraint content_reports_one_per_user
        unique (target_type, target_id, reporter_id),

    constraint content_reports_case_id_fkey
        foreign key (case_id)
        references public.moderation_cases (id)
        on delete cascade,

    constraint content_reports_reporter_id_fkey
        foreign key (reporter_id)
        references auth.users (id)
        on delete cascade,

    constraint content_reports_reason_valid
        check (reason in (
            'prohibited', 'sexual', 'graphic_violence', 'harassment',
            'spam', 'copyright', 'other'
        )),

    constraint content_reports_details_length
        check (details is null or char_length(details) between 1 and 300)
);

comment on table public.content_reports is
    'Reportes de la comunidad. La restriccion unica impide que una misma persona reporte dos veces el mismo contenido.';

comment on column public.content_reports.counts_for_auto is
    'Falso si el reporte viene de una cuenta muy nueva: llega al panel, pero no suma para el retiro automatico.';

create index content_reports_case_idx
    on public.content_reports (case_id, created_at);

create index content_reports_reporter_idx
    on public.content_reports (reporter_id, created_at desc);

-- ------------------------------------------------------------
-- 3. Historial de retiros y restauraciones
-- ------------------------------------------------------------

create table public.moderation_actions (
    id         uuid        primary key default gen_random_uuid(),
    case_id    uuid        not null,
    action     text        not null,
    actor_id   uuid,
    reason     text,
    note       text,
    created_at timestamptz not null default now(),

    constraint moderation_actions_case_id_fkey
        foreign key (case_id)
        references public.moderation_cases (id)
        on delete cascade,

    constraint moderation_actions_actor_id_fkey
        foreign key (actor_id)
        references auth.users (id)
        on delete set null,

    constraint moderation_actions_action_valid
        check (action in ('removed', 'auto_removed', 'restored', 'reviewed')),

    constraint moderation_actions_note_length
        check (note is null or char_length(note) <= 500)
);

comment on table public.moderation_actions is
    'Cada retiro, restauracion o revision de un caso: quien lo hizo, cuando y por que. actor_id nulo = accion automatica.';

create index moderation_actions_case_idx
    on public.moderation_actions (case_id, created_at);

-- ------------------------------------------------------------
-- 4. RLS: activado y sin politicas (sin acceso desde el navegador)
-- ------------------------------------------------------------

alter table public.moderation_cases enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_actions enable row level security;

-- ------------------------------------------------------------
-- 5. Permisos: solo el backend (service role)
-- ------------------------------------------------------------

revoke all on table public.moderation_cases from anon, authenticated;
revoke all on table public.content_reports from anon, authenticated;
revoke all on table public.moderation_actions from anon, authenticated;

grant select, insert, update, delete on table public.moderation_cases to service_role;
grant select, insert, update, delete on table public.content_reports to service_role;
grant select, insert, update, delete on table public.moderation_actions to service_role;
