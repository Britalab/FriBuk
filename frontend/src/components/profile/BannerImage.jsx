// Banner de perfil: la franja tiene forma fija, pero la imagen se muestra
// completa, sin recortes. El espacio que sobra se rellena con una copia
// difuminada de la misma imagen (el navegador la descarga una sola vez).
export default function BannerImage({ src }) {
  return (
    <div className="banner-image">
      <img className="banner-image-backdrop" src={src} alt="" aria-hidden="true" />
      <img className="banner-image-main" src={src} alt="" />
    </div>
  );
}
