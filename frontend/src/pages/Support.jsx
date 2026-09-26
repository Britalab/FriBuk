import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

const wordCount = (text) =>
  text.trim().split(/\s+/).filter(Boolean).length;
const MAX_SUPPORT_WORDS = 100;
const MAX_SUPPORT_CHARACTERS = 1000;

const setTextWithinWordLimit = (event, setValue) => {
  if (
    wordCount(event.target.value) <= MAX_SUPPORT_WORDS &&
    event.target.value.length <= MAX_SUPPORT_CHARACTERS
  ) {
    setValue(event.target.value);
  }
};

const categoriesRequiringMessage = [
  "Problemas con mi cuenta",
  "Problemas con una historia",
  "Problemas al publicar o editar",
  "Problemas con una imagen o portada",
  "Comentarios, votos o valoraciones",
  "Privacidad o seguridad",
];

const statusLabels = {
  pending: "Pendiente",
  in_review: "En revisión",
  resolved: "Resuelto",
};

const statusClasses = {
  pending: "pending",
  in_review: "in-review",
  resolved: "resolved",
};

export default function Support() {
  const [category, setCategory] = useState("");
  const [otherMessage, setOtherMessage] = useState("");

  const [copyrightTitle, setCopyrightTitle] = useState("");
  const [copyrightFribukUrl, setCopyrightFribukUrl] = useState("");
  const [copyrightExternalUrl, setCopyrightExternalUrl] = useState("");
  const [copyrightMessage, setCopyrightMessage] = useState("");

  const [reportUrl, setReportUrl] = useState("");
  const [reportReason, setReportReason] = useState("");

  const [supportRequests, setSupportRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const categories = [
    "Problemas con mi cuenta",
    "Problemas con una historia",
    "Problemas al publicar o editar",
    "Problemas con una imagen o portada",
    "Comentarios, votos o valoraciones",
    "Mi obra fue publicada sin mi permiso",
    "Quiero reportar contenido",
    "Algo no funciona correctamente",
    "Privacidad o seguridad",
    "Otro",
  ];

  useEffect(() => {
    const fetchSupportRequests = async () => {
      try {
        const response = await api.get("/support");

        setSupportRequests(response.data.support_requests || []);
      } catch (error) {
        console.error("Error al cargar solicitudes:", error);
      } finally {
        setLoadingRequests(false);
      }
    };

    fetchSupportRequests();
  }, []);

  const handleCategoryChange = (selectedCategory) => {
    setCategory(selectedCategory);
    setFeedback(null);

    setOtherMessage("");
    setCopyrightTitle("");
    setCopyrightFribukUrl("");
    setCopyrightExternalUrl("");
    setCopyrightMessage("");
    setReportUrl("");
    setReportReason("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    if (
      categoriesRequiringMessage.includes(category) &&
      wordCount(otherMessage) === 0
    ) {
      setFeedback({
        type: "error",
        message: "Cuéntanos brevemente qué necesitas.",
      });
      return;
    }

    if (
      category === "Algo no funciona correctamente" &&
      wordCount(otherMessage) === 0
    ) {
      setFeedback({
        type: "error",
        message: "Cuéntanos brevemente qué no está funcionando.",
      });
      return;
    }

    if (
      category === "Mi obra fue publicada sin mi permiso" &&
      !copyrightMessage.trim()
    ) {
      setFeedback({
        type: "error",
        message: "Cuéntanos brevemente qué ocurrió con tu obra.",
      });
      return;
    }

    if (
      category === "Quiero reportar contenido" &&
      (!reportUrl.trim() || !reportReason.trim())
    ) {
      setFeedback({
        type: "error",
        message: "Indica el enlace del contenido y el motivo del reporte.",
      });
      return;
    }

    if (category === "Otro" && !otherMessage.trim()) {
      setFeedback({
        type: "error",
        message: "Cuéntanos brevemente qué necesitas.",
      });
      return;
    }

    setSubmitting(true);

    let message = null;
    let storyTitle = null;
    let fribukUrl = null;
    let externalUrl = null;
    let reportedUrl = null;

    if (category === "Otro") {
      message = otherMessage.trim();
    }

    if (category === "Algo no funciona correctamente") {
      message = otherMessage.trim();
    }

    if (categoriesRequiringMessage.includes(category)) {
      message = otherMessage.trim();
    }

    if (category === "Mi obra fue publicada sin mi permiso") {
      message = copyrightMessage.trim();
      storyTitle = copyrightTitle;
      fribukUrl = copyrightFribukUrl;
      externalUrl = copyrightExternalUrl;
    }

    if (category === "Quiero reportar contenido") {
      message = reportReason.trim();
      reportedUrl = reportUrl.trim();
    }

    try {
      const response = await api.post("/support", {
        category,
        message,
        story_title: storyTitle,
        fribuk_url: fribukUrl,
        external_url: externalUrl,
        reported_url: reportedUrl,
      });

      setFeedback({
        type: "success",
        message: "Recibimos tu mensaje. Gracias por avisarnos.",
      });

      // Agregamos inmediatamente la nueva solicitud a la lista.
      if (response.data?.support_request) {
        setSupportRequests((current) => [
          response.data.support_request,
          ...current,
        ]);
      } else {
        // Si el POST no devuelve la solicitud completa,
        // volvemos a consultar GET /support.
        const requestsResponse = await api.get("/support");

        setSupportRequests(
          requestsResponse.data.support_requests || []
        );
      }

      // Limpiar formulario después de enviar.
      setCategory("");
      setOtherMessage("");
      setCopyrightTitle("");
      setCopyrightFribukUrl("");
      setCopyrightExternalUrl("");
      setCopyrightMessage("");
      setReportUrl("");
      setReportReason("");
    } catch (error) {
      console.error(error);

      const detail = error.response?.data?.detail;

      setFeedback({
        type: "error",
        message:
          typeof detail === "string"
            ? detail
            : "No pudimos enviar tu solicitud. Inténtalo nuevamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";

    return new Date(dateString).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <main className="support-page">
      <div className="support-container">

        {/* =========================
            ENCABEZADO
        ========================== */}
        <p className="support-eyebrow">AYUDA Y SOPORTE</p>

        <h1>¿En qué podemos ayudarte?</h1>

        <p className="support-intro">
          Revisa tus solicitudes o envía una nueva consulta al equipo
          de FriBuk.
        </p>

        {/* =========================
            MIS SOLICITUDES
        ========================== */}
        <section className="support-requests-section">
          <div className="support-section-header">
            <div>
              <p className="support-section-eyebrow">
                SEGUIMIENTO
              </p>

              <h2>Mis solicitudes</h2>

              <p>
                Aquí puedes revisar el estado de las solicitudes que
                has enviado a FriBuk.
              </p>
            </div>
          </div>

          {loadingRequests ? (
            <div className="support-requests-loading">
              Cargando tus solicitudes...
            </div>
          ) : supportRequests.length === 0 ? (
            <div className="support-empty">
              <div className="support-empty-icon">?</div>

              <h3>Aún no tienes solicitudes</h3>

              <p>
                Cuando envíes una consulta aparecerá aquí para que
                puedas revisar su estado.
              </p>
            </div>
          ) : (
            <div className="support-requests-list">
              {supportRequests.map((request) => (
                <article
                  className="support-request-card"
                  key={request.id}
                >
                  <div className="support-request-top">
                    <div>
                      <span className="support-request-label">
                        Solicitud
                      </span>

                      <h3>{request.category}</h3>
                    </div>

                    <span
                      className={`support-request-status ${
                        statusClasses[request.status] || ""
                      }`}
                    >
                      {statusLabels[request.status] ||
                        request.status}
                    </span>
                  </div>

                  {request.message && (
                    <p className="support-request-message">
                      {request.message}
                    </p>
                  )}

                  <div className="support-request-footer">
                    <span>
                      Enviada el {formatDate(request.created_at)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* =========================
            NUEVA SOLICITUD
        ========================== */}
        <section className="support-new-section">
          <div className="support-section-header">
            <div>
              <p className="support-section-eyebrow">
                NUEVA SOLICITUD
              </p>

              <h2>¿Necesitas ayuda?</h2>

              <p>
                Selecciona la opción que mejor describa tu problema.
              </p>
            </div>
          </div>

          <form
            className="support-form"
            onSubmit={handleSubmit}
            aria-busy={submitting}
          >
            <div className="form-group">
              <label>Selecciona una categoría</label>

              <div className="support-options">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`support-option ${
                      category === item ? "selected" : ""
                    }`}
                    onClick={() => handleCategoryChange(item)}
                  >
                    <span>{item}</span>

                    {category === item && (
                      <span className="support-option-check">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {categoriesRequiringMessage.includes(category) && (
              <div className="form-group">
                <div className="support-label-row">
                  <label htmlFor="supportIssueDetails">
                    Cuéntanos brevemente qué necesitas
                  </label>
                </div>

                <textarea
                  id="supportIssueDetails"
                  value={otherMessage}
                  onChange={(event) => setTextWithinWordLimit(event, setOtherMessage)}
                  rows="5"
                  maxLength={MAX_SUPPORT_CHARACTERS}
                  aria-describedby="support-issue-word-count"
                  placeholder="Describe brevemente qué ocurre..."
                  required
                />

                <p
                  className="support-word-count"
                  id="support-issue-word-count"
                >
                  {wordCount(otherMessage)}/{MAX_SUPPORT_WORDS} palabras · {otherMessage.length}/{MAX_SUPPORT_CHARACTERS} caracteres
                </p>
              </div>
            )}

            {category === "Mi obra fue publicada sin mi permiso" && (
              <div className="support-extra-fields">
                <div className="support-notice">
                  <strong>Sobre esta denuncia</strong>

                  <p>
                    Utiliza este formulario si crees que otra persona
                    publicó tu obra sin tu permiso. Proporciona la
                    mayor cantidad de información posible para que
                    podamos revisar el caso.
                  </p>
                </div>

                <div className="form-group">
                  <label htmlFor="copyrightTitle">
                    Título de tu obra
                  </label>

                  <input
                    id="copyrightTitle"
                    type="text"
                    value={copyrightTitle}
                    onChange={(event) =>
                      setCopyrightTitle(event.target.value)
                    }
                    placeholder="Ej: Las luces de Asteria"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="copyrightFribukUrl">
                    Enlace a tu obra en FriBuk
                  </label>

                  <input
                    id="copyrightFribukUrl"
                    type="url"
                    value={copyrightFribukUrl}
                    onChange={(event) =>
                      setCopyrightFribukUrl(event.target.value)
                    }
                    placeholder="https://..."
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="copyrightExternalUrl">
                    Enlace donde fue publicada o copiada
                  </label>

                  <input
                    id="copyrightExternalUrl"
                    type="url"
                    value={copyrightExternalUrl}
                    onChange={(event) =>
                      setCopyrightExternalUrl(event.target.value)
                    }
                    placeholder="https://..."
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="copyrightMessage">
                    Cuéntanos brevemente qué ocurrió
                  </label>

                  <textarea
                    id="copyrightMessage"
                    value={copyrightMessage}
                    onChange={(event) => setTextWithinWordLimit(event, setCopyrightMessage)}
                    rows="6"
                    maxLength={MAX_SUPPORT_CHARACTERS}
                    aria-describedby="copyright-message-word-count"
                    placeholder="Describe brevemente la situación..."
                    required
                  />
                  <p className="support-word-count" id="copyright-message-word-count">
                    {wordCount(copyrightMessage)}/{MAX_SUPPORT_WORDS} palabras · {copyrightMessage.length}/{MAX_SUPPORT_CHARACTERS} caracteres
                  </p>
                </div>
              </div>
            )}

            {category === "Quiero reportar contenido" && (
              <div className="support-extra-fields">
                <div className="form-group">
                  <label htmlFor="reportUrl">
                    Enlace del contenido
                  </label>

                  <input
                    id="reportUrl"
                    type="url"
                    value={reportUrl}
                    onChange={(event) =>
                      setReportUrl(event.target.value)
                    }
                    placeholder="https://..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="reportReason">
                    Motivo del reporte
                  </label>

                  <textarea
                    id="reportReason"
                    value={reportReason}
                    onChange={(event) => setTextWithinWordLimit(event, setReportReason)}
                    rows="6"
                    maxLength={MAX_SUPPORT_CHARACTERS}
                    aria-describedby="report-reason-word-count"
                    placeholder="Cuéntanos brevemente qué ocurre con este contenido..."
                    required
                  />
                  <p className="support-word-count" id="report-reason-word-count">
                    {wordCount(reportReason)}/{MAX_SUPPORT_WORDS} palabras · {reportReason.length}/{MAX_SUPPORT_CHARACTERS} caracteres
                  </p>
                </div>
              </div>
            )}

            {category === "Algo no funciona correctamente" && (
              <div className="form-group">
                <div className="support-label-row">
                  <label htmlFor="otherMessage">
                    Cuéntanos qué no está funcionando
                  </label>
                </div>

                <textarea
                  id="otherMessage"
                  value={otherMessage}
                  onChange={(event) => setTextWithinWordLimit(event, setOtherMessage)}
                  rows="5"
                  maxLength={MAX_SUPPORT_CHARACTERS}
                  aria-describedby="support-problem-word-count"
                  placeholder="Describe brevemente el problema..."
                />

                <p
                  className="support-word-count"
                  id="support-problem-word-count"
                >
                  {wordCount(otherMessage)}/{MAX_SUPPORT_WORDS} palabras · {otherMessage.length}/{MAX_SUPPORT_CHARACTERS} caracteres
                </p>
              </div>
            )}

            {category === "Otro" && (
              <div className="form-group">
                <div className="support-label-row">
                  <label htmlFor="otherMessage">
                    Cuéntanos brevemente qué necesitas
                  </label>
                </div>

                <textarea
                  id="otherMessage"
                  value={otherMessage}
                  onChange={(event) => setTextWithinWordLimit(event, setOtherMessage)}
                  rows="6"
                  maxLength={MAX_SUPPORT_CHARACTERS}
                  placeholder="Describe brevemente tu problema..."
                  required
                />

                <p className="support-word-count">
                  {wordCount(otherMessage)}/{MAX_SUPPORT_WORDS} palabras · {otherMessage.length}/{MAX_SUPPORT_CHARACTERS} caracteres
                </p>
              </div>
            )}

            {feedback && (
              <div
                className={`inline-feedback inline-feedback--${feedback.type}`}
                role={
                  feedback.type === "error"
                    ? "alert"
                    : "status"
                }
                aria-live="polite"
              >
                <span
                  className="inline-feedback-icon"
                  aria-hidden="true"
                >
                  {feedback.type === "success" ? "✓" : "!"}
                </span>

                <p className="inline-feedback-message">
                  {feedback.message}
                </p>
              </div>
            )}

            <button
              type="submit"
              className="support-button"
              disabled={!category || submitting}
            >
              {submitting ? "Enviando..." : "Enviar a FriBuk"}

              <span>→</span>
            </button>
          </form>
        </section>

        <Link to="/" className="support-back">
          ← Volver a FriBuk
        </Link>
      </div>
    </main>
  );
}
