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

from PIL import Image, ImageOps

# Una imagen de 5 MB comprimida puede ocupar mucho más al abrirse: se
# rechazan las que tendrían más píxeles que una foto de 50 megapíxeles.
Image.MAX_IMAGE_PIXELS = 50_000_000

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


def optimize_image(data: bytes, profile: ImageProfile) -> tuple[bytes, str, str]:
    # Devuelve (contenido, tipo, extensión) de la imagen ya achicada.
    try:
        with Image.open(BytesIO(data)) as original:
            original.load()
            # Las fotos del celular guardan la orientación aparte: se aplica
            # antes de perder los metadatos para que no queden giradas.
            image = ImageOps.exif_transpose(original)
    except (OSError, Image.DecompressionBombError, SyntaxError) as error:
        raise InvalidImage("No se pudo leer la imagen") from error

    # thumbnail solo achica: una imagen más chica que el límite queda igual.
    image.thumbnail((profile.max_width, profile.max_height), Image.Resampling.LANCZOS)

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
