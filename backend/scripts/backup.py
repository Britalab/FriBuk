# ============================================================
# COPIA DE SEGURIDAD DE FRIBUK
# ============================================================
#
# Descarga a este computador una copia de todo lo que vive en Supabase:
#
#   - Todas las tablas de la base de datos (historias, capítulos,
#     comentarios, foro, mensajes, etc.), una por archivo.
#   - Las cuentas: correo y datos de registro. Las contraseñas no se pueden
#     descargar; tras una restauración cada persona usaría "Olvidé mi
#     contraseña".
#   - Las imágenes: portadas, fotos de perfil, banners y fotos del foro.
#
# El resultado es un único archivo .zip con la fecha en el nombre.
#
# Uso, desde la carpeta backend:
#
#     venv\Scripts\python.exe scripts\backup.py
#
# Por defecto se guarda en la carpeta "FriBuk-copias" de tu usuario. Para
# elegir otra:
#
#     venv\Scripts\python.exe scripts\backup.py D:\MisCopias
#
# IMPORTANTE: la copia contiene datos personales (correos, mensajes
# privados). No la subas a GitHub ni la compartas. Por eso se guarda fuera
# de la carpeta del proyecto.
#
# Solo lee: no modifica ni borra nada en Supabase.

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client

BACKEND_DIR = Path(__file__).resolve().parent.parent
PAGE_SIZE = 1000
TIMEOUT_SECONDS = 60


def fail(message: str) -> None:
    print(f"\nERROR: {message}")
    sys.exit(1)


def fetch_table_columns(rest_url: str, headers: dict) -> dict:
    # Tablas que existen hoy, con sus columnas. Se consulta en cada copia:
    # así una tabla nueva entra sola, sin tocar este archivo.
    response = httpx.get(f"{rest_url}/", headers=headers, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()

    return {
        name: list((definition.get("properties") or {}).keys())
        for name, definition in (response.json().get("definitions") or {}).items()
    }


def export_table(rest_url: str, headers: dict, table: str, columns: list) -> list:
    # Un orden fijo evita que una fila se repita o se pierda entre páginas.
    order = "id" if "id" in columns else (columns[0] if columns else None)
    rows = []

    while True:
        params = {"select": "*", "limit": PAGE_SIZE, "offset": len(rows)}
        if order:
            params["order"] = order

        response = httpx.get(
            f"{rest_url}/{table}", headers=headers, params=params,
            timeout=TIMEOUT_SECONDS
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)

        if len(page) < PAGE_SIZE:
            return rows


def export_accounts(client) -> list:
    accounts = []
    page = 1

    while True:
        users = client.auth.admin.list_users(page=page, per_page=PAGE_SIZE)
        accounts.extend(user.model_dump(mode="json") for user in users)

        if len(users) < PAGE_SIZE:
            return accounts
        page += 1


def list_bucket_files(bucket, folder: str = "") -> list:
    # Recorre el almacenamiento carpeta por carpeta.
    paths = []
    offset = 0

    while True:
        items = bucket.list(folder, {"limit": PAGE_SIZE, "offset": offset}) or []

        for item in items:
            name = item.get("name")
            if not name:
                continue

            path = f"{folder}/{name}" if folder else name
            # Una carpeta no trae identificador ni datos de archivo.
            if item.get("id") is None and item.get("metadata") is None:
                paths.extend(list_bucket_files(bucket, path))
            else:
                paths.append(path)

        if len(items) < PAGE_SIZE:
            return paths
        offset += PAGE_SIZE


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def main() -> None:
    load_dotenv(BACKEND_DIR / ".env")
    supabase_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

    if not supabase_url or not service_key:
        fail("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env")

    destination = (
        Path(sys.argv[1]).expanduser() if len(sys.argv) > 1
        else Path.home() / "FriBuk-copias"
    ).resolve()

    # La copia tiene datos personales: nunca dentro del repositorio.
    if BACKEND_DIR.parent in (destination, *destination.parents):
        fail(
            "Elige una carpeta fuera del proyecto: la copia tiene datos "
            "personales y no debe terminar en GitHub."
        )

    destination.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    archive_base = destination / f"fribuk-copia-{stamp}"

    rest_url = f"{supabase_url}/rest/v1"
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    client = create_client(supabase_url, service_key)
    problems = []
    summary = {"created_at": datetime.now().isoformat(timespec="seconds"), "tables": {}}

    print("Copia de seguridad de FriBuk")
    print("----------------------------")

    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary) / archive_base.name

        # ---------- base de datos ----------
        print("\nBase de datos:")
        tables = fetch_table_columns(rest_url, headers)

        for table in sorted(tables):
            try:
                rows = export_table(rest_url, headers, table, tables[table])
                write_json(work / "tablas" / f"{table}.json", rows)
                summary["tables"][table] = len(rows)
                print(f"  {table:<28} {len(rows):>6} filas")
            except Exception as error:
                problems.append(f"tabla {table}: {type(error).__name__}")
                print(f"  {table:<28} FALLÓ ({type(error).__name__})")

        # ---------- cuentas ----------
        print("\nCuentas:")
        try:
            accounts = export_accounts(client)
            write_json(work / "cuentas.json", accounts)
            summary["accounts"] = len(accounts)
            print(f"  {len(accounts)} cuentas")
        except Exception as error:
            problems.append(f"cuentas: {type(error).__name__}")
            print(f"  FALLÓ ({type(error).__name__})")

        # ---------- imágenes ----------
        print("\nImágenes:")
        summary["files"] = {}
        try:
            buckets = [bucket.name for bucket in client.storage.list_buckets()]
        except Exception as error:
            buckets = []
            problems.append(f"almacenamiento: {type(error).__name__}")
            print(f"  FALLÓ ({type(error).__name__})")

        for bucket_name in buckets:
            bucket = client.storage.from_(bucket_name)
            saved = 0
            try:
                for file_path in list_bucket_files(bucket):
                    target = work / "imagenes" / bucket_name / file_path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(bucket.download(file_path))
                    saved += 1
            except Exception as error:
                problems.append(f"imágenes de {bucket_name}: {type(error).__name__}")

            summary["files"][bucket_name] = saved
            print(f"  {bucket_name:<28} {saved:>6} archivos")

        summary["problems"] = problems
        write_json(work / "resumen.json", summary)

        archive = shutil.make_archive(str(archive_base), "zip", temporary, work.name)

    size_mb = Path(archive).stat().st_size / (1024 * 1024)
    print("\n----------------------------")
    print(f"Copia guardada en:\n  {archive}")
    print(f"Tamaño: {size_mb:.1f} MB")

    if problems:
        print("\nATENCIÓN: la copia quedó incompleta. Falló:")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(2)

    print("\nCopia completa. Guarda también una copia de este archivo fuera de")
    print("este computador (un disco externo o tu nube personal).")


if __name__ == "__main__":
    main()
