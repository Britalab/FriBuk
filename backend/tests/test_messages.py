# Pruebas de Mensajes: privados 1 a 1 y avisos de autores a sus seguidores.
#
# No usan la base de datos real: reutilizan el Supabase en memoria de las
# pruebas de comentarios. Ejecutar desde la carpeta backend:
#
#     python -m unittest discover -s tests

import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import messages  # noqa: E402
from test_chapter_comments import FakeAuth, FakeDatabase  # noqa: E402

ANA_ID = str(uuid.uuid4())
BOB_ID = str(uuid.uuid4())
CARO_ID = str(uuid.uuid4())
AUTHOR_ID = str(uuid.uuid4())

XSS_TEXT = '<script>alert("x")</script><img src=x onerror=alert(1)>'


def auth_header(user_id):
    return {"Authorization": f"Bearer {user_id}"}


class MessagesTestCase(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.database.tables = {
            "users": [
                {"id": ANA_ID, "username": "ana", "role": "user"},
                {"id": BOB_ID, "username": "bob", "role": "user"},
                {"id": CARO_ID, "username": "caro", "role": "user"},
                {"id": AUTHOR_ID, "username": "autora", "role": "user"}
            ],
            "user_follows": [],
            "user_blocks": [],
            "message_settings": [],
            "private_conversations": [],
            "private_messages": [],
            "author_posts": [],
            "author_post_replies": [],
            "author_channel_reads": [],
            "support_requests": []
        }

        users = {
            user_id: SimpleNamespace(
                id=user_id, email=f"{user_id}@privado.test", user_metadata={}
            )
            for user_id in (ANA_ID, BOB_ID, CARO_ID, AUTHOR_ID)
        }

        self.originals = (main.supabase_admin, main.supabase_public)
        main.supabase_admin = self.database
        main.supabase_public = SimpleNamespace(auth=FakeAuth(users))
        messages.message_requests.clear()

        self.client = TestClient(main.app)

    def tearDown(self):
        main.supabase_admin, main.supabase_public = self.originals

    # ---------- utilidades ----------

    def send(self, sender, recipient, content="Hola"):
        return self.client.post(
            f"/messages/private/{recipient}",
            json={"content": content},
            headers=auth_header(sender)
        )

    def thread(self, user, other):
        return self.client.get(
            f"/messages/private/{other}", headers=auth_header(user)
        )

    def follow(self, follower, following):
        self.database.tables["user_follows"].append(
            {"follower_id": follower, "following_id": following}
        )

    def unfollow(self, follower, following):
        self.database.tables["user_follows"] = [
            row for row in self.database.tables["user_follows"]
            if not (
                row["follower_id"] == follower and row["following_id"] == following
            )
        ]

    def set_privacy(self, user, allow_from):
        return self.client.put(
            "/me/message-settings",
            json={"allow_from": allow_from},
            headers=auth_header(user)
        )

    def block(self, blocker, blocked):
        return self.client.post(
            f"/users/{blocked}/block", headers=auth_header(blocker)
        )

    def publish(self, content="Nuevo capítulo publicado.", author=AUTHOR_ID):
        response = self.client.post(
            "/messages/author-posts",
            json={"content": content},
            headers=auth_header(author)
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["post"]["id"]

    def reply(self, user, post_id, content="¡Voy a leerlo!", reply_to_id=None):
        body = {"content": content}
        if reply_to_id:
            body["reply_to_id"] = reply_to_id
        return self.client.post(
            f"/messages/author-posts/{post_id}/replies",
            json=body,
            headers=auth_header(user)
        )

    def set_replies_open(self, user, post_id, replies_open):
        return self.client.patch(
            f"/messages/author-posts/{post_id}",
            json={"replies_open": replies_open},
            headers=auth_header(user)
        )

    def summary(self, user):
        return self.client.get(
            "/messages/summary", headers=auth_header(user)
        ).json()

    # ============================================================
    # PRIVADOS
    # ============================================================

    # 1 y 2
    def test_user_can_start_conversation_and_send_messages(self):
        first = self.send(ANA_ID, BOB_ID, "Hola, ¿cómo estás?")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertTrue(first.json()["message"]["is_mine"])

        second = self.send(BOB_ID, ANA_ID, "Bien, ¿y tú?")
        self.assertEqual(second.status_code, 200, second.text)

        # Una sola conversación para la pareja, sin importar quién escribe.
        self.assertEqual(len(self.database.tables["private_conversations"]), 1)

        thread = self.thread(ANA_ID, BOB_ID).json()
        self.assertEqual(thread["user"]["username"], "bob")
        self.assertEqual(
            [message["content"] for message in thread["messages"]],
            ["Hola, ¿cómo estás?", "Bien, ¿y tú?"]
        )
        self.assertEqual(
            [message["is_mine"] for message in thread["messages"]], [True, False]
        )

        inbox = self.client.get(
            "/messages/conversations", headers=auth_header(ANA_ID)
        ).json()["conversations"]
        self.assertEqual(len(inbox), 1)
        self.assertEqual(inbox[0]["user"]["username"], "bob")
        self.assertEqual(inbox[0]["last_message_preview"], "Bien, ¿y tú?")

    def test_anonymous_user_cannot_use_messages(self):
        for method, path in (
            ("get", "/messages/conversations"),
            ("get", f"/messages/private/{BOB_ID}"),
            ("get", "/messages/authors"),
            ("get", "/me/message-settings")
        ):
            response = getattr(self.client, method)(path)
            self.assertIn(response.status_code, (401, 403), path)

        response = self.client.post(
            f"/messages/private/{BOB_ID}", json={"content": "Hola"}
        )
        self.assertIn(response.status_code, (401, 403))

    # 3
    def test_user_cannot_message_themselves(self):
        response = self.send(ANA_ID, ANA_ID)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.database.tables["private_messages"], [])

    def test_cannot_message_unknown_user(self):
        self.assertEqual(self.send(ANA_ID, str(uuid.uuid4())).status_code, 404)
        self.assertEqual(self.send(ANA_ID, "no-es-un-id").status_code, 404)

    # 4 y 25
    def test_third_user_cannot_access_someone_elses_conversation(self):
        self.send(ANA_ID, BOB_ID, "Solo para Bob")
        message_id = self.database.tables["private_messages"][0]["id"]

        # Caro solo puede pedir sus propias conversaciones: no ve la de Ana y Bob.
        thread = self.thread(CARO_ID, ANA_ID).json()
        self.assertEqual(thread["messages"], [])
        self.assertFalse(thread["has_conversation"])

        inbox = self.client.get(
            "/messages/conversations", headers=auth_header(CARO_ID)
        ).json()["conversations"]
        self.assertEqual(inbox, [])

        # Tampoco puede marcar como leído ni reportar un mensaje ajeno.
        self.client.post(
            f"/messages/private/{ANA_ID}/read", headers=auth_header(CARO_ID)
        )
        self.assertIsNone(self.database.tables["private_messages"][0]["read_at"])

        self.send(CARO_ID, ANA_ID, "Hola Ana")
        report = self.client.post(
            f"/messages/private/{ANA_ID}/report",
            json={"reason": "Prueba", "message_id": message_id},
            headers=auth_header(CARO_ID)
        )
        self.assertEqual(report.status_code, 404)
        self.assertEqual(self.database.tables["support_requests"], [])

    # 5 y 27
    def test_block_prevents_messages_in_both_directions(self):
        self.assertEqual(self.send(ANA_ID, BOB_ID).status_code, 200)
        self.assertEqual(self.block(ANA_ID, BOB_ID).status_code, 200)

        blocker = self.send(ANA_ID, BOB_ID, "No debería salir")
        blocked = self.send(BOB_ID, ANA_ID, "Tampoco")
        self.assertEqual(blocker.status_code, 403)
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(len(self.database.tables["private_messages"]), 1)

        # La conversación existente sigue visible, pero no admite mensajes.
        thread = self.thread(ANA_ID, BOB_ID).json()
        self.assertFalse(thread["can_send"])
        self.assertTrue(thread["blocked_by_me"])
        self.assertFalse(self.thread(BOB_ID, ANA_ID).json()["can_send"])

        # A quien fue bloqueado no se le revela el bloqueo.
        self.assertNotIn("bloque", blocked.json()["detail"].lower())
        self.assertFalse(self.thread(BOB_ID, ANA_ID).json()["blocked_by_me"])

        unblock = self.client.delete(
            f"/users/{BOB_ID}/block", headers=auth_header(ANA_ID)
        )
        self.assertEqual(unblock.status_code, 200)
        self.assertEqual(self.send(BOB_ID, ANA_ID, "Ahora sí").status_code, 200)

    def test_block_list_and_self_block(self):
        self.assertEqual(self.block(ANA_ID, ANA_ID).status_code, 400)
        self.block(ANA_ID, BOB_ID)
        self.block(ANA_ID, BOB_ID)

        blocked = self.client.get(
            "/me/blocks", headers=auth_header(ANA_ID)
        ).json()["blocked"]
        self.assertEqual([user["username"] for user in blocked], ["bob"])

        # Nadie ve la lista de bloqueos de otra persona.
        other = self.client.get("/me/blocks", headers=auth_header(BOB_ID)).json()
        self.assertEqual(other["blocked"], [])

    # 6
    def test_privacy_everyone_allows_any_user(self):
        self.assertEqual(self.set_privacy(BOB_ID, "everyone").status_code, 200)
        self.assertEqual(self.send(ANA_ID, BOB_ID).status_code, 200)
        self.assertEqual(self.send(CARO_ID, BOB_ID).status_code, 200)

    # 7 y 26
    def test_privacy_following_only_allows_people_the_recipient_follows(self):
        self.set_privacy(BOB_ID, "following")
        self.follow(BOB_ID, ANA_ID)

        self.assertEqual(self.send(ANA_ID, BOB_ID).status_code, 200)
        # Caro sigue a Bob, pero Bob no la sigue a ella: no alcanza.
        self.follow(CARO_ID, BOB_ID)
        self.assertEqual(self.send(CARO_ID, BOB_ID).status_code, 403)
        self.assertFalse(self.thread(CARO_ID, BOB_ID).json()["can_send"])

        # Se comprueba en cada envío: si Bob deja de seguir a Ana, se cierra.
        self.unfollow(BOB_ID, ANA_ID)
        self.assertEqual(self.send(ANA_ID, BOB_ID, "¿Sigues ahí?").status_code, 403)

    # 8 y 26
    def test_privacy_nobody_blocks_everyone(self):
        self.send(ANA_ID, BOB_ID, "Antes de cerrar")
        self.set_privacy(BOB_ID, "nobody")
        self.follow(BOB_ID, ANA_ID)

        self.assertEqual(self.send(ANA_ID, BOB_ID).status_code, 403)
        self.assertEqual(self.send(CARO_ID, BOB_ID).status_code, 403)
        self.assertEqual(len(self.database.tables["private_messages"]), 1)

        # Bob sí puede escribir, y se le avisa que no podrán responderle.
        self.assertEqual(self.send(BOB_ID, ANA_ID).status_code, 200)
        self.assertTrue(
            self.thread(BOB_ID, ANA_ID).json()["replies_blocked_by_my_privacy"]
        )

    def test_privacy_setting_validation_and_default(self):
        default = self.client.get(
            "/me/message-settings", headers=auth_header(ANA_ID)
        ).json()
        self.assertEqual(default["allow_from"], "everyone")

        self.assertEqual(self.set_privacy(ANA_ID, "amigos").status_code, 400)
        self.assertEqual(self.set_privacy(ANA_ID, "nobody").status_code, 200)

        # Cada quien cambia solo su propia configuración.
        self.assertEqual(
            self.client.get(
                "/me/message-settings", headers=auth_header(BOB_ID)
            ).json()["allow_from"],
            "everyone"
        )

    # 9 y 10
    def test_unread_counts_and_mark_as_read(self):
        self.send(ANA_ID, BOB_ID, "Uno")
        self.send(ANA_ID, BOB_ID, "Dos")
        self.send(CARO_ID, BOB_ID, "Tres")

        self.assertEqual(self.summary(BOB_ID)["private_unread"], 3)
        # Los mensajes propios nunca cuentan como no leídos.
        self.assertEqual(self.summary(ANA_ID)["private_unread"], 0)

        inbox = self.client.get(
            "/messages/conversations", headers=auth_header(BOB_ID)
        ).json()["conversations"]
        unread = {item["user"]["username"]: item["unread_count"] for item in inbox}
        self.assertEqual(unread, {"ana": 2, "caro": 1})

        # Abrir la conversación no la marca sola: lo hace la llamada de lectura.
        self.thread(BOB_ID, ANA_ID)
        self.assertEqual(self.summary(BOB_ID)["private_unread"], 3)

        read = self.client.post(
            f"/messages/private/{ANA_ID}/read", headers=auth_header(BOB_ID)
        )
        self.assertEqual(read.json()["read"], 2)
        self.assertEqual(self.summary(BOB_ID)["private_unread"], 1)

        # Ana ve que Bob leyó sus mensajes.
        messages_seen = self.thread(ANA_ID, BOB_ID).json()["messages"]
        self.assertTrue(all(message["read_at"] for message in messages_seen))

        # Quien envió no puede marcar como leído lo que él mismo escribió.
        self.send(ANA_ID, BOB_ID, "Cuatro")
        self.client.post(
            f"/messages/private/{BOB_ID}/read", headers=auth_header(ANA_ID)
        )
        self.assertEqual(self.summary(BOB_ID)["private_unread"], 2)

    # 11
    def test_report_reuses_support_requests(self):
        self.send(BOB_ID, ANA_ID, "Mensaje molesto")
        message_id = self.database.tables["private_messages"][0]["id"]

        response = self.client.post(
            f"/messages/private/{BOB_ID}/report",
            json={"reason": "Me está insultando", "message_id": message_id},
            headers=auth_header(ANA_ID)
        )
        self.assertEqual(response.status_code, 200, response.text)
        # Al usuario no se le devuelven datos internos del reporte.
        self.assertEqual(set(response.json()), {"message"})

        tickets = self.database.tables["support_requests"]
        self.assertEqual(len(tickets), 1)
        ticket = tickets[0]
        conversation_id = self.database.tables["private_conversations"][0]["id"]
        self.assertEqual(ticket["user_id"], ANA_ID)
        self.assertEqual(ticket["category"], messages.REPORT_CATEGORY)
        self.assertEqual(ticket["status"], "pending")
        self.assertIn("Me está insultando", ticket["message"])
        self.assertIn(BOB_ID, ticket["message"])
        self.assertIn(conversation_id, ticket["message"])
        self.assertIn(message_id, ticket["message"])

    def test_report_requires_conversation_reason_and_foreign_message(self):
        no_conversation = self.client.post(
            f"/messages/private/{BOB_ID}/report",
            json={"reason": "Nada"},
            headers=auth_header(ANA_ID)
        )
        self.assertEqual(no_conversation.status_code, 404)

        self.send(ANA_ID, BOB_ID, "Mío")
        own_message_id = self.database.tables["private_messages"][0]["id"]

        empty_reason = self.client.post(
            f"/messages/private/{BOB_ID}/report",
            json={"reason": "   "},
            headers=auth_header(ANA_ID)
        )
        self.assertEqual(empty_reason.status_code, 400)

        # No se puede reportar un mensaje propio como si fuera del otro.
        own = self.client.post(
            f"/messages/private/{BOB_ID}/report",
            json={"reason": "Prueba", "message_id": own_message_id},
            headers=auth_header(ANA_ID)
        )
        self.assertEqual(own.status_code, 404)
        self.assertEqual(self.database.tables["support_requests"], [])

    # 12
    def test_private_rate_limit(self):
        limit = messages.MESSAGE_RATE_LIMITS["private"][0][0]

        for index in range(limit):
            response = self.send(ANA_ID, BOB_ID, f"Mensaje {index}")
            self.assertEqual(response.status_code, 200, response.text)

        self.assertEqual(self.send(ANA_ID, BOB_ID, "Uno más").status_code, 429)
        self.assertEqual(len(self.database.tables["private_messages"]), limit)
        # El límite es por usuario: Caro no se ve afectada.
        self.assertEqual(self.send(CARO_ID, BOB_ID).status_code, 200)

    def test_new_conversation_and_author_rate_limits(self):
        limit = messages.MESSAGE_RATE_LIMITS["new_conversation"][0][0]
        strangers = [str(uuid.uuid4()) for _ in range(limit + 1)]
        self.database.tables["users"].extend(
            {"id": user_id, "username": f"u{index}", "role": "user"}
            for index, user_id in enumerate(strangers)
        )

        for user_id in strangers[:limit]:
            self.assertEqual(self.send(ANA_ID, user_id).status_code, 200)
        self.assertEqual(self.send(ANA_ID, strangers[limit]).status_code, 429)

        post_limit = messages.MESSAGE_RATE_LIMITS["author_post"][0][0]
        for _ in range(post_limit):
            self.publish()
        blocked = self.client.post(
            "/messages/author-posts",
            json={"content": "Otro aviso"},
            headers=auth_header(AUTHOR_ID)
        )
        self.assertEqual(blocked.status_code, 429)

        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.database.tables["author_posts"][0]["id"]
        reply_limit = messages.MESSAGE_RATE_LIMITS["reply"][0][0]
        for _ in range(reply_limit):
            self.assertEqual(self.reply(ANA_ID, post_id).status_code, 200)
        self.assertEqual(self.reply(ANA_ID, post_id).status_code, 429)

    # 13
    def test_length_limits_and_empty_messages(self):
        maximum = messages.PRIVATE_MESSAGE_MAX_LENGTH

        self.assertEqual(self.send(ANA_ID, BOB_ID, "a" * maximum).status_code, 200)
        self.assertEqual(
            self.send(ANA_ID, BOB_ID, "a" * (maximum + 1)).status_code, 400
        )
        for empty in ("", "   ", "\n\n\t", "\u200b\u200b", "\u00a0"):
            self.assertEqual(self.send(ANA_ID, BOB_ID, empty).status_code, 400, empty)

        self.assertEqual(len(self.database.tables["private_messages"]), 1)

        # Los emojis normales son texto y se aceptan.
        emoji = self.send(ANA_ID, BOB_ID, "Me encantó 💜🐉")
        self.assertEqual(emoji.json()["message"]["content"], "Me encantó 💜🐉")

        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()
        too_long = "a" * (messages.AUTHOR_REPLY_MAX_LENGTH + 1)
        self.assertEqual(self.reply(ANA_ID, post_id, too_long).status_code, 400)
        self.assertEqual(self.reply(ANA_ID, post_id, "  ").status_code, 400)

        long_post = self.client.post(
            "/messages/author-posts",
            json={"content": "a" * (messages.AUTHOR_POST_MAX_LENGTH + 1)},
            headers=auth_header(AUTHOR_ID)
        )
        self.assertEqual(long_post.status_code, 400)

    # ============================================================
    # AUTOR → SEGUIDORES
    # ============================================================

    # 14 y 15
    def test_author_publishes_and_followers_see_the_message(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish("Estoy preparando una nueva historia.")

        channels = self.client.get(
            "/messages/authors", headers=auth_header(ANA_ID)
        ).json()["channels"]
        self.assertEqual(len(channels), 1)
        self.assertEqual(channels[0]["author"]["username"], "autora")
        self.assertEqual(channels[0]["unread_count"], 1)
        self.assertEqual(
            channels[0]["last_post_preview"], "Estoy preparando una nueva historia."
        )

        channel = self.client.get(
            f"/messages/authors/{AUTHOR_ID}", headers=auth_header(ANA_ID)
        )
        self.assertEqual(channel.status_code, 200, channel.text)
        body = channel.json()
        self.assertFalse(body["is_own"])
        self.assertTrue(body["can_reply"])
        self.assertEqual([post["id"] for post in body["posts"]], [post_id])

        # Quien no sigue al autor no recibe ni puede abrir sus mensajes.
        self.assertEqual(
            self.client.get(
                "/messages/authors", headers=auth_header(BOB_ID)
            ).json()["channels"],
            []
        )
        self.assertEqual(
            self.client.get(
                f"/messages/authors/{AUTHOR_ID}", headers=auth_header(BOB_ID)
            ).status_code,
            403
        )

        # El autor ve su propio canal.
        own = self.client.get(
            f"/messages/authors/{AUTHOR_ID}", headers=auth_header(AUTHOR_ID)
        ).json()
        self.assertTrue(own["is_own"])

    def test_author_channel_unread_and_read_marks(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()
        self.assertEqual(self.summary(ANA_ID)["authors_unread"], 1)

        read = self.client.post(
            f"/messages/authors/{AUTHOR_ID}/read", headers=auth_header(ANA_ID)
        )
        self.assertEqual(read.status_code, 200)
        self.assertEqual(self.summary(ANA_ID)["authors_unread"], 0)

        # Al autor le cuentan las respuestas nuevas de sus seguidores.
        self.reply(ANA_ID, post_id)
        self.assertEqual(self.summary(AUTHOR_ID)["authors_unread"], 1)
        self.client.post(
            f"/messages/authors/{AUTHOR_ID}/read", headers=auth_header(AUTHOR_ID)
        )
        self.assertEqual(self.summary(AUTHOR_ID)["authors_unread"], 0)

        # Quien no sigue al autor no puede crear marcas de lectura suyas.
        self.assertEqual(
            self.client.post(
                f"/messages/authors/{AUTHOR_ID}/read", headers=auth_header(BOB_ID)
            ).status_code,
            403
        )

    # 16, 17 y 28
    def test_only_current_followers_can_reply(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()

        follower = self.reply(ANA_ID, post_id)
        self.assertEqual(follower.status_code, 200, follower.text)
        self.assertFalse(follower.json()["reply"]["is_author"])

        stranger = self.reply(BOB_ID, post_id, "No lo sigo")
        self.assertEqual(stranger.status_code, 403)
        self.assertEqual(len(self.database.tables["author_post_replies"]), 1)

    # 18 y 19
    def test_unfollowing_removes_reply_permission_and_following_again_restores_it(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()
        self.assertEqual(self.reply(ANA_ID, post_id).status_code, 200)

        self.unfollow(ANA_ID, AUTHOR_ID)
        self.assertEqual(self.reply(ANA_ID, post_id, "Ya no sigo").status_code, 403)
        self.assertEqual(
            self.client.get(
                f"/messages/authors/{AUTHOR_ID}", headers=auth_header(ANA_ID)
            ).status_code,
            403
        )

        self.follow(ANA_ID, AUTHOR_ID)
        self.assertEqual(self.reply(ANA_ID, post_id, "Volví").status_code, 200)

    # 20 y 21
    def test_author_replies_and_followers_cannot_reply_to_each_other(self):
        self.follow(ANA_ID, AUTHOR_ID)
        self.follow(BOB_ID, AUTHOR_ID)
        post_id = self.publish()

        ana_reply_id = self.reply(ANA_ID, post_id).json()["reply"]["id"]

        # El autor le contesta a una seguidora.
        author_reply = self.reply(
            AUTHOR_ID, post_id, "¡Gracias, Ana!", reply_to_id=ana_reply_id
        )
        self.assertEqual(author_reply.status_code, 200, author_reply.text)
        self.assertTrue(author_reply.json()["reply"]["is_author"])
        author_reply_id = author_reply.json()["reply"]["id"]

        # Un seguidor no le contesta a otro seguidor...
        between_followers = self.reply(
            BOB_ID, post_id, "Ana, opino distinto", reply_to_id=ana_reply_id
        )
        self.assertEqual(between_followers.status_code, 403)

        # ...pero sí al autor.
        to_author = self.reply(
            BOB_ID, post_id, "Yo también lo leeré", reply_to_id=author_reply_id
        )
        self.assertEqual(to_author.status_code, 200, to_author.text)

        # Una respuesta de otro mensaje no sirve como destino.
        other_post_id = self.publish("Otro aviso")
        wrong_post = self.reply(
            AUTHOR_ID, other_post_id, "Cruce", reply_to_id=ana_reply_id
        )
        self.assertEqual(wrong_post.status_code, 404)

        channel = self.client.get(
            f"/messages/authors/{AUTHOR_ID}", headers=auth_header(ANA_ID)
        ).json()
        replies = next(
            post for post in channel["posts"] if post["id"] == post_id
        )["replies"]
        self.assertEqual(
            [reply["user"]["username"] for reply in replies],
            ["ana", "autora", "bob"]
        )

    # 22, 23 y 24
    def test_author_can_close_and_reopen_replies(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()

        closed = self.set_replies_open(AUTHOR_ID, post_id, False)
        self.assertEqual(closed.status_code, 200, closed.text)
        self.assertFalse(closed.json()["replies_open"])

        # Se puede leer, pero no responder.
        channel = self.client.get(
            f"/messages/authors/{AUTHOR_ID}", headers=auth_header(ANA_ID)
        ).json()
        self.assertFalse(channel["posts"][0]["replies_open"])
        self.assertEqual(self.reply(ANA_ID, post_id).status_code, 403)
        # El autor sí puede seguir escribiendo en su propio hilo.
        self.assertEqual(self.reply(AUTHOR_ID, post_id, "Aclaro algo").status_code, 200)

        reopened = self.set_replies_open(AUTHOR_ID, post_id, True)
        self.assertTrue(reopened.json()["replies_open"])
        self.assertEqual(self.reply(ANA_ID, post_id).status_code, 200)

    def test_only_the_author_controls_their_posts(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()

        self.assertEqual(self.set_replies_open(ANA_ID, post_id, False).status_code, 404)
        self.assertEqual(
            self.client.delete(
                f"/messages/author-posts/{post_id}", headers=auth_header(ANA_ID)
            ).status_code,
            404
        )
        self.assertTrue(self.database.tables["author_posts"][0]["replies_open"])

        deleted = self.client.delete(
            f"/messages/author-posts/{post_id}", headers=auth_header(AUTHOR_ID)
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.database.tables["author_posts"], [])

    def test_blocked_follower_cannot_reply(self):
        self.follow(ANA_ID, AUTHOR_ID)
        post_id = self.publish()
        self.block(AUTHOR_ID, ANA_ID)

        self.assertEqual(self.reply(ANA_ID, post_id).status_code, 403)
        channel = self.client.get(
            f"/messages/authors/{AUTHOR_ID}", headers=auth_header(ANA_ID)
        ).json()
        self.assertFalse(channel["can_reply"])

    # ============================================================
    # SEGURIDAD
    # ============================================================

    # 29
    def test_responses_do_not_expose_private_data(self):
        self.follow(ANA_ID, AUTHOR_ID)
        self.send(ANA_ID, BOB_ID, "Hola")
        post_id = self.publish()
        self.reply(ANA_ID, post_id)

        responses = [
            self.thread(BOB_ID, ANA_ID),
            self.client.get("/messages/conversations", headers=auth_header(BOB_ID)),
            self.client.get("/messages/authors", headers=auth_header(ANA_ID)),
            self.client.get(
                f"/messages/authors/{AUTHOR_ID}", headers=auth_header(ANA_ID)
            )
        ]
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn("privado.test", response.text)
            self.assertNotIn("email", response.text)
            self.assertNotIn("role", response.text)

        self.assertEqual(
            set(responses[0].json()["user"]), {"id", "username", "avatar_url"}
        )
        # La privacidad de la otra persona no se devuelve como dato.
        self.assertNotIn("allow_from", responses[0].text)

    # 30
    def test_html_is_stored_and_returned_as_plain_text(self):
        self.follow(ANA_ID, AUTHOR_ID)

        sent = self.send(ANA_ID, BOB_ID, XSS_TEXT)
        self.assertEqual(sent.status_code, 200, sent.text)
        self.assertTrue(sent.headers["content-type"].startswith("application/json"))
        self.assertEqual(sent.json()["message"]["content"], XSS_TEXT)

        thread = self.thread(BOB_ID, ANA_ID)
        self.assertEqual(thread.json()["messages"][0]["content"], XSS_TEXT)

        post_id = self.publish(XSS_TEXT)
        reply = self.reply(ANA_ID, post_id, XSS_TEXT)
        self.assertEqual(reply.json()["reply"]["content"], XSS_TEXT)

        # Los caracteres de control no se guardan.
        control = self.send(ANA_ID, BOB_ID, "Hola\x00\x07 mundo")
        self.assertEqual(control.json()["message"]["content"], "Hola mundo")


if __name__ == "__main__":
    unittest.main()
