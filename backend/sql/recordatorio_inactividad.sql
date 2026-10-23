-- ============================================================
-- Recordatorio por inactividad: 2 semanas y 1 mes sin capítulos nuevos
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- Una fila por aviso enviado. `last_chapter_at` es la fecha del último
-- capítulo cuando se avisó: al publicar uno nuevo, los avisos empiezan de
-- nuevo, y cada aviso sale una sola vez aunque se descarte la notificación.
create table public.story_inactivity_reminders (
    story_id        uuid        not null,
    stage           smallint    not null,
    last_chapter_at timestamptz not null,
    sent_at         timestamptz not null default now(),

    constraint story_inactivity_reminders_pkey
        primary key (story_id, stage, last_chapter_at),

    constraint story_inactivity_reminders_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade,

    constraint story_inactivity_reminders_stage_valid
        check (stage in (14, 30))
);

comment on table public.story_inactivity_reminders is
    'Avisos enviados a autores cuya historia en curso lleva 14 o 30 días sin capítulos nuevos.';

-- Solo el backend (service role) la usa: sin políticas, nadie más la lee.
alter table public.story_inactivity_reminders enable row level security;
