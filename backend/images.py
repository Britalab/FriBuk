# ============================================================
# IMÁGENES SUBIDAS: ACHICAR Y COMPRIMIR
# ============================================================
#
# Cada imagen se guarda al tamaño en que realmente se muestra (con margen
# para pantallas de alta densidad) y comprimida. Así cada visita descarga
# decenas de KB en lugar de varios MB, sin diferencia visible.
#
# Al recodificar también se pierden los metadatos del archivo original
# (por ejemplo, la ubicación GPS de una foto tomada con el celular).

from io import BytesIO
from typing import NamedTuple

from PIL import ExifTags, Image, ImageOps

# Una imagen de 5 MB comprimida puede ocupar mucho más al abrirse (unos 3
# bytes por píxel). Las fotos JPG se abren ya reducidas, así que una de
# 48 o 200 megapíxeles pasa; lo que siga superando este límite se rechaza.
MAX_DECODED_PIXELS = 25_000_000
# Con transparencia, Pillow copia la imagen completa al achicarla para
# mezclar bien los bordes: se permite la mitad.
MAX_DECODED_PIXELS_WITH_ALPHA = 12_000_000
PREMULTIPLIED_MODES = ("RGBA", "LA")
# Pillow solo rechaza por encima del doble de su límite: el control lo hace
# optimize_image con MAX_DECODED_PIXELS, después de reducir los JPG.
Image.MAX_IMAGE_PIXELS = None

# Cada archivo nuevo tiene una dirección nueva (o un ?v= que cambia al
# reemplazarlo), así que el navegador puede guardarlo un año sin volver a
# descargarlo.
CACHE_CONTROL = "31536000"


class ImageProfile(NamedTuple):
    max_width: int
    max_height: int
    format: str
    quality: int


AVATAR = ImageProfile(512, 512, "WEBP", 82)
PROFILE_BANNER = ImageProfile(1600, 1600, "WEBP", 80)
HOME_BANNER = ImageProfile(2000, 2000, "WEBP", 82)
# Las portadas también se usan como vista previa al compartir un enlace
# (WhatsApp, Facebook): JPEG es el formato que todas aceptan.
STORY_COVER = ImageProfile(600, 900, "JPEG", 85)
FORUM_IMAGE = ImageProfile(1600, 1600, "WEBP", 80)
# Foto de perfil en la vista previa al compartir un perfil: no se guarda,
# se arma al pedirla (ver seo.py).
AVATAR_PREVIEW = ImageProfile(300, 300, "JPEG", 85)

FORMATS = {
    "WEBP": ("image/webp", "webp"),
    "JPEG": ("image/jpeg", "jpg"),
}


class InvalidImage(ValueError):
    pass


class ImageTooLarge(InvalidImage):
    pass


def stored_box(image: Image.Image, profile: ImageProfile) -> tuple[int, int]:
    # Tamaño máximo medido sobre la imagen tal como viene en el archivo: una
    # foto con orientación 5 a 8 está guardada acostada, y su ancho final
    # es el alto guardado.
    if image.getexif().get(ExifTags.Base.Orientation) in (5, 6, 7, 8):
        return profile.max_height, profile.max_width
    return profile.max_width, profile.max_height


def optimize_image(data: bytes, profile: ImageProfile) -> tuple[bytes, str, str]:
    # Devuelve (contenido, tipo, extensión) de la imagen ya achicada.
    try:
        with Image.open(BytesIO(data)) as original:
            if original.format == "JPEG":
                # Se decodifica a 1/2, 1/4 u 1/8 sin bajar del tamaño final;
                # thumbnail termina de achicarla con buena calidad. El EXIF
                # de un JPG se lee sin decodificar la imagen.
                original.draft(original.mode, stored_box(original, profile))
            width, height = original.size
            max_pixels = (
                MAX_DECODED_PIXELS_WITH_ALPHA
                if original.mode in PREMULTIPLIED_MODES
                else MAX_DECODED_PIXELS
            )
            if width * height > max_pixels:
                raise ImageTooLarge("La imagen tiene demasiados píxeles")
            # Primero se achica y después se gira: así nunca hay dos copias
            # de la imagen completa en memoria. thumbnail solo achica: una
            # imagen más chica que el límite queda igual.
            original.thumbnail(
                stored_box(original, profile), Image.Resampling.LANCZOS
            )
            # Las fotos del celular guardan la orientación aparte: se aplica
            # antes de perder los metadatos para que no queden giradas.
            image = ImageOps.exif_transpose(original)
    except (OSError, Image.DecompressionBombError, SyntaxError) as error:
        raise InvalidImage("No se pudo leer la imagen") from error

    has_alpha = image.mode in ("RGBA", "LA", "PA") or (
        image.mode == "P" and "transparency" in image.info
    )
    output = BytesIO()

    if profile.format == "JPEG":
        if has_alpha:
            # JPEG no tiene transparencia: se pone sobre fondo blanco.
            image = image.convert("RGBA")
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.getchannel("A"))
            image = background
        else:
            image = image.convert("RGB")
        image.save(
            output, "JPEG", quality=profile.quality, optimize=True, progressive=True
        )
    else:
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.save(output, "WEBP", quality=profile.quality, method=6)

    content_type, extension = FORMATS[profile.format]
    return output.getvalue(), content_type, extension
