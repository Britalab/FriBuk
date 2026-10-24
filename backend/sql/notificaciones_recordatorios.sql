-- ============================================================
-- Tipos de notificación de los recordatorios a autores
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ningún dato existente.
-- ============================================================

-- La regla de tipos válidos no incluía los recordatorios de primer
-- capítulo, inactividad y días de escritura, y la base rechazaba esos
-- avisos. Se reemplaza por la lista completa.
alter table public.notifications
    drop constraint notifications_type_valid;

alter table public.notifications
    add constraint notifications_type_valid
    check (type in (
        'follow',
        'forum_reply',
        'story_chapter',
        'story_comment',
        'story_favorite',
        'story_rating',
        'story_vote',
        'support_status',
        'story_first_chapter',
        'story_inactive',
        'story_schedule'
    ));
