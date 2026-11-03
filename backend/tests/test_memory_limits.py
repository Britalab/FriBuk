# Pruebas del límite de arenas de memoria. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import memory_limits


class FakeLibc:
    def __init__(self):
        self.calls = []

    def mallopt(self, option, value):
        self.calls.append((option, value))
        return 1


class LimitMallocArenasTests(unittest.TestCase):
    def test_no_hace_nada_fuera_de_linux(self):
        with mock.patch.object(sys, "platform", "win32"):
            self.assertFalse(memory_limits.limit_malloc_arenas())

    def test_respeta_la_variable_de_render(self):
        with mock.patch.object(sys, "platform", "linux"), \
                mock.patch.dict(os.environ, {"MALLOC_ARENA_MAX": "4"}):
            self.assertFalse(memory_limits.limit_malloc_arenas())

    def test_aplica_el_limite_en_linux(self):
        libc = FakeLibc()
        env = {k: v for k, v in os.environ.items() if k != "MALLOC_ARENA_MAX"}
        with mock.patch.object(sys, "platform", "linux"), \
                mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(memory_limits.ctypes, "CDLL", lambda name: libc):
            self.assertTrue(memory_limits.limit_malloc_arenas())
        self.assertEqual(libc.calls, [(memory_limits.M_ARENA_MAX, 2)])


if __name__ == "__main__":
    unittest.main()
