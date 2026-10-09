-- ============================================================
-- Advertencias de contenido mas especificas para las historias.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- No modifica ninguna historia: solo amplia la lista de valores
-- que acepta la columna content_warnings.
-- ============================================================

alter table public.stories
    drop constraint stories_content_warnings_valid;

-- Las dos ultimas ('violence' y 'sensitive_topics') son las de la
-- primera version: ya no se ofrecen al crear una historia, pero las
-- historias que las tenian las conservan.
alter table public.stories
    add constraint stories_content_warnings_valid
    check (
        content_warnings <@ array[
            'graphic_violence',
            'domestic_abuse',
            'torture_kidnapping',
            'explicit_sex',
            'sexual_violence',
            'suicide_self_harm',
            'eating_disorders',
            'drugs_addiction',
            'animal_harm',
            'discrimination',
            'pregnancy_child_loss',
            'strong_language',
            'violence',
            'sensitive_topics'
        ]::text[]
        and (sensitive_content or cardinality(content_warnings) = 0)
    );

comment on column public.stories.content_warnings is
    'Advertencias elegidas por el autor (ver STORY_CONTENT_WARNINGS en backend/main.py). Son solo un aviso para el lector.';
