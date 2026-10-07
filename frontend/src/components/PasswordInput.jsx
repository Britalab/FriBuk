import { useState } from "react";

// Campo de contraseña con un botón de ojo para mostrarla u ocultarla.
// Acepta las mismas propiedades que un <input>.
export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input {...props} type={visible ? "text" : "password"} />

      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {/* Ojo tachado: la contraseña está oculta. */}
          {!visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
