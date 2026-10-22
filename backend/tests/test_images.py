# Pruebas de cómo se achican y comprimen las imágenes subidas.
#
# Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402

import images  # noqa: E402


def encode(image, format, **options):
    output = BytesIO()
    image.save(output, format, **options)
    return output.getvalue()


def decode(data):
    image = Image.open(BytesIO(data))
    image.load()
    return image


class OptimizeImageTests(unittest.TestCase):
    def test_large_banner_is_shrunk_to_webp(self):
        original = encode(Image.new("RGB", (4000, 1000), "red"), "PNG")

        data, content_type, extension = images.optimize_image(
            original, images.HOME_BANNER
        )

        self.assertEqual((content_type, extension), ("image/webp", "webp"))
        result = decode(data)
        self.assertEqual(result.format, "WEBP")
        self.assertEqual(result.size, (2000, 500))

    def test_small_avatar_is_not_enlarged(self):
        original = encode(Image.new("RGB", (100, 80), "blue"), "PNG")

        data, _content_type, _extension = images.optimize_image(original, images.AVATAR)

        self.assertEqual(decode(data).size, (100, 80))

    def test_cover_is_jpeg_and_transparency_becomes_white(self):
        original = encode(Image.new("RGBA", (1200, 1800), (0, 0, 0, 0)), "PNG")

        data, content_type, extension = images.optimize_image(
            original, images.STORY_COVER
        )

        self.assertEqual((content_type, extension), ("image/jpeg", "jpg"))
        result = decode(data)
        self.assertEqual(result.size, (600, 900))
        red, green, blue = result.getpixel((10, 10))
        self.assertGreater(min(red, green, blue), 245)

    def test_transparent_avatar_keeps_transparency(self):
        original = encode(Image.new("RGBA", (64, 64), (0, 0, 0, 0)), "PNG")

        data, _content_type, _extension = images.optimize_image(original, images.AVATAR)

        self.assertEqual(decode(data).getpixel((5, 5))[3], 0)

    def test_phone_photo_orientation_is_applied(self):
        # Foto guardada acostada con la marca "girar 90°" (orientación 6).
        exif = Image.Exif()
        exif[0x0112] = 6
        original = encode(Image.new("RGB", (400, 200), "green"), "JPEG", exif=exif)

        data, _content_type, _extension = images.optimize_image(
            original, images.FORUM_IMAGE
        )

        result = decode(data)
        self.assertEqual(result.size, (200, 400))
        self.assertNotIn(0x0112, result.getexif())

    def test_broken_file_is_rejected(self):
        broken = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

        with self.assertRaises(images.InvalidImage):
            images.optimize_image(broken, images.AVATAR)


if __name__ == "__main__":
    unittest.main()
