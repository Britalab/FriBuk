// Menciones con @ en comentarios y en el foro.
//
// Una mención es @ seguido de un nombre de usuario. El @ no puede venir
// pegado a otra palabra, así un correo (ana@correo.com) no cuenta. Las
// mismas reglas valen en el servidor (backend/mentions.py), que es quien
// avisa a la persona nombrada.

const MENTION = /(^|[^\p{L}\p{N}_.@-])@([\p{L}\p{N}_.-]{3,30})/gu;

// Divide un texto en trozos: { text } o { text, username }.
export function splitMentions(text) {
  const source = String(text ?? "");
  const pieces = [];
  let position = 0;

  const pushText = (value) => {
    if (value) pieces.push({ text: value });
  };

  for (const match of source.matchAll(MENTION)) {
    // El punto o guion final suele ser de la frase, no del nombre.
    const username = match[2].replace(/[.-]+$/, "");
    if (username.length < 3) continue;

    const start = match.index + match[1].length;
    pushText(source.slice(position, start));
    pieces.push({ text: `@${username}`, username });
    position = start + 1 + username.length;
  }

  pushText(source.slice(position));
  return pieces;
}

// Agrega una mención al final de lo que se está escribiendo.
export function appendMention(text, username) {
  const current = String(text ?? "");
  const mention = `@${username} `;

  if (!current.trim()) return mention;
  return `${current}${/\s$/.test(current) ? "" : " "}${mention}`;
}
