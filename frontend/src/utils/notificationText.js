// Texto, icono y destino de cada tipo de notificación.
// El mensaje se compone al mostrar: usa el username actual del actor y los
// datos de apoyo guardados con la notificación (títulos, extracto, estado).

const SUPPORT_STATUS_LABELS = {
  pending: "pendiente",
  in_review: "en revisión",
  resolved: "resuelta",
};

function quoted(title, fallback) {
  return title ? `«${title}»` : fallback;
}

// "y 3 personas más" cuando la notificación agrupa a varias personas.
function others(notification) {
  const extra = (notification.actor_count || 1) - 1;
  if (extra <= 0) return "";
  return extra === 1 ? " y 1 persona más" : ` y ${extra} personas más`;
}

function plural(notification, singular, pluralForm) {
  return (notification.actor_count || 1) > 1 ? pluralForm : singular;
}

export function getNotificationContent(notification) {
  const data = notification.data || {};
  const story = quoted(data.story_title, "tu historia");
  const actor = notification.actor?.username
    ? `@${notification.actor.username}`
    : notification.actor
      ? "Alguien"
      : "";

  switch (notification.type) {
    case "follow":
      return {
        icon: "👤",
        actor,
        text: `${others(notification)} ${plural(notification, "comenzó", "comenzaron")} a seguirte.`,
        to: notification.actor?.id ? `/usuario/${notification.actor.id}` : "/perfil",
      };
    case "story_comment":
      return {
        icon: "💬",
        actor,
        text: ` comentó tu historia ${story}.`,
        excerpt: data.excerpt,
        to: `/stories/${notification.story_id}`,
      };
    case "story_vote":
      return {
        icon: "❤️",
        actor,
        text: `${others(notification)} ${plural(notification, "recomendó", "recomendaron")} tu historia ${story}.`,
        to: `/stories/${notification.story_id}`,
      };
    case "story_favorite":
      return {
        icon: "★",
        actor,
        text: `${others(notification)} ${plural(notification, "guardó", "guardaron")} tu historia ${story} en favoritos.`,
        to: `/stories/${notification.story_id}`,
      };
    case "story_rating":
      return {
        icon: "⭐",
        actor,
        text: `${others(notification)} ${plural(notification, "valoró", "valoraron")} tu historia ${story}.`,
        to: `/stories/${notification.story_id}`,
      };
    case "story_chapter": {
      const chapter = [
        data.chapter_number != null ? `Capítulo ${data.chapter_number}` : "",
        data.chapter_title || "",
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        icon: "📖",
        actor: "",
        text: `Nuevo capítulo de ${quoted(data.story_title, "una historia de tus favoritos")}${chapter ? `: ${chapter}` : ""}.`,
        to:
          notification.story_id && notification.chapter_id
            ? `/stories/${notification.story_id}/chapters/${notification.chapter_id}`
            : `/stories/${notification.story_id}`,
      };
    }
    case "forum_reply":
      return {
        icon: "🗨️",
        actor,
        text: ` respondió tu tema ${quoted(data.topic_title, "del foro")}.`,
        excerpt: data.excerpt,
        to: `/forum/${notification.forum_topic_id}`,
      };
    case "support_status":
      return {
        icon: "🛟",
        actor: "",
        text: `Tu solicitud de soporte${data.category ? ` (${data.category})` : ""} ahora está ${SUPPORT_STATUS_LABELS[data.status] || "actualizada"}.`,
        to: "/support",
      };
    default:
      return { icon: "🔔", actor: "", text: "Tienes una notificación nueva.", to: "/actividad" };
  }
}

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function formatNotificationTime(value) {
  const timestamp = Date.parse(value || "");
  if (Number.isNaN(timestamp)) return "";

  const seconds = Math.round((timestamp - Date.now()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return RELATIVE_FORMAT.format(Math.round(seconds / size), unit);
    }
  }
  return "ahora";
}

export function formatUnreadCount(count) {
  return count > 99 ? "99+" : String(count);
}
