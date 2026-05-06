import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { generateKnowledgeMetadata } from '../services/aiService';
import { generateDocxBuffer } from '../services/docxService';
import { detectLanguage } from '../services/languageService';
import { extractTextFromImage } from '../services/ocrService';
import { getRelevantCatalogBlocks, getTagCatalog } from '../services/tagCatalogService';
import { uploadDocx, uploadImage } from '../services/storageService';
import { buildHybridTags } from '../services/tagService';
import { groupImagesByTheme } from '../utils/themeGrouping';

const upload = multer({ storage: multer.memoryStorage() });

export const processRouter = Router();

const MAX_IMAGES_SINGLE_TOPIC = 15;
const MAX_IMAGES_AUTO_SEPARATE = 10;

function normalizeReadingText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

processRouter.post('/', upload.array('images', 20), async (req, res) => {
  try {
    const tagCatalog = await getTagCatalog();
    const files = req.files as Express.Multer.File[] | undefined;
    const mode = req.body.mode === 'auto-separate' ? 'auto-separate' : 'single-topic';
    const supplementalText = typeof req.body.supplementalText === 'string' ? req.body.supplementalText.trim() : '';
    const sourceUrl = typeof req.body.sourceUrl === 'string' ? req.body.sourceUrl.trim() : '';
    const customTitle = typeof req.body.customTitle === 'string' ? req.body.customTitle.trim() : '';

    if ((!files || files.length === 0) && !supplementalText) {
      return res.status(400).json({ error: 'Debes subir al menos una imagen o pegar texto.' });
    }

    const maxImages = mode === 'single-topic' ? MAX_IMAGES_SINGLE_TOPIC : MAX_IMAGES_AUTO_SEPARATE;

    if ((files?.length ?? 0) > maxImages) {
      return res.status(400).json({
        error:
          mode === 'single-topic'
            ? `Máximo ${MAX_IMAGES_SINGLE_TOPIC} imágenes en "Un solo tema". Más imágenes implican más tiempo de procesamiento.`
            : `Máximo ${MAX_IMAGES_AUTO_SEPARATE} imágenes en "Separar por tema". Más imágenes implican más tiempo de procesamiento.`,
      });
    }

    const perImageDrafts = await Promise.all(
      (files || []).map(async (file, index) => {
        const imageUrl = await uploadImage(file.buffer, file.mimetype, file.originalname);
        const originalText = await extractTextFromImage(file.buffer, file.mimetype);

        if (!originalText) {
          throw new Error(`No se pudo extraer texto utilizable desde la imagen ${index + 1}.`);
        }

        const detectedLanguage = detectLanguage(originalText);

        return {
          index,
          imageUrl,
          originalText,
          detectedLanguage,
        };
      }),
    );

    if (perImageDrafts.length === 0) {
      const combinedLanguage = detectLanguage(supplementalText);
      const combinedMetadata = await generateKnowledgeMetadata(supplementalText, combinedLanguage, tagCatalog);
      const finalTranslatedText = combinedLanguage === 'es' ? normalizeReadingText(supplementalText) : combinedMetadata.translatedText;
      const hybridTags = await buildHybridTags(combinedMetadata.tags);
      const relevantCatalogBlocks = await getRelevantCatalogBlocks(combinedMetadata.tags);
      const finalTitle = customTitle || combinedMetadata.title;
      const docxBuffer = await generateDocxBuffer({
        title: finalTitle,
        summary: combinedMetadata.longSummary,
        translatedText: finalTranslatedText,
        tags: hybridTags.suggestedTags.map((tag) => tag.nombre),
        date: new Date().toLocaleString('es-MX'),
        sourceUrl,
      });
      const docxUrl = await uploadDocx(docxBuffer, finalTitle);

      return res.json({
        modeApplied: 'single-topic',
        totalImages: 0,
        groups: [
          {
            id: randomUUID(),
            imageUrls: [],
            coverImageUrl: '',
            sourceUrl,
            customTitle,
            originalText: supplementalText,
            translatedText: finalTranslatedText,
            detectedLanguage: combinedLanguage,
            title: finalTitle,
            summary: combinedMetadata.summary,
            longSummary: combinedMetadata.longSummary,
            docxUrl,
            suggestedTags: hybridTags.suggestedTags,
            existingTags: hybridTags.existingTags,
            catalogBlocks: relevantCatalogBlocks,
            sourceImageCount: 0,
          },
        ],
      });
    }

    const grouping =
      mode === 'auto-separate'
        ? groupImagesByTheme(
            perImageDrafts.map((draft) => ({
              index: draft.index,
              originalText: draft.originalText,
            })),
          )
        : [{ indices: perImageDrafts.map((draft) => draft.index), rationale: 'Agrupado por elección del usuario.' }];

    const groups = await Promise.all(
      grouping.map(async (group, groupIndex) => {
        const groupedItems = group.indices.map((index) => perImageDrafts[index]).filter(Boolean);
        const combinedOriginalText = [groupedItems.map((item) => item.originalText).join('\n\n---\n\n'), supplementalText]
          .filter(Boolean)
          .join('\n\n=== TEXTO COMPLEMENTARIO ===\n\n');
        const languages = new Set(groupedItems.map((item) => item.detectedLanguage));
        if (supplementalText) {
          languages.add(detectLanguage(supplementalText));
        }
        const finalDetectedLanguage = languages.has('en') && !languages.has('es') ? 'en' : 'es';
        const combinedMetadata = await generateKnowledgeMetadata(combinedOriginalText, finalDetectedLanguage, tagCatalog);
        const finalTranslatedText =
          finalDetectedLanguage === 'es' ? normalizeReadingText(combinedOriginalText) : combinedMetadata.translatedText;

        const hybridTags = await buildHybridTags(combinedMetadata.tags);
        const relevantCatalogBlocks = await getRelevantCatalogBlocks(combinedMetadata.tags);
        const finalTitle =
          customTitle && grouping.length > 1 ? `${customTitle} · Grupo ${groupIndex + 1}` : customTitle || combinedMetadata.title;
        const docxBuffer = await generateDocxBuffer({
          title: finalTitle,
          summary: combinedMetadata.longSummary,
          translatedText: finalTranslatedText,
          tags: hybridTags.suggestedTags.map((tag) => tag.nombre),
          date: new Date().toLocaleString('es-MX'),
          sourceUrl,
        });
        const docxUrl = await uploadDocx(docxBuffer, finalTitle);

        return {
          id: randomUUID(),
          imageUrls: groupedItems.map((item) => item.imageUrl),
          coverImageUrl: groupedItems[0]?.imageUrl || '',
          sourceUrl,
          customTitle,
          originalText: combinedOriginalText,
          translatedText: finalTranslatedText,
          detectedLanguage: finalDetectedLanguage,
          title: finalTitle,
          summary: combinedMetadata.summary,
          longSummary: combinedMetadata.longSummary,
          docxUrl,
          suggestedTags: hybridTags.suggestedTags,
          existingTags: hybridTags.existingTags,
          catalogBlocks: relevantCatalogBlocks,
          sourceImageCount: groupedItems.length,
        };
      }),
    );

    return res.json({
      modeApplied: mode,
      totalImages: perImageDrafts.length,
      groups,
    });
  } catch (error) {
    console.error('Error en /api/process-image:', error);
    const message = error instanceof Error ? error.message : 'No fue posible procesar la imagen.';
    const quotaExceeded = message.includes('RESOURCE_EXHAUSTED') || message.includes('Quota exceeded') || message.includes('429');

    return res.status(500).json({
      error: quotaExceeded
        ? 'Se alcanzó la cuota actual de IA. Espera un momento o procesa menos imágenes por lote.'
        : message,
    });
  }
});

processRouter.post('/upload', upload.array('images', 20), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos una imagen.' });
    }

    const urls = await Promise.all(files.map((file) => uploadImage(file.buffer, file.mimetype, file.originalname)));

    return res.json({ urls });
  } catch (error) {
    console.error('Error en /api/process-image/upload:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No fue posible subir imágenes extra.',
    });
  }
});
