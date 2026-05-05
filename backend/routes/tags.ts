import { Router } from 'express';
import { deleteTag, getAllTags } from '../services/tagService';

export const tagsRouter = Router();

tagsRouter.get('/', async (_req, res) => {
  try {
    const tags = await getAllTags();
    return res.json(tags);
  } catch (error) {
    console.error('Error en GET /api/tags:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible cargar tags.',
    });
  }
});

tagsRouter.delete('/:tagId', async (req, res) => {
  try {
    const deletedTag = await deleteTag(req.params.tagId);
    return res.json(deletedTag);
  } catch (error) {
    console.error('Error en DELETE /api/tags/:tagId:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible eliminar el tag.',
    });
  }
});
