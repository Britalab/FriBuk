-- ============================================================
-- Mensajes: privados 1 a 1, avisos de autores a sus seguidores,
-- bloqueos y privacidad de mensajes.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Bloqueos entre usuarios
-- ------------------------------------------------------------

create table public.user_blocks (
    blocker_id uuid        not null,
    blocked_id uuid        not null,
    created_at timestamptz not null default now(),

    constraint user_blocks_pkey
        primary key (blocker_id, blocked_id),

    constraint user_blocks_blocker_id_fkey
        foreign key (blocker_id)
        references auth.users (id)
        on delete cascade,

    constraint user_blocks_blocked_id_fkey
        foreign key (blocked_id)
        references auth.users (id)
        on delete cascade,

    constraint user_blocks_not_self
        check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
    'Quien bloquea (blocker_id) y a quien (blocked_id). Mientras exista, ninguno de los dos puede escribirle al otro. Solo escribe el backend con service role.';

create index user_blocks_blocked_idx
    on public.user_blocks (blocked_id);

-- ------------------------------------------------------------
-- 2. Privacidad: quien puede enviarme mensajes privados
-- ------------------------------------------------------------

create table public.message_settings (
    user_id    uuid        primary key,
    allow_from text        not null default 'everyone',
    updated_at timestamptz not null default now(),

    constraint message_settings_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint message_settings_allow_from_valid
        check (allow_from in ('everyone', 'following', 'nobody'))
);

comment on table public.message_settings is
    'Preferencia de cada usuario sobre quien puede escribirle en privado. Sin fila equivale a everyone.';

comment on column public.message_settings.allow_from is
    'everyone (todos), following (solo personas que sigo) o nobody (nadie).';

-- ------------------------------------------------------------
-- 3. Conversaciones privadas (una por pareja de usuarios)
-- ------------------------------------------------------------

create table public.private_conversations (
    id                   uuid        primary key default gen_random_uuid(),
    user_low             uuid        not null,
    user_high            uuid        not null,
    created_at           timestamptz not null default now(),
    last_message_at      timestamptz not null default now(),
    last_message_preview text,
    last_sender_id       uuid,

    constraint private_conversations_pair_unique
        unique (user_low, user_high),

    constraint private_conversations_not_self
        check (user_low <> user_high),

    constraint private_conversations_user_low_fkey
        foreign key (user_low)
        references auth.users (id)
        on delete cascade,

    constraint private_conversations_user_high_fkey
        foreign key (user_high)
        references auth.users (id)
        on delete cascade
);

comment on table public.private_conversations is
    'Conversacion privada entre dos usuarios. user_low y user_high son los dos participantes, ordenados para que la pareja sea unica.';

create index private_conversations_user_low_idx
    on public.private_conversations (user_low, last_message_at desc);

create index private_conversations_user_high_idx
    on public.private_conversations (user_high, last_message_at desc);

-- ------------------------------------------------------------
-- 4. Mensajes privados
-- ------------------------------------------------------------

create table public.private_messages (
    id              uuid        primary key default gen_random_uuid(),
    conversation_id uuid        not null,
    sender_id       uuid        not null,
    content         text        not null,
    created_at      timestamptz not null default now(),
    read_at         timestamptz,

    constraint private_messages_conversation_id_fkey
        foreign key (conversation_id)
        references public.private_conversations (id)
        on delete cascade,

    constraint private_messages_sender_id_fkey
        foreign key (sender_id)
        references auth.users (id)
        on delete cascade,

    constraint private_messages_content_length
        check (char_length(content) between 1 and 2000)
);

comment on column public.private_messages.read_at is
    'Momento en que el destinatario abrio el mensaje. Nulo mientras no lo haya leido.';

create index private_messages_conversation_idx
    on public.private_messages (conversation_id, created_at);

create index private_messages_unread_idx
    on public.private_messages (conversation_id)
    where read_at is null;

-- ------------------------------------------------------------
-- 5. Avisos de un autor a sus seguidores
-- ------------------------------------------------------------

create table public.author_posts (
    id           uuid        primary key default gen_random_uuid(),
    author_id    uuid        not null,
    content      text        not null,
    replies_open boolean     not null default true,
    created_at   timestamptz not null default now(),

    constraint author_posts_author_id_fkey
        foreign key (author_id)
        references auth.users (id)
        on delete cascade,

    constraint author_posts_content_length
        check (char_length(content) between 1 and 2000)
);

comment on table public.author_posts is
    'Mensaje de un autor dirigido a quienes lo siguen. Solo sus seguidores actuales pueden leerlo y responder.';

comment on column public.author_posts.replies_open is
    'Falso si el autor cerro las respuestas de este mensaje.';

create index author_posts_author_idx
    on public.author_posts (author_id, created_at desc);

-- ------------------------------------------------------------
-- 6. Respuestas a los avisos de un autor
-- ------------------------------------------------------------

create table public.author_post_replies (
    id          uuid        primary key default gen_random_uuid(),
    post_id     uuid        not null,
    user_id     uuid        not null,
    reply_to_id uuid,
    content     text        not null,
    created_at  timestamptz not null default now(),

    constraint author_post_replies_post_id_fkey
        foreign key (post_id)
        references public.author_posts (id)
        on delete cascade,

    constraint author_post_replies_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint author_post_replies_reply_to_id_fkey
        foreign key (reply_to_id)
        references public.author_post_replies (id)
        on delete set null,

    constraint author_post_replies_content_length
        check (char_length(content) between 1 and 1000)
);

comment on column public.author_post_replies.reply_to_id is
    'Respuesta a la que contesta. El autor puede contestar a un seguidor y un seguidor al autor, nunca un seguidor a otro seguidor (lo valida el backend).';

create index author_post_replies_post_idx
    on public.author_post_replies (post_id, created_at);

-- ------------------------------------------------------------
-- 7. Hasta donde leyo cada usuario los avisos de cada autor
-- ------------------------------------------------------------

create table public.author_channel_reads (
    user_id      uuid        not null,
    author_id    uuid        not null,
    last_read_at timestamptz not null default now(),

    constraint author_channel_reads_pkey
        primary key (user_id, author_id),

    constraint author_channel_reads_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint author_channel_reads_author_id_fkey
        foreign key (author_id)
        references auth.users (id)
        on delete cascade
);

comment on table public.author_channel_reads is
    'Marca de lectura de los avisos de un autor. Cuando user_id = author_id, es el propio autor leyendo las respuestas de sus seguidores.';

-- ------------------------------------------------------------
-- 8. RLS: activado y sin politicas (sin acceso desde el navegador)
-- ------------------------------------------------------------

alter table public.user_blocks enable row level security;
alter table public.message_settings enable row level security;
alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;
alter table public.author_posts enable row level security;
alter table public.author_post_replies enable row level security;
alter table public.author_channel_reads enable row level security;

-- ------------------------------------------------------------
-- 9. Permisos: solo el backend (service role)
-- ------------------------------------------------------------

revoke all on table public.user_blocks from anon, authenticated;
revoke all on table public.message_settings from anon, authenticated;
revoke all on table public.private_conversations from anon, authenticated;
revoke all on table public.private_messages from anon, authenticated;
revoke all on table public.author_posts from anon, authenticated;
revoke all on table public.author_post_replies from anon, authenticated;
revoke all on table public.author_channel_reads from anon, authenticated;

grant select, insert, update, delete on table public.user_blocks to service_role;
grant select, insert, update, delete on table public.message_settings to service_role;
grant select, insert, update, delete on table public.private_conversations to service_role;
grant select, insert, update, delete on table public.private_messages to service_role;
grant select, insert, update, delete on table public.author_posts to service_role;
grant select, insert, update, delete on table public.author_post_replies to service_role;
grant select, insert, update, delete on table public.author_channel_reads to service_role;
