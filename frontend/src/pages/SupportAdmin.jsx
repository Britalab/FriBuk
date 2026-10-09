import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import ModerationPanel from "../components/moderation/ModerationPanel";

// Los enlaces los escribe quien envía la solicitud. Solo se convierten en
// enlace si son http(s); cualquier otro esquema (por ejemplo "javascript:")
// se muestra como texto para que no pueda ejecutarse al hacer clic.
function SafeLink({ url }) {
  if (!/^https?:\/\//i.test(url || "")) {
    return <span>{url}</span>;
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  );
}

// Agrupa las solicitudes por temática. Dentro de cada grupo van primero
// las que siguen sin resolver y, entre iguales, las más recientes. Los
// grupos con solicitudes sin resolver van arriba.
function groupByCategory(tickets) {
  const groups = new Map();

  for (const ticket of tickets) {
    const category = (ticket.category || "").trim() || "Sin temática";
    if (!groups.has(category)) {
      groups.set(category, { category, tickets: [], open: 0 });
    }

    const group = groups.get(category);
    group.tickets.push(ticket);
    if (ticket.status !== "resolved") group.open += 1;
  }

  for (const group of groups.values()) {
    group.tickets.sort((a, b) => (
      (a.status === "resolved") - (b.status === "resolved") ||
      String(b.created_at).localeCompare(String(a.created_at))
    ));
  }

  return Array.from(groups.values()).sort((a, b) => (
    (b.open > 0) - (a.open > 0) ||
    a.category.localeCompare(b.category, "es")
  ));
}

export default function SupportAdmin() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  // Solicitud desde la que se está eliminando una cuenta.
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const loadTickets = async () => {
      try {
        const response = await api.get("/support/admin");

        setTickets(response.data.support_requests);
      } catch (error) {
        console.error(error);

        if (error.response?.status === 403) {
          setError("No tienes permisos para acceder a este panel.");
        } else {
          setError("No pudimos cargar las solicitudes de soporte.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadTickets();
  }, []);

  // Elimina la cuenta de quien envió la solicitud. Pide escribir el nombre
  // de usuario: no se puede deshacer. El servidor repite todas las
  // comprobaciones.
  const handleDeleteAccount = async (ticket) => {
    setDeletingId(ticket.id);

    try {
      const { data: account } = await api.get(`/admin/accounts/${ticket.user_id}`);

      if (account.is_deleted) {
        window.alert("Esta cuenta ya fue eliminada.");
        return;
      }

      if (account.is_self || account.role === "admin") {
        window.alert("No se puede eliminar una cuenta de administración.");
        return;
      }

      const typed = window.prompt(
        `Vas a ELIMINAR la cuenta @${account.username}.\n\n` +
          `Se borrarán sus historias (${account.stories}) con sus capítulos, ` +
          "sus listas, mensajes, seguidores, imágenes y datos de perfil, y no " +
          "podrá volver a iniciar sesión.\n" +
          "Sus publicaciones del foro y sus comentarios en historias de otras " +
          "personas se conservan, firmados por un usuario eliminado.\n\n" +
          "NO SE PUEDE DESHACER.\n\n" +
          `Para confirmar, escribe el nombre de usuario: ${account.username}`
      );

      if (typed === null) return;

      const { data: result } = await api.post(
        `/admin/accounts/${ticket.user_id}/delete`,
        { confirm_username: typed }
      );

      window.alert(
        result.problems.length === 0
          ? `La cuenta @${result.previous_username} fue eliminada.`
          : `La cuenta @${result.previous_username} quedó sin acceso, pero ` +
            "algunos datos no se pudieron borrar:\n\n- " +
            result.problems.join("\n- ") +
            "\n\nAnota esta lista para revisarlo."
      );
    } catch (error) {
      console.error(error);
      window.alert(
        error.response?.data?.detail || "No se pudo eliminar la cuenta."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      setUpdatingId(ticketId);

      const response = await api.patch(
        `/support/admin/${ticketId}/status`,
        {
          status: newStatus,
        }
      );

      const updatedTicket = response.data.support_request;

      setTickets((currentTickets) =>
        currentTickets.map((ticket) =>
          ticket.id === ticketId ? updatedTicket : ticket
        )
      );
    } catch (error) {
      console.error(error);

      alert(
        error.response?.data?.detail ||
        "No pudimos actualizar el estado de la solicitud."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const groups = groupByCategory(tickets);

  return (
    <main className="support-admin-page">
      <div className="support-admin-container">

        <div className="support-admin-header">
          <div>
            <p className="support-eyebrow">
              ADMINISTRACIÓN
            </p>

            <h1>
              Soporte y moderación
            </h1>

            <p className="support-admin-intro">
              Revisa el contenido reportado y las solicitudes enviadas por la
              comunidad.
            </p>
          </div>

          <Link
            to="/"
            className="support-admin-back"
          >
            ← Volver a FriBuk
          </Link>
        </div>

        {/* La moderación solo se muestra si la cuenta es de administración. */}
        {!loading && !error && <ModerationPanel />}

        {!loading && !error && (
          <h2 className="support-admin-section-title">Solicitudes de soporte</h2>
        )}

        {loading && (
          <div className="support-admin-state">
            Cargando solicitudes...
          </div>
        )}

        {!loading && error && (
          <div className="support-admin-error">
            {error}
          </div>
        )}

        {!loading && !error && tickets.length === 0 && (
          <div className="support-admin-state">
            No hay solicitudes de soporte.
          </div>
        )}

        {!loading && !error && tickets.length > 0 && (
          <div className="support-ticket-groups">

            {groups.map((group) => (
              <details className="support-ticket-group" key={group.category}>

                <summary>
                  <span className="support-ticket-group-name">
                    {group.category}
                  </span>

                  {group.open > 0 && (
                    <span className="support-ticket-group-open">
                      {group.open} sin resolver
                    </span>
                  )}

                  <span className="support-ticket-group-total">
                    {group.tickets.length}{" "}
                    {group.tickets.length === 1 ? "solicitud" : "solicitudes"}
                  </span>
                </summary>

                <div className="support-ticket-list">

                  {group.tickets.map((ticket) => (
                    <article
                      key={ticket.id}
                      className="support-ticket-card"
                    >

                      <div className="support-ticket-top">

                        <span className="support-ticket-category">
                          {ticket.category}
                        </span>

                        <select
                          className={`support-ticket-status ${ticket.status}`}
                          value={ticket.status}
                          disabled={updatingId === ticket.id}
                          onChange={(event) =>
                            handleStatusChange(
                              ticket.id,
                              event.target.value
                            )
                          }
                        >
                          <option value="pending">
                            Pendiente
                          </option>

                          <option value="in_review">
                            En revisión
                          </option>

                          <option value="resolved">
                            Resuelto
                          </option>
                        </select>

                      </div>

                      <div className="support-ticket-content">

                        {ticket.message && (
                          <p className="support-ticket-message">
                            {ticket.message}
                          </p>
                        )}

                        {ticket.story_title && (
                          <p className="support-ticket-detail">
                            <strong>Obra:</strong>{" "}
                            {ticket.story_title}
                          </p>
                        )}

                        {ticket.fribuk_url && (
                          <p className="support-ticket-detail">
                            <strong>FriBuk:</strong>{" "}
                            <SafeLink url={ticket.fribuk_url} />
                          </p>
                        )}

                        {ticket.external_url && (
                          <p className="support-ticket-detail">
                            <strong>Enlace externo:</strong>{" "}
                            <SafeLink url={ticket.external_url} />
                          </p>
                        )}

                        {ticket.reported_url && (
                          <p className="support-ticket-detail">
                            <strong>Contenido reportado:</strong>{" "}
                            <SafeLink url={ticket.reported_url} />
                          </p>
                        )}

                      </div>

                      <div className="support-ticket-footer">

                        <span>
                          {new Date(ticket.created_at).toLocaleString("es-CL")}
                        </span>

                        <span className="support-ticket-id">
                          #{ticket.id.slice(0, 8)}
                        </span>

                      </div>

                      {ticket.user_id && (
                        <div className="support-ticket-danger">
                          <button
                            type="button"
                            className="support-ticket-delete-account"
                            onClick={() => handleDeleteAccount(ticket)}
                            disabled={deletingId !== null}
                          >
                            {deletingId === ticket.id
                              ? "Eliminando..."
                              : "Eliminar la cuenta de quien envió esta solicitud"}
                          </button>
                        </div>
                      )}

                    </article>
                  ))}

                </div>

              </details>
            ))}

          </div>
        )}

      </div>
    </main>
  );
}
