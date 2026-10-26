import { useCallback, useEffect, useRef, useState } from "react";
import ModerationDialog from "../moderation/ModerationDialog";
import { useToast } from "../../hooks/useToast";
import { canvasToBlob, drawProfileQr, profileUrl } from "../../utils/profileQr";

// Botón "Mi QR": muestra el QR del perfil con la foto al centro, para
// descargarlo o compartirlo como imagen.
export default function ProfileQrButton({ userId, username, avatarUrl, className }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [canShareImage, setCanShareImage] = useState(false);
  const canvasRef = useRef(null);
  const fileName = `fribuk-${username}-qr.png`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    drawProfileQr(canvasRef.current, {
      url: profileUrl(window.location.origin, userId),
      avatarUrl,
      username,
    })
      .then(async () => {
        if (cancelled) return;
        setStatus("ready");
        // Compartir la imagen (WhatsApp, Instagram...) solo donde se puede.
        try {
          const file = new File([await canvasToBlob(canvasRef.current)], fileName, {
            type: "image/png",
          });
          if (!cancelled) setCanShareImage(Boolean(navigator.canShare?.({ files: [file] })));
        } catch {
          if (!cancelled) setCanShareImage(false);
        }
      })
      .catch((error) => {
        console.error("No se pudo crear el QR:", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open, userId, avatarUrl, username, fileName]);

  const handleDownload = async () => {
    try {
      const url = URL.createObjectURL(await canvasToBlob(canvasRef.current));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("No se pudo descargar el QR:", error);
      showToast("No se pudo descargar el QR. Intenta nuevamente.", "error");
    }
  };

  const handleShare = async () => {
    try {
      const file = new File([await canvasToBlob(canvasRef.current)], fileName, {
        type: "image/png",
      });
      await navigator.share({ files: [file], title: `@${username} en FriBuk` });
    } catch (error) {
      // Cerrar el menú sin elegir nada no es un error.
      if (error?.name === "AbortError") return;
      console.error("No se pudo compartir el QR:", error);
      showToast("No se pudo compartir el QR. Prueba descargándolo.", "error");
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setStatus("loading");
          setOpen(true);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
        </svg>
        Mi QR
      </button>

      {open && (
        <ModerationDialog title="Tu QR de FriBuk" onClose={close}>
          <div className="moderation-form profile-qr">
            <p className="profile-qr-hint">
              Quien lo escanee con la cámara llega directo a tu perfil.
            </p>
            <div className="profile-qr-frame" aria-busy={status === "loading"}>
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`Código QR del perfil de @${username}`}
                hidden={status !== "ready"}
              />
              {status === "loading" && <p className="profile-qr-state">Creando tu QR...</p>}
              {status === "error" && (
                <p className="profile-qr-state" role="alert">
                  No se pudo crear el QR. Cierra y vuelve a intentarlo.
                </p>
              )}
            </div>
            <div className="moderation-form-actions">
              {canShareImage && (
                <button
                  type="button"
                  className="moderation-button"
                  onClick={handleShare}
                  disabled={status !== "ready"}
                >
                  Compartir
                </button>
              )}
              <button
                type="button"
                className="moderation-button is-primary"
                onClick={handleDownload}
                disabled={status !== "ready"}
              >
                Descargar QR
              </button>
            </div>
          </div>
        </ModerationDialog>
      )}
    </>
  );
}
