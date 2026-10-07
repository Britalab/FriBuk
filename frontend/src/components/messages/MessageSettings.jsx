import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useToast } from "../../hooks/useToast";
import MessageAvatar from "./MessageAvatar";
import MessagesClose from "./MessagesClose";
import { ALLOW_FROM_OPTIONS, apiErrorDetail } from "../../utils/messages";

// Privacidad de mensajes: quién puede escribirme en privado y a quién bloqueé.
// El backend aplica estas reglas en cada envío.
export default function MessageSettings() {
  const { showToast } = useToast();
  const [allowFrom, setAllowFrom] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isActive = true;

    Promise.all([api.get("/me/message-settings"), api.get("/me/blocks")])
      .then(([settingsResponse, blocksResponse]) => {
        if (!isActive) return;
        setAllowFrom(settingsResponse.data.allow_from);
        setBlocked(blocksResponse.data.blocked || []);
      })
      .catch((requestError) => {
        if (isActive) {
          setError(apiErrorDetail(requestError, "No se pudo cargar tu privacidad."));
        }
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleChange = async (value) => {
    if (saving || value === allowFrom) return;

    const previous = allowFrom;
    setAllowFrom(value);
    setSaving(true);

    try {
      await api.put("/me/message-settings", { allow_from: value });
      showToast("Privacidad de mensajes actualizada.");
    } catch (requestError) {
      setAllowFrom(previous);
      showToast(apiErrorDetail(requestError, "No se pudo guardar el cambio."), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async (user) => {
    try {
      await api.delete(`/users/${user.id}/block`);
      setBlocked((current) => current.filter((item) => item.id !== user.id));
      showToast(`Desbloqueaste a @${user.username}.`);
    } catch (requestError) {
      showToast(apiErrorDetail(requestError, "No se pudo desbloquear."), "error");
    }
  };

  return (
    <>
      <header className="messages-thread-header">
        <Link
          to="/mensajes"
          className="messages-back"
          aria-label="Volver a la lista de mensajes"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <div className="messages-thread-user">
          <span>Privacidad de mensajes</span>
        </div>

        <MessagesClose inThread />
      </header>

      <div className="messages-scroll messages-settings">
        {loading ? (
          <p className="messages-state">Cargando...</p>
        ) : error ? (
          <p className="messages-state" role="alert">{error}</p>
        ) : (
          <>
            <fieldset className="messages-privacy" disabled={saving}>
              <legend>¿Quién puede enviarte mensajes privados?</legend>

              {ALLOW_FROM_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`messages-privacy-option${
                    allowFrom === option.value ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="allow-from"
                    value={option.value}
                    checked={allowFrom === option.value}
                    onChange={() => handleChange(option.value)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <section className="messages-blocked" aria-labelledby="messages-blocked-title">
              <h2 id="messages-blocked-title">Personas bloqueadas</h2>

              {blocked.length === 0 ? (
                <p className="messages-hint">
                  No has bloqueado a nadie. Puedes bloquear a una persona desde
                  la conversación con ella.
                </p>
              ) : (
                <ul>
                  {blocked.map((user) => (
                    <li key={user.id}>
                      <MessageAvatar user={user} size="small" />
                      <span>@{user.username}</span>
                      <button
                        type="button"
                        className="messages-button"
                        onClick={() => handleUnblock(user)}
                      >
                        Desbloquear
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
