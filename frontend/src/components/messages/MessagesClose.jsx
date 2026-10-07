import { useNavigate } from "react-router-dom";
import { getMessagesReturnPath } from "../../utils/messages";

// Botón "×" para salir de Mensajes y volver a la página desde la que se entró.
// `inThread` es la copia que va en la cabecera de una conversación: solo se
// muestra en el teléfono, donde la bandeja (y su botón) no está a la vista.
export default function MessagesClose({ inThread = false }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={`messages-close${inThread ? " is-in-thread" : ""}`}
      onClick={() => navigate(getMessagesReturnPath())}
      aria-label="Cerrar Mensajes"
      title="Cerrar Mensajes"
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
