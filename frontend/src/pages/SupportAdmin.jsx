import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

export default function SupportAdmin() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

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

  return (
    <main className="support-admin-page">
      <div className="support-admin-container">

        <div className="support-admin-header">
          <div>
            <p className="support-eyebrow">
              ADMINISTRACIÓN
            </p>

            <h1>
              Solicitudes de soporte
            </h1>

            <p className="support-admin-intro">
              Revisa y gestiona las solicitudes enviadas por la comunidad.
            </p>
          </div>

          <Link
            to="/"
            className="support-admin-back"
          >
            ← Volver a FriBuk
          </Link>
        </div>

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
          <div className="support-ticket-list">

            {tickets.map((ticket) => (
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
                      <a
                        href={ticket.fribuk_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {ticket.fribuk_url}
                      </a>
                    </p>
                  )}

                  {ticket.external_url && (
                    <p className="support-ticket-detail">
                      <strong>Enlace externo:</strong>{" "}
                      <a
                        href={ticket.external_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {ticket.external_url}
                      </a>
                    </p>
                  )}

                  {ticket.reported_url && (
                    <p className="support-ticket-detail">
                      <strong>Contenido reportado:</strong>{" "}
                      <a
                        href={ticket.reported_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {ticket.reported_url}
                      </a>
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

              </article>
            ))}

          </div>
        )}

      </div>
    </main>
  );
}
