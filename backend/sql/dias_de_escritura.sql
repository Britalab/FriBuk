-- ============================================================
-- Días de escritura: calendario de publicación de cada historia
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna tabla ni dato existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Calendario de cada historia
-- ------------------------------------------------------------

-- `days` va de 0 (lunes) a 6 (domingo). `hour` y `timezone` indican cuándo
-- llega el recordatorio, en la zona horaria del autor.
create table public.story_schedules (
    story_id      uuid        not null,
    days          smallint[]  not null,
    hour          smallint    not null,
    timezone      text        not null,
    show_publicly boolean     not null default true,
    updated_at    timestamptz not null default now(),

    constraint story_schedules_pkey
        primary key (story_id),

    constraint story_schedules_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade,

    constraint story_schedules_days_valid
        check (
            cardinality(days) between 1 and 7
            and days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
        ),

    constraint story_schedules_hour_valid
        check (hour between 0 and 23)
);

comment on table public.story_schedules is
    'Días de la semana y hora en que el autor planea publicar cada historia.';

alter table public.story_schedules enable row level security;

-- ------------------------------------------------------------
-- 2. Recordatorios ya enviados
-- ------------------------------------------------------------

-- Una fila por historia y día (en la zona del autor) ya avisado.
create table public.story_schedule_reminders (
    story_id   uuid        not null,
    local_date date        not null,
    sent_at    timestamptz not null default now(),

    constraint story_schedule_reminders_pkey
        primary key (story_id, local_date),

    constraint story_schedule_reminders_story_id_fkey
        foreign key (story_id)
        references public.stories (id)
        on delete cascade
);

comment on table public.story_schedule_reminders is
    'Días de escritura en que ya se recordó al autor publicar un capítulo.';

-- Solo el backend (service role) usa estas tablas: sin políticas, nadie más
-- las lee.
alter table public.story_schedule_reminders enable row level security;
