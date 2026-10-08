// Búsqueda y filtros del inicio: por texto, por etiqueta (tropos y temas) y
// por fandom (la obra en la que se basa un fanfic o una adaptación).

// Sin mayúsculas ni tildes, para que "Fantasía" y "fantasia" coincidan.
export function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function storyTags(story) {
  return Array.isArray(story?.tags) ? story.tags.filter(Boolean) : [];
}

// Obra original de la historia, o "" si es una obra propia.
export function storyFandom(story) {
  if (!story || story.work_type === "original") return "";
  return String(story.original_work || "").trim();
}

// El texto buscado puede estar en el título, la descripción, el autor, una
// etiqueta o el fandom.
export function storyMatchesSearch(story, search) {
  const query = normalizeText(search);
  if (!query) return true;

  return [
    story.title,
    story.description,
    story.author_username,
    story.original_work,
    story.original_author,
    ...storyTags(story),
  ].some((field) => normalizeText(field).includes(query));
}

export function storyHasTag(story, tag) {
  const wanted = normalizeText(tag);
  if (!wanted) return true;
  return storyTags(story).some((item) => normalizeText(item) === wanted);
}

export function storyHasFandom(story, fandom) {
  const wanted = normalizeText(fandom);
  if (!wanted) return true;
  return normalizeText(storyFandom(story)) === wanted;
}

// Cuenta en cuántas historias aparece cada valor, juntando las variantes que
// solo cambian en mayúsculas o tildes. Devuelve los más usados primero.
function countByName(stories, valuesOf) {
  const groups = new Map();

  for (const story of stories) {
    const seen = new Set();
    for (const value of valuesOf(story)) {
      const key = normalizeText(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const group = groups.get(key) || { name: String(value).trim(), count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
  }

  return Array.from(groups.values()).sort(
    (first, second) =>
      second.count - first.count || first.name.localeCompare(second.name)
  );
}

export function popularTags(stories, limit = 12) {
  return countByName(stories, storyTags).slice(0, limit);
}

export function fandomList(stories) {
  return countByName(stories, (story) => [storyFandom(story)]);
}

// Dirección del inicio filtrada por una etiqueta o un fandom.
export function feedFilterLink({ tag, fandom }) {
  const params = new URLSearchParams();
  if (tag) params.set("etiqueta", tag);
  if (fandom) params.set("fandom", fandom);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
