# Límites contra el spam en lo que se publica: foro, comentarios de
# historia, soporte, historias y capítulos. Están pensados para que nadie
# que use el sitio con normalidad los note.

import threading
import time
from collections import deque

from fastapi import HTTPException

# Límites en memoria por usuario: (acciones permitidas, ventana en segundos).
# Una acción debe caber en todas las ventanas de su grupo.
PUBLISH_RATE_LIMITS = {
    "forum_topic": ((5, 3600), (20, 86400)),
    "forum_reply": ((6, 60), (60, 3600)),
    "story_comment": ((6, 60), (60, 3600)),
    "support": ((3, 3600), (10, 86400)),
    "story": ((10, 3600), (30, 86400)),
    # Amplio a propósito: quien trae una novela ya escrita sube muchos
    # capítulos seguidos.
    "chapter": ((60, 3600), (300, 86400)),
}
PUBLISH_RATE_MAX_TRACKED_KEYS = 20000

PUBLISH_RATE_DETAILS = {
    "forum_topic": "Creaste muchos temas en poco tiempo. Espera un rato antes de abrir otro.",
    "forum_reply": "Estás respondiendo demasiado rápido. Espera un momento e inténtalo nuevamente.",
    "story_comment": "Estás comentando demasiado rápido. Espera un momento e inténtalo nuevamente.",
    "support": "Ya enviaste varias solicitudes. Espera un rato antes de enviar otra.",
    "story": "Creaste muchas historias en poco tiempo. Espera un rato antes de crear otra.",
    "chapter": "Creaste muchos capítulos en poco tiempo. Espera un rato antes de crear otro.",
}

publish_requests: dict[tuple[str, int, str], deque] = {}
publish_requests_lock = threading.Lock()


def limit_publish_requests(bucket: str, user_id: str) -> None:
    # Primero se comprueban todas las ventanas y solo después se anota la
    # acción, para que un intento rechazado no consuma cupo.
    now = time.monotonic()

    with publish_requests_lock:
        if len(publish_requests) > PUBLISH_RATE_MAX_TRACKED_KEYS:
            publish_requests.clear()

        tracked = []
        for limit, window in PUBLISH_RATE_LIMITS[bucket]:
            timestamps = publish_requests.setdefault(
                (bucket, window, user_id), deque()
            )
            while timestamps and now - timestamps[0] > window:
                timestamps.popleft()
            if len(timestamps) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail=PUBLISH_RATE_DETAILS[bucket]
                )
            tracked.append(timestamps)

        for timestamps in tracked:
            timestamps.append(now)
