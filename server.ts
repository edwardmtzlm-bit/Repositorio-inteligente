import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

dotenv.config({ path: '.env.local' });
dotenv.config();

function parseCorsOrigins(value?: string) {
  if (!value?.trim()) {
    return true;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : true;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const [{ processRouter }, { searchRouter }, { tagsRouter }, { tagCatalogRouter }] = await Promise.all([
    import('./backend/routes/process'),
    import('./backend/routes/search'),
    import('./backend/routes/tags'),
    import('./backend/routes/tagCatalog'),
  ]);

  app.use(cors({ origin: parseCorsOrigins(process.env.CORS_ORIGIN) }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/process-image', processRouter);
  app.use('/api', searchRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/tag-catalog', tagCatalogRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('No fue posible iniciar el servidor:', error);
  process.exit(1);
});
