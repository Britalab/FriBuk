# ============================================================
# ANCLAJE DE COMENTARIOS AL TEXTO DE UN CAPÍTULO
# ============================================================
#
# Un comentario se vincula a un fragmento del capítulo mediante:
#   - el párrafo (índice dentro de content.split("\n"), igual que el lector);
#   - la posición inicial y final dentro de ese párrafo;
#   - el texto citado;
#   - el contexto: los caracteres anteriores y posteriores a la cita.
#
# Las posiciones se cuentan en caracteres Unicode (code points).
# Este módulo no accede a la base de datos: solo trabaja con texto.

from bisect import bisect_right

# Caracteres de contexto guardados a cada lado de la cita.
ANCHOR_CONTEXT_LENGTH = 32
# Una cita de este largo o más se considera identificable por sí sola
# cuando aparece una única vez en el capítulo.
ANCHOR_SELF_SUFFICIENT_LENGTH = 24


def split_paragraphs(content: str | None) -> list[str]:
    return (content or "").split("\n")


def paragraph_offsets(paragraphs: list[str]) -> list[int]:
    # Posición de inicio de cada párrafo dentro del texto completo.
    offsets = []
    position = 0
    for paragraph in paragraphs:
        offsets.append(position)
        position += len(paragraph) + 1
    return offsets


def build_anchor(
    content: str | None,
    paragraph_index: int,
    start_offset: int,
    end_offset: int
) -> dict | None:
    # Construye el anclaje a partir del texto real del capítulo. Devuelve
    # None si la posición no existe o no contiene texto.
    text = content or ""
    paragraphs = split_paragraphs(text)

    if not (0 <= paragraph_index < len(paragraphs)):
        return None

    paragraph = paragraphs[paragraph_index]

    if not (0 <= start_offset < end_offset <= len(paragraph)):
        return None

    # La cita nunca empieza ni termina en espacios.
    while start_offset < end_offset and paragraph[start_offset].isspace():
        start_offset += 1
    while end_offset > start_offset and paragraph[end_offset - 1].isspace():
        end_offset -= 1

    if start_offset >= end_offset:
        return None

    global_start = paragraph_offsets(paragraphs)[paragraph_index] + start_offset
    global_end = global_start + (end_offset - start_offset)

    return {
        "paragraph_index": paragraph_index,
        "start_offset": start_offset,
        "end_offset": end_offset,
        "quote": paragraph[start_offset:end_offset],
        "prefix": text[max(0, global_start - ANCHOR_CONTEXT_LENGTH):global_start],
        "suffix": text[global_end:global_end + ANCHOR_CONTEXT_LENGTH]
    }


def _prefix_matches(text: str, position: int, prefix: str) -> bool:
    # Un contexto más corto que el máximo significa que la cita estaba
    # pegada al inicio del capítulo: solo coincide si sigue estándolo.
    if len(prefix) < ANCHOR_CONTEXT_LENGTH:
        return position == len(prefix) and text.startswith(prefix)
    return text.endswith(prefix, 0, position)


def _suffix_matches(text: str, position: int, suffix: str) -> bool:
    if len(suffix) < ANCHOR_CONTEXT_LENGTH:
        return position + len(suffix) == len(text) and text.endswith(suffix)
    return text.startswith(suffix, position)


def locate_anchor(content: str | None, anchor: dict) -> dict | None:
    # Busca en el texto actual el fragmento al que apuntaba un anclaje.
    # Devuelve el anclaje actualizado o None si el fragmento no puede
    # identificarse con seguridad (el comentario queda huérfano).
    # Nunca devuelve un fragmento con un texto distinto al citado.
    text = content or ""
    quote = anchor.get("quote") or ""
    prefix = anchor.get("prefix") or ""
    suffix = anchor.get("suffix") or ""

    if not quote:
        return None

    paragraphs = split_paragraphs(text)
    offsets = paragraph_offsets(paragraphs)
    quote_is_distinctive = len(quote) >= ANCHOR_SELF_SUFFICIENT_LENGTH

    def anchor_at(position: int) -> dict | None:
        paragraph_index = bisect_right(offsets, position) - 1
        start_offset = position - offsets[paragraph_index]
        return build_anchor(
            text, paragraph_index, start_offset, start_offset + len(quote)
        )

    def context_score(position: int) -> int:
        return (
            int(_prefix_matches(text, position, prefix))
            + int(_suffix_matches(text, position + len(quote), suffix))
        )

    # 1. Misma posición. Una cita corta puede coincidir por casualidad con
    #    otro texto, así que además debe conservar parte de su contexto.
    paragraph_index = anchor.get("paragraph_index")
    start_offset = anchor.get("start_offset")
    end_offset = anchor.get("end_offset")

    if (
        isinstance(paragraph_index, int)
        and isinstance(start_offset, int)
        and isinstance(end_offset, int)
        and 0 <= paragraph_index < len(paragraphs)
        and 0 <= start_offset < end_offset
        and paragraphs[paragraph_index][start_offset:end_offset] == quote
    ):
        position = offsets[paragraph_index] + start_offset
        if quote_is_distinctive or context_score(position) > 0:
            return anchor_at(position)

    # 2. Cita y contexto en cualquier parte del capítulo.
    full_matches = []
    partial_matches = []
    occurrences = 0
    position = text.find(quote)

    while position != -1:
        occurrences += 1
        score = context_score(position)
        if score == 2:
            full_matches.append(position)
        elif score == 1:
            partial_matches.append(position)
        position = text.find(quote, position + 1)

    if len(full_matches) == 1:
        return anchor_at(full_matches[0])
    if full_matches:
        return None
    if len(partial_matches) == 1:
        return anchor_at(partial_matches[0])
    if partial_matches:
        return None

    # 3. Sin contexto: solo una cita larga que aparece una única vez.
    if quote_is_distinctive and occurrences == 1:
        return anchor_at(text.find(quote))

    return None
