import { Router } from 'express';
import multer from 'multer';
import { appendImagesToContent, attachAudioToContent, deleteContent, enrichContent, getContentAudioNotes, getLibraryDocxUrl, listContents, queryRepositoryAssistant, regenerateExistingDocuments, removeAudioFromContent, saveContent, syncExistingContentsToLibraryDoc, transcribeContentAudio, updateContentMetadata } from '../services/contentService';

export const searchRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

searchRouter.get('/contents/:contentId/audio', async (req, res) => {
  try {
    const notes = await getContentAudioNotes(req.params.contentId);
    return res.json({ notes });
  } catch (error) {
    console.error('Error en GET /api/contents/:contentId/audio:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible cargar los audios del contenido.',
    });
  }
});

searchRouter.post('/contents/:contentId/audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar un archivo de audio.' });
    }

    const notes = await attachAudioToContent(req.params.contentId, req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.status(201).json({ notes });
  } catch (error) {
    console.error('Error en POST /api/contents/:contentId/audio:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible adjuntar el audio al contenido.',
    });
  }
});

searchRouter.post('/contents/:contentId/audio/:fileName/transcribe', async (req, res) => {
  try {
    const notes = await transcribeContentAudio(req.params.contentId, req.params.fileName);
    return res.json({ notes });
  } catch (error) {
    console.error('Error en POST /api/contents/:contentId/audio/:fileName/transcribe:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible transcribir el audio.',
    });
  }
});

searchRouter.delete('/contents/:contentId/audio/:fileName', async (req, res) => {
  try {
    const notes = await removeAudioFromContent(req.params.contentId, req.params.fileName);
    return res.json({ notes });
  } catch (error) {
    console.error('Error en DELETE /api/contents/:contentId/audio/:fileName:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible eliminar el audio.',
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

searchRouter.post('/assistant/query', async (req, res) => {
  try {
    const question = typeof req.body.question === 'string' ? req.body.question : '';
    const result = await queryRepositoryAssistant(question);
    return res.json(result);
  } catch (error) {
    console.error('Error en POST /api/assistant/query:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible consultar el repositorio con el asistente.',
    });
  }
});
