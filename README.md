# FriBuk

FriBuk es una plataforma web para leer y compartir historias. Reúne un feed público de obras, herramientas para que sus autores las gestionen y funciones de comunidad para lectores y escritores.

<img width="607" height="792" alt="Fribuk 1" src="https://github.com/user-attachments/assets/b3ec604c-207c-4525-98c3-1c32fe33ea2f" />


## Funcionalidades

- Registro e inicio de sesión mediante Supabase Auth.
- Feed de historias publicadas, con búsqueda por título, descripción y nombre de autor, filtro por género y orden por recomendaciones, fecha, valoración o lecturas.
- Páginas de historia y lectura de capítulos.
- Creación y edición de historias y capítulos; las historias y capítulos admiten estados de publicación según los flujos implementados.
- Recomendaciones, comentarios y valoraciones de historias.
- Comentarios de lectores anclados a un fragmento del texto de un capítulo, con respuestas y reacciones.
- Favoritos y perfiles privados para gestionar historias propias y favoritos.
- Perfiles públicos con historias publicadas, favoritos públicos y seguimiento entre usuarios.
- Carga de portadas, avatares y banners de perfil en Supabase Storage.
- Formulario de soporte y panel administrativo para revisar solicitudes.
- Páginas de privacidad, términos, normas comunitarias, política de contenido, derechos de autor y moderación.

## Tecnologías y arquitectura

El proyecto está dividido en dos aplicaciones dentro del mismo repositorio:

- **Frontend:** React, React Router, Vite y Axios.
- **Backend:** FastAPI y Pydantic.
- **Autenticación y datos:** Supabase Auth y Supabase Database. El backend usa el cliente público para validar sesiones y un cliente administrativo para las operaciones que requieren acceso de servicio.
- **Archivos:** Supabase Storage para portadas, avatares y banners de perfil.

El frontend llama a la API FastAPI. Cuando hay una sesión, Axios adjunta el token de acceso como `Bearer` en las solicitudes. El backend valida ese token con Supabase Auth y determina el usuario autenticado desde la sesión.

## Estructura

```text
FriBuk/
├── backend/
│   ├── main.py
│   ├── chapter_anchors.py
│   ├── sql/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

## Requisitos

- Python compatible con las dependencias de `backend/requirements.txt`.
- Node.js y npm.
- Un proyecto de Supabase configurado para la aplicación.

## Configuración local

### Backend

1. Crea un entorno virtual e instala las dependencias:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Copia `backend/.env.example` a `backend/.env` y completa los valores en tu copia local. El archivo `.env` no debe compartirse ni publicarse.

3. Inicia la API desde la carpeta `backend`:

   ```powershell
   uvicorn main:app --reload
   ```

La API queda disponible localmente en `http://127.0.0.1:8000`. FastAPI publica la documentación interactiva en `/docs`.

Los comentarios de capítulos necesitan las tablas de `backend/sql/chapter_comments.sql`, que se crean ejecutando ese archivo una vez en el SQL Editor de Supabase.

Las pruebas del backend no usan la base de datos real. Se ejecutan desde la carpeta `backend`:

```powershell
python -m unittest discover -s tests
```

### Frontend

En otra terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite inicia el frontend normalmente en `http://localhost:5173`. La dirección de la API sale de la variable `VITE_API_URL` (ver `frontend/.env.example`); sin ella se usa la API local en `http://127.0.0.1:8000`.

Las pruebas del frontend se ejecutan con `npm test`.

## Despliegue

Arquitectura de producción:

| Parte | Servicio | Dirección |
| --- | --- | --- |
| DNS y HTTPS | Cloudflare | `fribuk.com` |
| Frontend (React + Vite) | Cloudflare Pages | `https://www.fribuk.com` |
| Backend (FastAPI) | Render | `https://api.fribuk.com` |
| Base de datos, cuentas e imágenes | Supabase | — |
| Correos | Resend | — |

### Backend en Render

- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:**

  ```
  uvicorn main:app --host 0.0.0.0 --port $PORT --forwarded-allow-ips="*"
  ```

  `--forwarded-allow-ips` hace que el backend vea la dirección real de cada visitante y no la del proxy; sin eso, los límites antispam por IP se compartirían entre todas las personas.
- **Un solo proceso.** No agregar `--workers`: los límites antispam y algunos contadores viven en memoria y no se comparten entre procesos.
- **Python:** `backend/.python-version` fija la versión. Si Render no la toma, definir la variable `PYTHON_VERSION` con el mismo valor.

Variables de entorno del backend:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | Dirección del proyecto de Supabase |
| `SUPABASE_ANON_KEY` | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de Supabase. Nunca va en el frontend |
| `CORS_ALLOWED_ORIGINS` | `https://www.fribuk.com` (varios orígenes se separan con comas) |
| `RESEND_API_KEY` | Clave de Resend para el correo de bienvenida |
| `EMAIL_FROM` | Remitente, con un dominio verificado en Resend |

### Frontend en Cloudflare Pages

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Variable de entorno:** `VITE_API_URL=https://api.fribuk.com`. Se fija al construir: si cambia, hay que volver a desplegar.

No hace falta un archivo de redirecciones: Cloudflare Pages sirve la aplicación en cualquier ruta mientras no exista un `404.html`.

### Supabase

- Ejecutar una vez, en el SQL Editor, cada archivo de `backend/sql/`.
- En Authentication, poner `https://www.fribuk.com` como dirección del sitio, para que los enlaces de confirmación de cuenta lleven al sitio real.
- Configurar un envío de correos propio (SMTP): el servicio incluido solo permite unos pocos correos por hora.

## Seguridad y configuración

- Las credenciales de Supabase pertenecen al backend y se leen desde variables de entorno.
- `SUPABASE_SERVICE_ROLE_KEY` es una credencial privada: no debe incluirse en el frontend, en capturas, ni en un repositorio público.
- Usa `backend/.env.example` como referencia de nombres y conserva los valores reales en `backend/.env` local.
- Las solicitudes autenticadas envían el token de acceso en el encabezado `Authorization`.

## Capturas
<img width="607" height="826" alt="Fribuk 7" src="https://github.com/user-attachments/assets/2be0f595-e7c8-4691-8594-c018f410c238" />
<img width="597" height="787" alt="Fribuk 6" src="https://github.com/user-attachments/assets/f78c7b89-26c3-46d7-a80c-eaa6359eb2b8" />
<img width="592" height="782" alt="Fribuk 5" src="https://github.com/user-attachments/assets/8c786ff3-67e6-4585-946a-cd2256866354" />
<img width="606" height="807" alt="Fribuk 4" src="https://github.com/user-attachments/assets/fe504bb0-21bc-4e78-8975-be631729c6c8" />
<img width="602" height="792" alt="Fribuk 3" src="https://github.com/user-attachments/assets/2c66402d-f694-4017-b77e-ec84b17be685" />
<img width="607" height="816" alt="Fribuk 2" src="https://github.com/user-attachments/assets/7d318184-4cc6-4bee-9a41-05220eaa55d8" />
<img width="607" height="792" alt="Fribuk 1" src="https://github.com/user-attachments/assets/e93da0b1-dbc3-4027-8c7a-b17cae688371" />



## Estado del proyecto

FriBuk cuenta con una aplicación React y una API FastAPI integradas con Supabase. Incluye lectura y publicación de historias, perfiles, interacciones de comunidad y soporte. La configuración de desarrollo documentada aquí utiliza servicios locales y un proyecto Supabase configurado por cada persona desarrolladora.
