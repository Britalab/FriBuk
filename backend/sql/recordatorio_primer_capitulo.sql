-- ============================================================
-- Recordatorio para publicar el primer capítulo
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- Una fila por historia a cuyo autor ya se le recordó publicar el primer
-- capítulo. Así el aviso no se repite aunque se descarte la notificación.
create table public.first_chapter_reminders (
    story_id uuid        not null,
    sent_at  timestamptz not null default now(),

    constraint first_chapter_reminders_pkey
        primary key (story_id),

    constraint first_chapter_reminders_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade
);

comment on table public.first_chapter_reminders is
    'Historias cuyo autor ya recibió el recordatorio de publicar el primer capítulo.';

-- Solo el backend (service role) la usa: sin políticas, nadie más la lee.
alter table public.first_chapter_reminders enable row level security;
