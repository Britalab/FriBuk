# FriBuk

FriBuk es una plataforma web para leer y compartir historias. Reúne un feed público de obras, herramientas para que sus autores las gestionen y funciones de comunidad para lectores y escritores.

## Funcionalidades

- Registro e inicio de sesión mediante Supabase Auth.
- Feed de historias publicadas, con búsqueda por título, descripción y nombre de autor, filtro por género y orden por recomendaciones, fecha, valoración o lecturas.
- Páginas de historia y lectura de capítulos.
- Creación y edición de historias y capítulos; las historias y capítulos admiten estados de publicación según los flujos implementados.
- Recomendaciones, comentarios y valoraciones de historias.
- Favoritos y perfiles privados para gestionar historias propias y favoritos.
- Perfiles públicos con historias publicadas, favoritos públicos y seguimiento entre usuarios.
- Carga de portadas y avatares en Supabase Storage.
- Formulario de soporte y panel administrativo para revisar solicitudes.
- Páginas de privacidad, términos, normas comunitarias, política de contenido, derechos de autor y moderación.

## Tecnologías y arquitectura

El proyecto está dividido en dos aplicaciones dentro del mismo repositorio:

- **Frontend:** React, React Router, Vite y Axios.
- **Backend:** FastAPI y Pydantic.
- **Autenticación y datos:** Supabase Auth y Supabase Database. El backend usa el cliente público para validar sesiones y un cliente administrativo para las operaciones que requieren acceso de servicio.
- **Archivos:** Supabase Storage para portadas y avatares.

El frontend llama a la API FastAPI. Cuando hay una sesión, Axios adjunta el token de acceso como `Bearer` en las solicitudes. El backend valida ese token con Supabase Auth y determina el usuario autenticado desde la sesión.

## Estructura

```text
FriBuk/
├── backend/
│   ├── main.py
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

### Frontend

En otra terminal:

```powershell
cd frontend
npm install
npm run dev
```

Vite inicia el frontend normalmente en `http://localhost:5173`. El cliente actual está configurado para comunicarse con la API local en `http://127.0.0.1:8000`.

## Seguridad y configuración

- Las credenciales de Supabase pertenecen al backend y se leen desde variables de entorno.
- `SUPABASE_SERVICE_ROLE_KEY` es una credencial privada: no debe incluirse en el frontend, en capturas, ni en un repositorio público.
- Usa `backend/.env.example` como referencia de nombres y conserva los valores reales en `backend/.env` local.
- Las solicitudes autenticadas envían el token de acceso en el encabezado `Authorization`.

## Capturas

En espera, Frontend en proceso de enchulado :D

## Estado del proyecto

FriBuk cuenta con una aplicación React y una API FastAPI integradas con Supabase. Incluye lectura y publicación de historias, perfiles, interacciones de comunidad y soporte. La configuración de desarrollo documentada aquí utiliza servicios locales y un proyecto Supabase configurado por cada persona desarrolladora.
