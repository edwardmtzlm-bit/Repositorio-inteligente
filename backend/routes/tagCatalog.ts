import { Router } from 'express';
import { getTagCatalog, saveTagCatalog } from '../services/tagCatalogService';

export const tagCatalogRouter = Router();

tagCatalogRouter.get('/', async (_req, res) => {
  try {
    const blocks = await getTagCatalog();
    return res.json({ blocks });
  } catch (error) {
    console.error('Error en GET /api/tag-catalog:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible cargar el catalogo de tags.',
    });
  }
});

tagCatalogRouter.put('/', async (req, res) => {
  try {
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const savedBlocks = await saveTagCatalog(blocks);
    return res.json({ blocks: savedBlocks });
  } catch (error) {
    console.error('Error en PUT /api/tag-catalog:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible guardar el catalogo de tags.',
    });
  }
});
