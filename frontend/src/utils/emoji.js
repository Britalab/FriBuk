// Cuenta los emojis de un texto como los ve una persona: una bandera, una
// familia o un emoji con tono de piel valen 1 aunque usen varios caracteres.
// El backend aplica la misma regla (count_emojis en main.py).

const VARIATION_SELECTOR = 0xfe0f;
const ZERO_WIDTH_JOINER = 0x200d;
const KEYCAP = 0x20e3;
const WHITESPACE = /\s/;

function isEmojiCodePoint(code) {
  return (
    (code >= 0x1f000 && code <= 0x1faff) || // caras, gestos, objetos, banderas
    (code >= 0x2600 && code <= 0x27bf) || // símbolos y adornos (☀ ❤ ✨)
    (code >= 0x2b00 && code <= 0x2bff) || // ⭐ ⬛
    (code >= 0x2300 && code <= 0x23ff) // ⌚ ⏰
  );
}

function isEmojiModifier(code) {
  return (
    code === VARIATION_SELECTOR ||
    code === KEYCAP ||
    (code >= 0x1f3fb && code <= 0x1f3ff) || // tonos de piel
    (code >= 0xe0020 && code <= 0xe007f) // etiquetas de banderas regionales
  );
}

function isRegionalIndicator(code) {
  return code >= 0x1f1e6 && code <= 0x1f1ff;
}

export function countEmojis(text) {
  const codes = Array.from(text || "", (char) => char.codePointAt(0));
  let total = 0;
  let index = 0;

  while (index < codes.length) {
    const code = codes[index];
    const nextCode = codes[index + 1];

    if (isRegionalIndicator(code)) {
      // Una bandera son dos letras regionales seguidas.
      total += 1;
      index += nextCode !== undefined && isRegionalIndicator(nextCode) ? 2 : 1;
      continue;
    }

    const isEmoji =
      isEmojiCodePoint(code) ||
      // Un carácter común seguido del selector se muestra como emoji (©️, 1️⃣).
      (nextCode === VARIATION_SELECTOR &&
        !isEmojiModifier(code) &&
        code !== ZERO_WIDTH_JOINER &&
        !WHITESPACE.test(String.fromCodePoint(code)));

    if (!isEmoji) {
      index += 1;
      continue;
    }

    total += 1;
    index += 1;

    while (index < codes.length) {
      if (isEmojiModifier(codes[index])) {
        index += 1;
      } else if (
        codes[index] === ZERO_WIDTH_JOINER &&
        index + 1 < codes.length &&
        isEmojiCodePoint(codes[index + 1])
      ) {
        // Emojis unidos (👩‍👧) forman uno solo.
        index += 2;
      } else {
        break;
      }
    }
  }

  return total;
}
