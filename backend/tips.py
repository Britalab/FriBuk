# ============================================================
# CONSEJOS PARA ESCRIBIR (tía FriBuk)
# ============================================================
#
# Artículos del blog /consejos. Cualquiera lee los publicados; solo la
# cuenta admin los crea, edita, publica y borra, y es la única que ve los
# borradores. Ver sql/consejos.sql.
#
# El texto de cada sección usa el formato del editor de capítulos
# (frontend/src/utils/richText.js).

import re
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

TABLE = "writing_tips"
TIP_NOT_FOUND_DETAIL = "Consejo no encontrado"
STATUSES = ("draft", "published")
# Las mismas de frontend/src/data/consejos.js (TIP_POSES).
POSES = (
    "retrato", "sonrie", "pensativa", "explica", "senala", "brazos-cruzados", "completa",
)
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SLUG_MAX_LENGTH = 120
TITLE_MAX_LENGTH = 150
DESCRIPTION_MAX_LENGTH = 200
SUMMARY_MAX_LENGTH = 700
MAX_SECTIONS = 30
HEADING_MAX_LENGTH = 150
SECTION_TEXT_MAX_LENGTH = 20000
# Columnas del índice: sin el texto completo.
LIST_COLUMNS = "id, slug, position, title, description, summary, pose, status, published_at, updated_at"


def fribuk():
    # main importa este módulo al final: se accede a él de forma diferida.
    import main
    return main


class TipSection(BaseModel):
    heading: str = ""
    text: str = ""


class TipPayload(BaseModel):
    slug: str
    title: str
    description: str = ""
    summary: str = ""
    pose: str = "retrato"
    position: int = 0
    sections: list[TipSection] = []
    status: str = "draft"


def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Misma comprobación de administrador que el panel de soporte.
    return fribuk().get_current_admin(credentials)


def viewer_is_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
) -> bool:
    # Quien no es admin (o no tiene sesión) solo ve lo publicado.
    if not credentials:
        return False
    try:
        user = fribuk().get_current_user(credentials)
    except HTTPException:
        return False
    return fribuk().is_admin_user(str(user.id))


def bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def clean_payload(payload: TipPayload) -> dict:
    slug = payload.slug.strip().lower()
    title = payload.title.strip()

    if not SLUG_PATTERN.match(slug) or len(slug) > SLUG_MAX_LENGTH:
        raise bad_request(
            "La dirección solo puede tener letras minúsculas sin tildes, números y guiones "
            "(por ejemplo: como-crear-un-personaje)."
        )
    if not title or len(title) > TITLE_MAX_LENGTH:
        raise bad_request(f"El título es obligatorio y puede tener hasta {TITLE_MAX_LENGTH} caracteres.")
    if len(payload.description.strip()) > DESCRIPTION_MAX_LENGTH:
        raise bad_request(f"La descripción para Google puede tener hasta {DESCRIPTION_MAX_LENGTH} caracteres.")
    if len(payload.summary.strip()) > SUMMARY_MAX_LENGTH:
        raise bad_request(f"El resumen puede tener hasta {SUMMARY_MAX_LENGTH} caracteres.")
    if payload.pose not in POSES:
        raise bad_request("Elige una pose de tía FriBuk.")
    if payload.status not in STATUSES:
        raise bad_request("Estado no válido.")
    if not 0 <= payload.position <= 999:
        raise bad_request("El orden debe ser un número entre 0 y 999.")
    if len(payload.sections) > MAX_SECTIONS:
        raise bad_request(f"Un consejo puede tener hasta {MAX_SECTIONS} secciones.")

    sections = []
    for section in payload.sections:
        heading = section.heading.strip()
        text = section.text.replace("\r\n", "\n").strip()
        if len(heading) > HEADING_MAX_LENGTH:
            raise bad_request(f"Un subtítulo puede tener hasta {HEADING_MAX_LENGTH} caracteres.")
        if len(text) > SECTION_TEXT_MAX_LENGTH:
            raise bad_request("Una de las secciones es demasiado larga.")
        # Una sección vacía no se guarda.
        if heading or text:
            sections.append({"heading": heading, "text": text})

    if payload.status == "published" and not any(section["text"] for section in sections):
        raise bad_request("Para publicar, el consejo necesita al menos una sección con texto.")

    return {
        "slug": slug,
        "title": title,
        "description": payload.description.strip(),
        "summary": payload.summary.strip(),
        "pose": payload.pose,
        "position": payload.position,
        "sections": sections,
        "status": payload.status,
    }


def find_tip(column: str, value: str) -> dict | None:
    rows = (
        fribuk().supabase_admin.table(TABLE)
        .select("*")
        .eq(column, value)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def slug_taken(slug: str, except_id: str | None = None) -> bool:
    row = find_tip("slug", slug)
    return bool(row) and str(row["id"]) != str(except_id)


def with_publication_date(values: dict, current: dict | None) -> dict:
    # La fecha de publicación se fija la primera vez que se publica.
    if values["status"] == "published" and not (current or {}).get("published_at"):
        values["published_at"] = date.today().isoformat()
    return values


# ---------- lectura ----------

@router.get("/tips")
def list_tips(is_admin: bool = Depends(viewer_is_admin)):
    query = fribuk().supabase_admin.table(TABLE).select(LIST_COLUMNS)
    if not is_admin:
        query = query.eq("status", "published")
    rows = query.order("position").order("title").execute().data or []
    return {"tips": rows, "can_edit": is_admin}


@router.get("/tips/{slug}")
def get_tip(slug: str, is_admin: bool = Depends(viewer_is_admin)):
    tip = find_tip("slug", slug.strip().lower())
    # Un borrador no existe para quien no es admin.
    if not tip or (tip["status"] != "published" and not is_admin):
        raise HTTPException(status_code=404, detail=TIP_NOT_FOUND_DETAIL)
    return {"tip": tip, "can_edit": is_admin}


# ---------- edición (solo admin) ----------

@router.post("/tips")
def create_tip(payload: TipPayload, _admin=Depends(get_current_admin)):
    values = with_publication_date(clean_payload(payload), None)
    if slug_taken(values["slug"]):
        raise HTTPException(status_code=409, detail="Ya existe un consejo con esa dirección.")

    rows = fribuk().supabase_admin.table(TABLE).insert(values).execute().data
    return {"tip": rows[0]}


@router.put("/tips/{tip_id}")
def update_tip(tip_id: str, payload: TipPayload, _admin=Depends(get_current_admin)):
    tip_id = fribuk().normalize_uuid_or_404(tip_id, TIP_NOT_FOUND_DETAIL)
    current = find_tip("id", tip_id)
    if not current:
        raise HTTPException(status_code=404, detail=TIP_NOT_FOUND_DETAIL)

    values = with_publication_date(clean_payload(payload), current)
    if slug_taken(values["slug"], except_id=tip_id):
        raise HTTPException(status_code=409, detail="Ya existe un consejo con esa dirección.")

    values["updated_at"] = datetime.now(timezone.utc).isoformat()
    rows = (
        fribuk().supabase_admin.table(TABLE)
        .update(values)
        .eq("id", tip_id)
        .execute()
        .data
    )
    return {"tip": rows[0] if rows else {**current, **values}}


@router.delete("/tips/{tip_id}")
def delete_tip(tip_id: str, _admin=Depends(get_current_admin)):
    tip_id = fribuk().normalize_uuid_or_404(tip_id, TIP_NOT_FOUND_DETAIL)
    if not find_tip("id", tip_id):
        raise HTTPException(status_code=404, detail=TIP_NOT_FOUND_DETAIL)
    fribuk().supabase_admin.table(TABLE).delete().eq("id", tip_id).execute()
    return {"message": "Consejo eliminado"}
