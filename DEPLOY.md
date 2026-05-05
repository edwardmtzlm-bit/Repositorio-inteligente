# Deploy

## Recommended setup
- Frontend: Vercel
- Backend API/OCR/Docs: Render Web Service
- Database + Storage: Supabase
- Source control: GitHub

## 1. GitHub
Push this repo to GitHub.

## 2. Backend on Render
Create a new Web Service from this repo.

Use:
- Build Command: `npm install --cache /tmp/npm-cache-marchand && npm run build`
- Start Command: `npm run start`

Backend env vars:
- `NODE_ENV=production`
- `CORS_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GENERAL_GOOGLE_DOC_ID`

## 3. Frontend on Vercel
Import the same repo in Vercel.

Frontend env vars:
- `VITE_API_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 4. Supabase
Create buckets:
- `imagenes`
- `documentos`

Run `supabase_schema.sql` in Supabase SQL Editor.

## Notes
- If you change Supabase project later, update the new keys/URL in Render and Vercel.
- Local `.env.local` changes only affect your local machine.
- Production changes must be done in each platform's environment variables.
