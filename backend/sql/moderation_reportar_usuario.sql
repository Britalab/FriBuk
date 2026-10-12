-- ============================================================
-- Reportar a una persona desde su perfil publico.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ningun reporte existente: solo amplia los valores
-- que aceptan dos columnas.
-- ============================================================

-- 1. Los casos de moderacion pueden ser sobre una cuenta ('user').
alter table public.moderation_cases
    drop constraint moderation_cases_target_type_valid;

alter table public.moderation_cases
    add constraint moderation_cases_target_type_valid
    check (target_type in (
        'forum_topic', 'forum_reply', 'avatar',
        'profile_banner', 'story_cover', 'user'
    ));

-- 2. Nuevo motivo de reporte: suplantacion de identidad.
alter table public.content_reports
    drop constraint content_reports_reason_valid;

alter table public.content_reports
    add constraint content_reports_reason_valid
    check (reason in (
        'prohibited', 'sexual', 'graphic_violence', 'harassment',
        'spam', 'copyright', 'other', 'impersonation'
    ));
