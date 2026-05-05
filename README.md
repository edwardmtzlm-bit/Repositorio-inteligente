# Repositorio Inteligente de Conocimiento

Aplicación React + Vite + Node + Supabase para subir imágenes, extraer texto con OCR, detectar idioma, enriquecer contenido con IA y generar automáticamente documentos descargables.

## Arquitectura recomendada

- Frontend: `Vercel`
- Backend API/OCR/Docs: `Render`
- Base de datos + storage: `Supabase`
- Repositorio: `GitHub`

Más detalle en [DEPLOY.md](./DEPLOY.md).

## Variables

Revisa [.env.example](./.env.example).

Principales:

- Backend:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `GENERAL_GOOGLE_DOC_ID`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - `CORS_ORIGIN`
- Frontend:
  - `VITE_API_BASE_URL`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Desarrollo local

1. `npm install`
2. Ejecuta [supabase_schema.sql](./supabase_schema.sql) en Supabase
3. Crea buckets públicos `imagenes` y `documentos`
4. Configura `.env.local`
5. `npm run dev`

## Flujo implementado

- Subida desde galería o cámara
- OCR híbrido con Gemini/Tesseract
- Detección de idioma
- Confirmación editable antes de guardar
- Tags híbridos manuales + sugeridos por IA
- Generación automática de `.docx`
- Listado, búsqueda por texto y filtro por tags
