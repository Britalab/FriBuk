# Límite de memoria del servidor. Se importa antes que todo lo demás en
# main.py, para que rija antes de que se creen los hilos.
#
# El servidor atiende cada petición en uno de varios hilos. En Linux, glibc
# le da a cada hilo su propio bloque de memoria (arena) y casi nunca la
# devuelve: tras cada petición pesada el consumo queda más alto y no baja.
# Con 512 MB en Render eso terminaba en reinicios por memoria (29-10 y
# 03-11). Limitar las arenas a 2 es lo mismo que la variable de entorno
# MALLOC_ARENA_MAX=2, pero queda en el código.
import ctypes
import ctypes.util
import os
import sys

M_ARENA_MAX = -8
ARENA_MAX = 2


def limit_malloc_arenas() -> bool:
    # Devuelve True si se aplicó el límite. Fuera de Linux no hace nada.
    if not sys.platform.startswith("linux"):
        return False
    # Si ya está configurado en Render, se respeta ese valor.
    if os.getenv("MALLOC_ARENA_MAX"):
        return False

    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")
        return libc.mallopt(M_ARENA_MAX, ARENA_MAX) == 1
    except (OSError, AttributeError):
        # Otra libc (por ejemplo musl) no tiene mallopt.
        return False


if limit_malloc_arenas():
    print(f"Memoria: arenas de malloc limitadas a {ARENA_MAX}.", flush=True)
