# ============================================================
# MINIATURAS DE LAS PORTADAS QUE YA ESTÁN SUBIDAS
# ============================================================
#
# Las portadas nuevas guardan su miniatura al subirse (ver /upload-cover).
# Este script la crea para las portadas de historias que aún no la tienen.
# No toca la portada ni la base de datos: solo agrega «<id>-thumb.jpg» al
# lado de cada portada. Mientras una portada no tenga miniatura, el sitio
# muestra la portada completa.
#
# Uso, desde la carpeta backend. Primero, sin cambiar nada:
#
#     venv\Scripts\python.exe scripts\make_cover_thumbs.py
#
# Después, para crearlas:
#
#     venv\Scripts\python.exe scripts\make_cover_thumbs.py --aplicar

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import images  # noqa: E402
from backup import list_bucket_files  # noqa: E402

BUCKET = "story-covers"


def main() -> None:
    apply = "--aplicar" in sys.argv[1:]

    load_dotenv(BACKEND_DIR / ".env")
    supabase_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not supabase_url or not service_key:
        print("ERROR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env")
        sys.exit(1)

    client = create_client(supabase_url, service_key)
    bucket = client.storage.from_(BUCKET)
    print("Creando miniaturas." if apply else "Solo revisión: no se cambia nada.")

    marker = f"/object/public/{BUCKET}/"
    cover_paths = sorted({
        row["cover_url"].split(marker, 1)[1].split("?", 1)[0]
        for row in client.table("stories").select("cover_url").execute().data or []
        if row.get("cover_url") and marker in row["cover_url"]
    })
    existing = set(list_bucket_files(bucket))

    created = 0
    total_cover = total_thumb = 0
    problems = []
    for path in cover_paths:
        thumb_path = images.cover_thumb_path(path)
        if thumb_path in existing:
            continue
        try:
            original = bucket.download(path)
            data, content_type, _ = images.optimize_image(original, images.STORY_COVER_THUMB)
        except Exception as error:
            problems.append(f"{path}: {type(error).__name__}")
            continue

        created += 1
        total_cover += len(original)
        total_thumb += len(data)
        print(f"  {path}: {len(original) / 1024:,.0f} KB -> miniatura {len(data) / 1024:,.0f} KB")

        if not apply:
            continue
        try:
            bucket.upload(thumb_path, data, {
                "content-type": content_type,
                "cache-control": images.CACHE_CONTROL,
                "x-upsert": "true"
            })
        except Exception as error:
            problems.append(f"{thumb_path}: {type(error).__name__}")

    print("\n----------------------------")
    print(f"Miniaturas {'creadas' if apply else 'por crear'}: {created}")
    if created:
        print(
            f"Peso en las tarjetas: {total_cover / 1024 / 1024:.2f} MB -> "
            f"{total_thumb / 1024 / 1024:.2f} MB"
        )
    if not apply and created:
        print("Para crearlas: venv\Scripts\python.exe scripts\make_cover_thumbs.py --aplicar")

    if problems:
        print("\nNo se pudieron procesar:")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(2)


if __name__ == "__main__":
    main()
