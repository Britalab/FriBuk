// Reacciones de los comentarios de capítulos.
// Los valores coinciden con los que valida el backend. Son independientes
// de las reacciones del foro.

export const CHAPTER_REACTIONS = [
  { value: "heart", emoji: "❤️", label: "Me encanta" },
  { value: "laugh", emoji: "😂", label: "Me dio risa" },
  { value: "surprised", emoji: "😮", label: "Me sorprendió" },
  { value: "sad", emoji: "😢", label: "Me emocionó" },
  { value: "angry", emoji: "😡", label: "Me molestó" },
  { value: "clap", emoji: "👏", label: "Aplausos" },
  { value: "love", emoji: "😍", label: "Me encantó" },
  { value: "thinking", emoji: "🤔", label: "Me dejó pensando" },
  { value: "impact", emoji: "😱", label: "Me impactó" },
  { value: "sensitive", emoji: "🥹", label: "Estoy sensible" },
  { value: "rofl", emoji: "🤣", label: "Demasiado bueno" },
  { value: "fire", emoji: "🔥", label: "Esta parte 🔥" },
  { value: "eyes", emoji: "👀", label: "Quiero saber más" },
  { value: "skull", emoji: "💀", label: "No puedo con esto" },
  { value: "unamused", emoji: "🙄", label: "¿En serio?" },
  { value: "lip_bite", emoji: "🫦", label: "Labio mordido" },
  { value: "lips", emoji: "👄", label: "Labios" },
  { value: "eye", emoji: "👁️", label: "Ojo" },
];

// Las que se muestran siempre; el resto se elige desde el selector.
export const QUICK_CHAPTER_REACTIONS = ["heart", "laugh", "surprised", "fire"];

export const MAX_CHAPTER_COMMENT_LENGTH = 1000;
// Emojis que puede incluir el texto de un comentario, iguales o combinados.
// No tiene relación con las reacciones.
export const MAX_CHAPTER_COMMENT_EMOJIS = 12;
export const MAX_CHAPTER_QUOTE_LENGTH = 600;
