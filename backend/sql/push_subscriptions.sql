-- ============================================================
-- Notificaciones push
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dispositivos que aceptaron recibir avisos
-- ------------------------------------------------------------

create table public.push_subscriptions (
    endpoint    text        not null,
    user_id     uuid        not null,
    p256dh      text        not null,
    auth        text        not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint push_subscriptions_pkey
        primary key (endpoint),

    constraint push_subscriptions_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade
);

comment on table public.push_subscriptions is
    'Suscripciones push de cada navegador (una por dispositivo). Solo escribe el backend con service role.';

create index push_subscriptions_user_idx
    on public.push_subscriptions (user_id);

-- ------------------------------------------------------------
-- 2. RLS activado y sin políticas; permisos solo para el backend
-- ------------------------------------------------------------

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;

grant select, insert, update, delete
    on table public.push_subscriptions
    to service_role;
