import { Router } from 'express';
import { appendImagesToContent, deleteContent, enrichContent, getLibraryDocxUrl, listContents, regenerateExistingDocuments, saveContent, syncExistingContentsToLibraryDoc, updateContentMetadata } from '../services/contentService';

export const searchRouter = Router();

searchRouter.get('/contents', async (req, res) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q : '';
    const tags = typeof req.query.tags === 'string' ? req.query.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
    const contents = await listContents(search, tags);
    return res.json(contents);
  } catch (error) {
    console.error('Error en GET /api/contents:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible consultar contenidos.',
    });
  }
});

searchRouter.post('/contents', async (req, res) => {
  try {
    const content = await saveContent(req.body);
    return res.status(201).json(content);
  } catch (error) {
    console.error('Error en POST /api/contents:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible guardar el contenido.',
    });
  }
});

searchRouter.patch('/contents/:contentId/enrich', async (req, res) => {
  try {
    const content = await enrichContent(req.params.contentId, req.body.supplementalText || '');
    return res.json(content);
  } catch (error) {
    console.error('Error en PATCH /api/contents/:contentId/enrich:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible complementar el contenido.',
    });
  }
});

searchRouter.patch('/contents/:contentId/metadata', async (req, res) => {
  try {
    const content = await updateContentMetadata(req.params.contentId, {
      title: req.body.title || '',
      sourceUrl: req.body.sourceUrl || '',
      notes: req.body.notes || '',
    });
    return res.json(content);
  } catch (error) {
    console.error('Error en PATCH /api/contents/:contentId/metadata:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible actualizar título, fuente o notas.',
    });
  }
});

searchRouter.patch('/contents/:contentId/images', async (req, res) => {
  try {
    const content = await appendImagesToContent(req.params.contentId, Array.isArray(req.body.imageUrls) ? req.body.imageUrls : []);
    return res.json(content);
  } catch (error) {
    console.error('Error en PATCH /api/contents/:contentId/images:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible agregar imágenes al contenido.',
    });
  }
});

searchRouter.delete('/contents/:contentId', async (req, res) => {
  try {
    const result = await deleteContent(req.params.contentId);
    return res.json(result);
  } catch (error) {
    console.error('Error en DELETE /api/contents/:contentId:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible eliminar el contenido.',
    });
  }
});

searchRouter.get('/library-docx', async (_req, res) => {
  try {
    const url = await getLibraryDocxUrl();
    return res.json({ url });
  } catch (error) {
    console.error('Error en GET /api/library-docx:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible obtener el Word general.',
    });
  }
});

searchRouter.post('/library-docx/sync', async (_req, res) => {
  try {
    const result = await syncExistingContentsToLibraryDoc();
    return res.json(result);
  } catch (error) {
    console.error('Error en POST /api/library-docx/sync:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible sincronizar el Google Doc general.',
    });
  }
});

searchRouter.post('/library-docx/regenerate', async (_req, res) => {
  try {
    const result = await regenerateExistingDocuments();
    return res.json(result);
  } catch (error) {
    console.error('Error en POST /api/library-docx/regenerate:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible regenerar documentos existentes.',
    });
  }
});
