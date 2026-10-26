// QR del perfil, con la foto de la persona al centro y su nombre debajo.
//
// Se dibuja en el navegador y no se guarda en ninguna parte. El QR usa el
// nivel de corrección más alto (H, hasta ~30 % de daño): la foto tapa menos
// que eso y se sigue pudiendo leer.

export const QR_SIZE = 600;
const FOOTER_HEIGHT = 84;
// Lado de la foto respecto del QR. Con más, algunos lectores fallan.
const PHOTO_RATIO = 0.22;
// Oscuro sobre claro siempre, también en modo oscuro: muchos lectores no
// reconocen un QR claro sobre fondo oscuro.
const DARK = "#51202d";
const LIGHT = "#ffffff";

export function profileUrl(origin, userId) {
  return `${origin}/usuario/${encodeURIComponent(userId)}`;
}

// Recorte centrado para llenar un cuadrado sin deformar la imagen.
export function coverCrop(width, height) {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Sin esto, el QR con la foto no se podría descargar.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function centerImage(avatarUrl) {
  if (avatarUrl) {
    try {
      return await loadImage(avatarUrl);
    } catch {
      // Sin la foto, va el logo.
    }
  }
  return loadImage("/logo-fribuk.jpg");
}

export async function drawProfileQr(canvas, { url, avatarUrl, username }) {
  const QRCode = (await import("qrcode")).default;

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, {
    errorCorrectionLevel: "H",
    margin: 3,
    width: QR_SIZE,
    color: { dark: DARK, light: LIGHT },
  });

  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE + FOOTER_HEIGHT;
  const context = canvas.getContext("2d");

  context.fillStyle = LIGHT;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(qr, 0, 0);

  // Foto redonda con un aro blanco, para separarla de los cuadritos.
  const photo = await centerImage(avatarUrl);
  const size = QR_SIZE * PHOTO_RATIO;
  const center = QR_SIZE / 2;
  const crop = coverCrop(photo.naturalWidth, photo.naturalHeight);

  context.beginPath();
  context.arc(center, center, size / 2 + 8, 0, Math.PI * 2);
  context.fillStyle = LIGHT;
  context.fill();

  context.save();
  context.beginPath();
  context.arc(center, center, size / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(
    photo, crop.x, crop.y, crop.side, crop.side,
    center - size / 2, center - size / 2, size, size
  );
  context.restore();

  context.beginPath();
  context.arc(center, center, size / 2, 0, Math.PI * 2);
  context.lineWidth = 3;
  context.strokeStyle = DARK;
  context.stroke();

  // Debajo, a quién lleva el QR.
  context.fillStyle = DARK;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 30px Arial, sans-serif";
  context.fillText(`@${username}`, center, QR_SIZE + 22);
  context.font = "20px Arial, sans-serif";
  context.fillText("en FriBuk", center, QR_SIZE + 58);
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen"))),
      "image/png"
    );
  });
}
