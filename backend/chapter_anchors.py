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

import re
from bisect import bisect_right
from difflib import SequenceMatcher

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


def build_paragraph_anchor(
    content: str | None,
    paragraph_index: int,
    max_length: int
) -> dict | None:
    # Anclaje de un párrafo completo: se comenta por párrafo, no por
    # palabra. La cita tiene un largo máximo, así que de un párrafo más
    # largo se cita el comienzo, sin partir una palabra. Devuelve None si
    # el párrafo no existe o está vacío.
    paragraphs = split_paragraphs(content)

    if not (0 <= paragraph_index < len(paragraphs)):
        return None

    anchor = build_anchor(
        content, paragraph_index, 0, len(paragraphs[paragraph_index])
    )

    if anchor is None or len(anchor["quote"]) <= max_length:
        return anchor

    quote = anchor["quote"][:max_length]
    last_space = max(
        (position for position, character in enumerate(quote) if character.isspace()),
        default=0
    )
    if last_space > 0:
        quote = quote[:last_space]
    quote = quote.rstrip()

    return build_anchor(
        content,
        paragraph_index,
        anchor["start_offset"],
        anchor["start_offset"] + len(quote)
    )


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


# ============================================================
# COMENTARIOS DE PÁRRAFO: SIGUEN A SU PÁRRAFO
# ============================================================
#
# Un comentario hecho sobre un párrafo completo se queda en ese párrafo
# aunque su autora lo retoque: si le pone o le quita negrita o cursiva, si
# corrige una palabra o si lo cambia de lugar. Solo queda huérfano cuando
# el párrafo se borra o se reescribe hasta ser otro. Ante la duda entre
# dos párrafos no se adivina: queda huérfano.

# Parecido mínimo (0 a 1) para considerar que un párrafo retocado es el mismo.
SAME_PLACE_SIMILARITY = 0.7
# Si además cambió de lugar, debe parecerse mucho más y ser el único candidato.
MOVED_SIMILARITY = 0.85
MOVED_SIMILARITY_MARGIN = 0.1

# Marcas de negrita y cursiva: *así*, **así** o ***así*** (las mismas reglas
# que frontend/src/utils/richText.js).
INLINE_MARKS = re.compile(r"(\*{1,3})(?=[^\s*])([^*\n]*?[^\s*])\1(?!\*)")


def comparable_text(text: str | None) -> str:
    # El texto sin marcas de formato y con los espacios unificados: lo que
    # de verdad dice el párrafo.
    return " ".join(INLINE_MARKS.sub(r"\2", text or "").split())


def is_paragraph_anchor(anchor: dict) -> bool:
    # Un comentario de párrafo cita desde el inicio del párrafo: antes de la
    # cita solo puede haber un salto de línea (o el inicio del capítulo).
    prefix = (anchor.get("prefix") or "").rstrip(" \t\r")
    return bool(anchor.get("quote")) and (prefix == "" or prefix.endswith("\n"))


def relocate_anchor(content: str | None, anchor: dict, max_length: int) -> dict | None:
    # Nueva posición de un comentario tras editar el capítulo, o None si
    # queda huérfano. Los comentarios antiguos sobre una frase suelta
    # mantienen la regla estricta de locate_anchor.
    exact = locate_anchor(content, anchor)

    if not is_paragraph_anchor(anchor):
        return exact

    if exact is not None:
        # El comentario es del párrafo entero, también si el párrafo creció.
        return build_paragraph_anchor(content, exact["paragraph_index"], max_length)

    quote = comparable_text(anchor.get("quote"))
    if not quote:
        return None

    paragraphs = [comparable_text(item) for item in split_paragraphs(content)]
    # De un párrafo más largo que el máximo solo se guardó el comienzo.
    quote_is_partial = len(anchor.get("quote") or "") >= max_length - ANCHOR_CONTEXT_LENGTH
    quote_is_distinctive = len(quote) >= ANCHOR_SELF_SUFFICIENT_LENGTH
    original_index = anchor.get("paragraph_index")
    has_original = (
        isinstance(original_index, int) and 0 <= original_index < len(paragraphs)
    )

    def says_the_same(paragraph: str) -> bool:
        return paragraph == quote or (quote_is_partial and paragraph.startswith(quote))

    def similarity(paragraph: str) -> float:
        compared = paragraph[:len(quote)] if quote_is_partial else paragraph
        matcher = SequenceMatcher(None, quote, compared, autojunk=False)
        # Las dos primeras son cotas rápidas: evitan comparar a fondo
        # párrafos que claramente no se parecen.
        if matcher.real_quick_ratio() < SAME_PLACE_SIMILARITY:
            return 0.0
        if matcher.quick_ratio() < SAME_PLACE_SIMILARITY:
            return 0.0
        return matcher.ratio()

    def anchor_at(index: int) -> dict | None:
        return build_paragraph_anchor(content, index, max_length)

    # 1. Mismo lugar y mismo texto: solo cambió el formato.
    if has_original and says_the_same(paragraphs[original_index]):
        return anchor_at(original_index)

    # 2. Mismo texto en otro lugar. Una línea corta ("—Sí.") puede repetirse,
    #    así que solo vale para un texto largo que aparece una única vez.
    if quote_is_distinctive:
        same = [index for index, item in enumerate(paragraphs) if says_the_same(item)]
        if len(same) == 1:
            return anchor_at(same[0])
        if same:
            return None

    # 3. Mismo lugar, texto retocado.
    if (
        has_original
        and paragraphs[original_index]
        and similarity(paragraphs[original_index]) >= SAME_PLACE_SIMILARITY
    ):
        return anchor_at(original_index)

    # 4. Retocado y además movido: debe ser inconfundible.
    if quote_is_distinctive:
        scored = sorted(
            (
                (similarity(item), index)
                for index, item in enumerate(paragraphs) if item
            ),
            reverse=True
        )
        if scored and scored[0][0] >= MOVED_SIMILARITY:
            runner_up = scored[1][0] if len(scored) > 1 else 0.0
            if scored[0][0] - runner_up >= MOVED_SIMILARITY_MARGIN:
                return anchor_at(scored[0][1])

    return None
