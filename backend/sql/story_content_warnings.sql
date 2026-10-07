-- ============================================================
-- Aviso de contenido sensible en las historias
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- Solo agrega dos columnas a public.stories: las historias que ya
-- existen quedan con sensitive_content = false y sin advertencias.
-- ============================================================

alter table public.stories
    add column sensitive_content boolean not null default false,
    add column content_warnings  text[]  not null default '{}';

-- Solo las tres advertencias admitidas, y ninguna si la historia no
-- esta marcada como contenido sensible.
alter table public.stories
    add constraint stories_content_warnings_valid
    check (
        content_warnings <@ array['violence', 'strong_language', 'sensitive_topics']::text[]
        and (sensitive_content or cardinality(content_warnings) = 0)
    );

comment on column public.stories.sensitive_content is
    'Verdadero si el autor indica que la historia tiene contenido sensible. Es solo un aviso para el lector.';

comment on column public.stories.content_warnings is
    'Advertencias elegidas por el autor: violence, strong_language, sensitive_topics.';
