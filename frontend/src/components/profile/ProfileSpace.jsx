import {
  MAX_STICKERS,
  STICKERS_ID,
  emojiUrl,
  getEmoji,
  getTheme,
  isAmbient,
  normalizeCustomization,
} from "../../profile/catalog";
import "../../styles/profile-themes.css";

function selectedEmojis(customization) {
  return normalizeCustomization(customization)
    .decorations.map(getEmoji)
    .filter(Boolean);
}

// Contenedor que aplica la personalización de «Mi espacio» mediante atributos.
// No genera CSS por usuario: los estilos viven en styles/profile-themes.css.
export default function ProfileSpace({
  as: Tag = "div",
  customization,
  className = "",
  children,
  ...rest
}) {
  const config = normalizeCustomization(customization);
  const theme = getTheme(config.theme);
  const ambient = config.decorations.find(isAmbient);

  return (
    <Tag
      {...rest}
      className={`profile-space ${className}`.trim()}
      data-profile-theme={theme.id}
      data-profile-surface={theme.surface}
      data-profile-accent={config.colors.accent || undefined}
      data-profile-ambient={ambient || undefined}
    >
      {children}
    </Tag>
  );
}

// Emojis elegidos, en línea junto al nombre del perfil.
export function ProfileEmojis({ customization }) {
  const emojis = selectedEmojis(customization);

  if (emojis.length === 0) return null;

  return (
    <span className="profile-emojis">
      {emojis.map((emoji) => (
        <img key={emoji.id} src={emojiUrl(emoji.id)} alt={emoji.name} />
      ))}
    </span>
  );
}

// Los mismos emojis como pegatinas. Van dentro de la cabecera del perfil,
// detrás del contenido, y quedan ocultos para lectores de pantalla (el
// nombre ya los anuncia).
export function ProfileStickers({ customization }) {
  const config = normalizeCustomization(customization);
  const emojis = selectedEmojis(config);

  if (emojis.length === 0 || !config.decorations.includes(STICKERS_ID)) {
    return null;
  }

  return (
    <div className="profile-decor" aria-hidden="true">
      {emojis.slice(0, MAX_STICKERS).map((emoji) => (
        <img
          className="profile-sticker"
          key={emoji.id}
          src={emojiUrl(emoji.id)}
          alt=""
        />
      ))}
    </div>
  );
}
