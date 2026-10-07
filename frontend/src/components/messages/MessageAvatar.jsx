// Avatar pequeño de una persona en Mensajes: su foto o su inicial.
export default function MessageAvatar({ user, size = "medium" }) {
  const username = user?.username || "Usuario";

  return (
    <span className={`message-avatar is-${size}`} aria-hidden="true">
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" loading="lazy" />
      ) : (
        username.charAt(0).toUpperCase()
      )}
    </span>
  );
}
