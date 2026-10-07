-- ============================================================
-- Comentarios anclados al texto de los capitulos
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Comentarios y respuestas
-- ------------------------------------------------------------

create table public.chapter_comments (
    id              uuid        primary key default gen_random_uuid(),
    chapter_id      uuid        not null,
    user_id         uuid        not null,
    parent_id       uuid,
    content         text        not null,

    paragraph_index integer,
    start_offset    integer,
    end_offset      integer,
    quote           text,
    prefix          text,
    suffix          text,

    is_orphaned     boolean     not null default false,
    orphaned_at     timestamptz,

    status          text        not null default 'visible',
    removed_at      timestamptz,
    removed_by      uuid,

    created_at      timestamptz not null default now(),
    edited_at       timestamptz,

    constraint chapter_comments_chapter_id_fkey
        foreign key (chapter_id)
        references public.chapters (id)
        on delete cascade,

    constraint chapter_comments_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint chapter_comments_parent_id_fkey
        foreign key (parent_id)
        references public.chapter_comments (id)
        on delete cascade,

    constraint chapter_comments_content_length
        check (char_length(content) between 1 and 1000),

    constraint chapter_comments_status_valid
        check (status in ('visible', 'removed')),

    constraint chapter_comments_anchor_valid
        check (
            (
                parent_id is not null
                and paragraph_index is null
                and start_offset is null
                and end_offset is null
                and quote is null
            )
            or
            (
                parent_id is null
                and paragraph_index is not null
                and start_offset is not null
                and end_offset is not null
                and quote is not null
                and prefix is not null
                and suffix is not null
                and paragraph_index >= 0
                and start_offset >= 0
                and end_offset > start_offset
                and char_length(quote) between 1 and 600
            )
        )
);

comment on table public.chapter_comments is
    'Comentarios de lectores anclados a un fragmento del texto de un capitulo. Solo escribe el backend con service role.';

comment on column public.chapter_comments.parent_id is
    'Comentario al que responde. Nulo en los comentarios principales.';

comment on column public.chapter_comments.paragraph_index is
    'Parrafo del capitulo (indice al separar el contenido por saltos de linea).';

comment on column public.chapter_comments.start_offset is
    'Posicion inicial del fragmento dentro del parrafo, en caracteres Unicode.';

comment on column public.chapter_comments.end_offset is
    'Posicion final (excluida) del fragmento dentro del parrafo.';

comment on column public.chapter_comments.quote is
    'Texto citado tal como estaba al comentar.';

comment on column public.chapter_comments.prefix is
    'Contexto: caracteres anteriores a la cita. Sirve para reubicarla.';

comment on column public.chapter_comments.suffix is
    'Contexto: caracteres posteriores a la cita. Sirve para reubicarla.';

comment on column public.chapter_comments.is_orphaned is
    'Verdadero si el fragmento ya no existe en el capitulo tras una edicion.';

comment on column public.chapter_comments.status is
    'visible o removed (retirado por moderacion).';

create index chapter_comments_chapter_idx
    on public.chapter_comments (chapter_id, created_at, id);

create index chapter_comments_parent_idx
    on public.chapter_comments (parent_id);

create index chapter_comments_user_idx
    on public.chapter_comments (user_id);

-- ------------------------------------------------------------
-- 2. Reacciones (una por usuario y comentario)
-- ------------------------------------------------------------

create table public.chapter_comment_reactions (
    comment_id uuid        not null,
    user_id    uuid        not null,
    chapter_id uuid        not null,
    reaction   text        not null,
    created_at timestamptz not null default now(),

    constraint chapter_comment_reactions_pkey
        primary key (comment_id, user_id),

    constraint chapter_comment_reactions_comment_id_fkey
        foreign key (comment_id)
        references public.chapter_comments (id)
        on delete cascade,

    constraint chapter_comment_reactions_user_id_fkey
        foreign key (user_id)
        references auth.users (id)
        on delete cascade,

    constraint chapter_comment_reactions_chapter_id_fkey
        foreign key (chapter_id)
        references public.chapters (id)
        on delete cascade,

    constraint chapter_comment_reactions_reaction_valid
        check (
            reaction in (
                'heart', 'laugh', 'surprised', 'sad', 'angry', 'clap',
                'love', 'thinking', 'impact', 'sensitive', 'rofl', 'fire',
                'eyes', 'skull', 'unamused', 'lip_bite', 'lips', 'eye'
            )
        )
);

comment on table public.chapter_comment_reactions is
    'Reacciones a comentarios de capitulos. Independiente de forum_interactions. Solo escribe el backend con service role.';

comment on column public.chapter_comment_reactions.chapter_id is
    'Capitulo del comentario. Permite cargar todas las reacciones de un capitulo en una consulta.';

create index chapter_comment_reactions_chapter_idx
    on public.chapter_comment_reactions (chapter_id, comment_id, user_id);

create index chapter_comment_reactions_user_idx
    on public.chapter_comment_reactions (user_id);

-- ------------------------------------------------------------
-- 3. RLS: activado y sin politicas (sin acceso desde el navegador)
-- ------------------------------------------------------------

alter table public.chapter_comments enable row level security;
alter table public.chapter_comment_reactions enable row level security;

-- ------------------------------------------------------------
-- 4. Permisos: solo el backend (service role)
-- ------------------------------------------------------------

revoke all on table public.chapter_comments from anon;
revoke all on table public.chapter_comments from authenticated;
revoke all on table public.chapter_comment_reactions from anon;
revoke all on table public.chapter_comment_reactions from authenticated;

grant select, insert, update, delete
    on table public.chapter_comments
    to service_role;

grant select, insert, update, delete
    on table public.chapter_comment_reactions
    to service_role;
