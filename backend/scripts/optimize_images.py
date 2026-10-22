# ============================================================
# ACHICAR LAS IMÁGENES QUE YA ESTÁN SUBIDAS
# ============================================================
#
# Las imágenes nuevas se achican al subirse (ver images.py). Este script
# hace lo mismo con las que se subieron antes: portadas, fotos de perfil,
# banners, banner del inicio y fotos del foro.
#
# Cada archivo se reemplaza en la misma ruta, así que las historias y
# publicaciones siguen apuntando al mismo lugar. A las fotos de perfil y
# banners se les actualiza el ?v= para que nadie vea la versión antigua.
# Las imágenes apartadas por moderación no se tocan.
#
# Uso, desde la carpeta backend. Primero, sin cambiar nada, para ver
# cuánto se ahorraría:
#
#     venv\Scripts\python.exe scripts\optimize_images.py
#
# Después, para aplicarlo (conviene hacer antes una copia con backup.py):
#
#     venv\Scripts\python.exe scripts\optimize_images.py --aplicar

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import images  # noqa: E402
from backup import list_bucket_files  # noqa: E402

STORY_COVER_BUCKET = "story-covers"
FORUM_IMAGE_BUCKET = "forum-images"
EVIDENCE_FOLDER = "moderation"
# Una imagen se reemplaza solo si queda al menos un 10 % más liviana.
MIN_SAVING = 0.9

PROFILE_IMAGE_KEYS = {"avatars": "avatar_url", "banners": "banner_url"}


def profile_for(bucket: str, path: str):
    if bucket == FORUM_IMAGE_BUCKET:
        return images.FORUM_IMAGE
    folder = path.split("/", 1)[0]
    if folder == EVIDENCE_FOLDER:
        return None
    if folder == "avatars":
        return images.AVATAR
    if folder == "banners":
        return images.PROFILE_BANNER
    if folder == "site":
        return images.HOME_BANNER
    return images.STORY_COVER


def refresh_profile_url(client, path: str, public_url: str) -> None:
    # avatars/<id>/avatar o banners/<id>/banner
    folder, user_id, _name = path.split("/", 2)
    key = PROFILE_IMAGE_KEYS[folder]
    user = client.auth.admin.get_user_by_id(user_id).user
    metadata = dict(user.user_metadata or {})
    # Si la foto está retirada por moderación, no se vuelve a mostrar.
    if not metadata.get(key):
        return
    metadata[key] = f"{public_url}?v={int(time.time())}"
    client.auth.admin.update_user_by_id(user_id, {"user_metadata": metadata})


def main() -> None:
    apply = "--aplicar" in sys.argv[1:]

    load_dotenv(BACKEND_DIR / ".env")
    supabase_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not supabase_url or not service_key:
        print("ERROR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env")
        sys.exit(1)

    client = create_client(supabase_url, service_key)
    print("Aplicando cambios." if apply else "Solo revisión: no se cambia nada.")

    total_before = total_after = changed = 0
    problems = []

    for bucket_name in (STORY_COVER_BUCKET, FORUM_IMAGE_BUCKET):
        bucket = client.storage.from_(bucket_name)
        for path in list_bucket_files(bucket):
            profile = profile_for(bucket_name, path)
            if profile is None:
                continue

            try:
                original = bucket.download(path)
                data, content_type, _extension = images.optimize_image(original, profile)
            except Exception as error:
                problems.append(f"{bucket_name}/{path}: {type(error).__name__}")
                continue

            total_before += len(original)
            if len(data) > len(original) * MIN_SAVING:
                total_after += len(original)
                continue

            total_after += len(data)
            changed += 1
            print(
                f"  {bucket_name}/{path}: "
                f"{len(original) / 1024:,.0f} KB -> {len(data) / 1024:,.0f} KB"
            )

            if not apply:
                continue
            try:
                bucket.upload(path, data, {
                    "content-type": content_type,
                    "cache-control": images.CACHE_CONTROL,
                    "x-upsert": "true"
                })
                if path.split("/", 1)[0] in PROFILE_IMAGE_KEYS:
                    refresh_profile_url(client, path, bucket.get_public_url(path))
            except Exception as error:
                problems.append(f"{bucket_name}/{path}: {type(error).__name__}")

    print("\n----------------------------")
    print(f"Imágenes a achicar: {changed}")
    print(f"Peso total: {total_before / 1024 / 1024:.2f} MB -> {total_after / 1024 / 1024:.2f} MB")
    if not apply and changed:
        print("Para aplicarlo: venv\\Scripts\\python.exe scripts\\optimize_images.py --aplicar")

    if problems:
        print("\nNo se pudieron procesar:")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(2)


if __name__ == "__main__":
    main()
