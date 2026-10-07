// Reglas de texto de Mensajes. Los límites coinciden con los del backend
// (backend/messages.py), que es quien los hace cumplir.

export const PRIVATE_MESSAGE_MAX_LENGTH = 2000;
export const AUTHOR_POST_MAX_LENGTH = 2000;
export const AUTHOR_REPLY_MAX_LENGTH = 1000;
export const REPORT_REASON_MAX_LENGTH = 500;

export const ALLOW_FROM_OPTIONS = [
  {
    value: "everyone",
    label: "Todos",
    description: "Cualquier persona de FriBuk puede escribirte.",
  },
  {
    value: "following",
    label: "Solo personas que sigo",
    description: "Solo te escriben las personas que tú sigues.",
  },
  {
    value: "nobody",
    label: "Nadie",
    description: "No recibes mensajes privados nuevos.",
  },
];

// Aviso a otras partes de la página (la barra de navegación, la bandeja)
// de que cambió algo en Mensajes y conviene volver a consultar.
export const MESSAGES_CHANGED_EVENT = "fribuk:messages-changed";

export function notifyMessagesChanged() {
  window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
}

// Última página visitada fuera de Mensajes: a ella vuelve el botón de cerrar.
let messagesReturnPath = "/";

export function rememberMessagesReturnPath(path) {
  if (path && !path.startsWith("/mensajes")) messagesReturnPath = path;
}

export function getMessagesReturnPath() {
  return messagesReturnPath;
}

const INVISIBLE = /\s|\u200b|\u200c|\u200d|\u2060|\ufeff/g;

// Devuelve el motivo por el que un texto no se puede enviar, o "" si sirve.
export function messageTextError(value, maxLength) {
  const text = typeof value === "string" ? value : "";

  if (!text.replace(INVISIBLE, "")) return "Escribe un mensaje.";
  if (Array.from(text.trim()).length > maxLength) {
    return `El mensaje no puede superar los ${maxLength} caracteres.`;
  }
  return "";
}

export function apiErrorDetail(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

export function formatUnreadCount(count) {
  if (!count || count < 1) return "";
  return count > 99 ? "99+" : String(count);
}

function isSameDay(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

// Fecha corta para la bandeja: la hora si es de hoy; si no, el día.
export function formatInboxDate(value, now = new Date()) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function formatMessageTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatMessageDateTime(value, now = new Date()) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return `${formatDayLabel(value, now)}, ${formatMessageTime(value)}`;
}

export function formatDayLabel(value, now = new Date()) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return "Hoy";
  if (isSameDay(date, yesterday)) return "Ayer";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

// Agrupa los mensajes de una conversación por día, en el orden recibido.
export function groupMessagesByDay(messages, now = new Date()) {
  const groups = [];

  for (const message of messages) {
    const label = formatDayLabel(message.created_at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.messages.push(message);
    } else {
      groups.push({ label, messages: [message] });
    }
  }

  return groups;
}
