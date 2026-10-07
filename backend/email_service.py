import html
import os
import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")


def send_welcome_email(email: str, username: str):
    # El nombre de usuario lo escribe quien se registra: se escapa para que
    # no pueda insertar HTML ni enlaces en el correo.
    username = html.escape(username or "")

    try:
        resend.Emails.send({
            "from": os.getenv("EMAIL_FROM"),
            "to": [email],
            "subject": "¡Bienvenido/a a FriBuk! 📚",
            "html": f"""
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Bienvenido/a a FriBuk</title>
            </head>

            <body style="
                margin: 0;
                padding: 0;
                background-color: #f3f0ea;
                font-family: Arial, Helvetica, sans-serif;
                color: #292525;
            ">

                <table width="100%" cellpadding="0" cellspacing="0" border="0"
                    style="background-color: #f3f0ea; padding: 40px 20px;">

                    <tr>
                        <td align="center">

                            <table width="100%" cellpadding="0" cellspacing="0" border="0"
                                style="
                                    max-width: 600px;
                                    background-color: #faf8f4;
                                    border-radius: 18px;
                                    overflow: hidden;
                                ">

                                <!-- ENCABEZADO -->
                                <tr>
                                    <td align="center"
                                        style="
                                            background-color: #722f3f;
                                            padding: 35px 25px;
                                        ">

                                        <div style="
                                            font-size: 34px;
                                            font-weight: bold;
                                            color: #ffffff;
                                            letter-spacing: 1px;
                                        ">
                                            FriBuk
                                        </div>

                                    </td>
                                </tr>

                                <!-- CONTENIDO -->
                                <tr>
                                    <td style="padding: 40px 35px 30px 35px;">

                                        <h1 style="
                                            margin: 0 0 18px 0;
                                            color: #722f3f;
                                            font-size: 28px;
                                            text-align: center;
                                        ">
                                            ¡Bienvenido/a a FriBuk! 📚
                                        </h1>

                                        <p style="
                                            font-size: 17px;
                                            line-height: 1.6;
                                            margin: 0 0 20px 0;
                                        ">
                                            Hola <strong>@{username}</strong>,
                                        </p>

                                        <p style="
                                            font-size: 16px;
                                            line-height: 1.7;
                                            margin: 0 0 18px 0;
                                        ">
                                            ¡Qué bueno tenerte en <strong>FriBuk</strong>!
                                        </p>

                                        <p style="
                                            font-size: 16px;
                                            line-height: 1.7;
                                            margin: 0 0 18px 0;
                                        ">
                                            FriBuk es una plataforma para
                                            <strong>lectores y escritores</strong>,
                                            creada para que puedas descubrir nuevas
                                            historias, leer tus libros y fanfics favoritos
                                            y, si te animas, comenzar a escribir y compartir
                                            tus propias historias.
                                        </p>

                                        <p style="
                                            font-size: 16px;
                                            line-height: 1.7;
                                            margin: 0 0 25px 0;
                                        ">
                                            Pero FriBuk es más que leer y escribir. ✨
                                        </p>

                                        <!-- CARACTERÍSTICAS -->
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">

                                            <tr>
                                                <td style="
                                                    padding: 12px 15px;
                                                    background-color: #f3f0ea;
                                                    border-radius: 10px;
                                                    font-size: 15px;
                                                ">
                                                    📚 &nbsp; Descubre nuevas historias
                                                </td>
                                            </tr>

                                            <tr>
                                                <td height="10"></td>
                                            </tr>

                                            <tr>
                                                <td style="
                                                    padding: 12px 15px;
                                                    background-color: #f3f0ea;
                                                    border-radius: 10px;
                                                    font-size: 15px;
                                                ">
                                                    ✍️ &nbsp; Escribe y comparte tus historias
                                                </td>
                                            </tr>

                                            <tr>
                                                <td height="10"></td>
                                            </tr>

                                            <tr>
                                                <td style="
                                                    padding: 12px 15px;
                                                    background-color: #f3f0ea;
                                                    border-radius: 10px;
                                                    font-size: 15px;
                                                ">
                                                    💬 &nbsp; Participa en nuestra comunidad
                                                </td>
                                            </tr>

                                        </table>

                                        <p style="
                                            font-size: 16px;
                                            line-height: 1.7;
                                            margin: 28px 0 25px 0;
                                        ">
                                            Te invitamos a participar activamente en nuestros
                                            <strong>foros</strong>, conocer personas con tus
                                            mismos intereses y formar parte de nuestras
                                            <strong>comunidades de lectores y escritores</strong>.
                                        </p>

                                        <!-- BOTÓN -->
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td align="center" style="padding: 10px 0 25px 0;">

                                                    <a href="#"
                                                        style="
                                                            display: inline-block;
                                                            background-color: #d96a32;
                                                            color: #ffffff;
                                                            text-decoration: none;
                                                            font-size: 16px;
                                                            font-weight: bold;
                                                            padding: 14px 30px;
                                                            border-radius: 10px;
                                                        ">
                                                        IR A FRIBUK
                                                    </a>

                                                </td>
                                            </tr>
                                        </table>

                                        <p style="
                                            text-align: center;
                                            font-size: 16px;
                                            line-height: 1.6;
                                            margin: 5px 0 0 0;
                                            color: #722f3f;
                                            font-weight: bold;
                                        ">
                                            Explora. Descubre. Conversa. Escribe.
                                        </p>

                                    </td>
                                </tr>

                                <!-- PIE -->
                                <tr>
                                    <td align="center"
                                        style="
                                            padding: 22px;
                                            background-color: #51202d;
                                            color: #ffffff;
                                            font-size: 13px;
                                        ">

                                        © FriBuk<br>
                                        El espacio para lectores y escritores.

                                    </td>
                                </tr>

                            </table>

                        </td>
                    </tr>

                </table>

            </body>
            </html>
            """
        })

        return True

    except Exception as e:
        print(f"Error enviando correo de bienvenida: {e}")
        return False