import { generateDocxBuffer } from './docxService';
import { appendContentToGeneralGoogleDoc, getGeneralGoogleDocUrl, syncContentsToGeneralGoogleDoc } from './googleDocsService';
import { answerRepositoryQuestion, generateKnowledgeMetadata, transcribeAudioBuffer } from './aiService';
import { deleteContentAudioNote, downloadContentAudioNote, listContentAudioNotes, removeAllContentAudioNotes, updateAudioTranscription, uploadContentAudioNote } from './contentAudioService';
import { deleteContentVideoNote, listContentVideoNotes, removeAllContentVideoNotes, uploadContentVideoNote } from './contentVideoService';
import { detectLanguage } from './languageService';
import { getCatalogTagBlockLookup, getTagCatalog } from './tagCatalogService';
import { uploadDocx } from './storageService';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ensureTags, type TagRecord } from './tagService';
import { saveContentImageFingerprints, type ImageFingerprintInput } from './imageSearchService';

export interface SaveContentInput {
  imageUrl: string;
  imageUrls: string[];
  imageFingerprints?: ImageFingerprintInput[];
  sourceUrl: string;
  notes: string;
  originalText: string;
  translatedText: string;
  title: string;
  summary: string;
  longSummary: string;
  docxUrl?: string;
  selectedTags: Array<Pick<TagRecord, 'id' | 'nombre' | 'tipo'>>;
}

interface AssistantRepositoryItem {
  id: string;
  titulo: string;
  resumen: string;
  resumen_largo: string;
  texto_original: string;
  texto_traducido: string;
  fuente_url: string | null;
  fecha: string;
  tags: Array<{ nombre: string; bloque: string | null }>;
}

function tokenizeAssistantText(text: string) {
  return text
    .toLowerCase()
    .match(/[a-záéíóúñü0-9]+/gi)
    ?.filter((token) => token.length >= 3) ?? [];
}

function scoreAssistantMatch(question: string, content: { title: string; summary: string; translatedText: string; tags: Array<{ nombre: string }> }) {
  const queryTokens = Array.from(new Set(tokenizeAssistantText(question)));

  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = `${content.title} ${content.summary} ${content.translatedText} ${content.tags.map((tag) => tag.nombre).join(' ')}`.toLowerCase();

  return queryTokens.reduce((score, token) => {
    if (haystack.includes(token)) {
      return score + 1;
    }

    return score;
  }, 0);
}

function normalizeAssistantQuestion(question: string) {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isRepositoryCountQuestion(question: string) {
  const normalized = normalizeAssistantQuestion(question);

  const asksForCount =
    /\b(cuanto|cuantos|cuanta|cuantas)\b/.test(normalized) ||
    /\bcuantos van\b/.test(normalized) ||
    /\btotal\b/.test(normalized);

  const asksAboutRepositoryItems =
    /\b(archivo|archivos|articulo|articulos|contenido|contenidos|documento|documentos)\b/.test(normalized) ||
    /\bvan cargad[oa]s?\b/.test(normalized);

  return asksForCount && asksAboutRepositoryItems;
}

function buildRepositoryCountAnswer(totalCount: number) {
  if (totalCount === 0) {
    return 'Actualmente no hay artículos cargados en el repositorio.';
  }

  if (totalCount === 1) {
    return 'Actualmente hay 1 artículo cargado en el repositorio.';
  }

  return `Actualmente hay ${totalCount} artículos cargados en el repositorio.`;
}

const assistantStopwords = new Set([
  'que',
  'cual',
  'cuales',
  'cuanto',
  'cuantos',
  'cuanta',
  'cuantas',
  'hay',
  'tengo',
  'tenemos',
  'alguno',
  'alguna',
  'algun',
  'sobre',
  'del',
  'de',
  'la',
  'las',
  'los',
  'el',
  'un',
  'una',
  'unos',
  'unas',
  'por',
  'para',
  'con',
  'sin',
  'van',
  'cargados',
  'cargadas',
  'archivo',
  'archivos',
  'articulo',
  'articulos',
  'contenido',
  'contenidos',
  'documento',
  'documentos',
  'tema',
  'temas',
  'repositorio',
  'actualmente',
  'actual',
  'mios',
  'mias',
  'mio',
  'mia',
  'hablen',
  'habla',
  'hablar',
  'digan',
  'dime',
  'mostrar',
  'muéstrame',
  'muestrame',
]);

function includesAnyPhrase(question: string, phrases: string[]) {
  return phrases.some((phrase) => question.includes(phrase));
}

function extractMeaningfulAssistantTokens(question: string) {
  return Array.from(
    new Set(
      tokenizeAssistantText(normalizeAssistantQuestion(question)).filter(
        (token) => token.length >= 3 && !assistantStopwords.has(token),
      ),
    ),
  );
}

function buildAssistantReviewedItems(
  items: AssistantRepositoryItem[],
  reasonById = new Map<string, string>(),
  limit = 8,
) {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.titulo,
    summary: item.resumen_largo || item.resumen,
    reason: reasonById.get(item.id),
  }));
}

function buildAssistantGroups(
  groups: Array<{
    type: 'duplicate-pair';
    title: string;
    description?: string;
    items: AssistantRepositoryItem[];
  }>,
  reasonById = new Map<string, string>(),
) {
  return groups.map((group) => ({
    type: group.type,
    title: group.title,
    description: group.description,
    items: group.items.map((item) => ({
      id: item.id,
      title: item.titulo,
      summary: item.resumen_largo || item.resumen,
      reason: reasonById.get(item.id),
    })),
  }));
}

function buildAssistantResponse(
  answer: string,
  matchedItems: AssistantRepositoryItem[],
  reviewedItems = matchedItems,
  candidateCount = reviewedItems.length,
  reasonById = new Map<string, string>(),
  groups: Array<{
    type: 'duplicate-pair';
    title: string;
    description?: string;
    items: AssistantRepositoryItem[];
  }> = [],
) {
  return {
    answer,
    matchedContentIds: matchedItems.map((item) => item.id),
    candidateCount,
    reviewedItems: buildAssistantReviewedItems(reviewedItems, reasonById),
    groups: buildAssistantGroups(groups, reasonById),
  };
}

function rankAssistantContents(contents: AssistantRepositoryItem[], question: string) {
  return contents
    .map((item) => ({
      item,
      score: scoreAssistantMatch(question, {
        title: item.titulo,
        summary: item.resumen_largo || item.resumen,
        translatedText: item.texto_traducido,
        tags: item.tags,
      }),
    }))
    .sort((left, right) => right.score - left.score);
}

function tokenizeSimilarityText(text: string) {
  return new Set(
    (normalizeAssistantQuestion(text).match(/[a-z0-9]+/g) || []).filter((token) => token.length >= 4),
  );
}

function overlapScore(left: string, right: string) {
  const leftTokens = tokenizeSimilarityText(left);
  const rightTokens = tokenizeSimilarityText(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  });

  return intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function contentSimilarity(left: AssistantRepositoryItem, right: AssistantRepositoryItem) {
  const titleScore = overlapScore(left.titulo, right.titulo);
  const summaryScore = overlapScore(
    `${left.resumen} ${left.resumen_largo} ${left.texto_traducido.slice(0, 400)}`,
    `${right.resumen} ${right.resumen_largo} ${right.texto_traducido.slice(0, 400)}`,
  );

  return titleScore * 0.65 + summaryScore * 0.35;
}

function weirdTextRatio(text: string) {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return 0;
  }

  const weirdTokens = tokens.filter((token) => {
    const stripped = token.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d]+$/g, '');

    if (!stripped) {
      return true;
    }

    if (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,2}$/.test(stripped)) {
      return true;
    }

    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{5,}\d+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*/.test(stripped) || /\d+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{4,}/.test(stripped)) {
      return true;
    }

    if (/(.)\1\1/.test(stripped)) {
      return true;
    }

    return false;
  });

  return weirdTokens.length / tokens.length;
}

function seemsPoorOcr(item: AssistantRepositoryItem) {
  const baseText = item.texto_original || item.texto_traducido || '';
  const weirdness = weirdTextRatio(baseText);
  const summaryShort = (item.resumen || '').trim().length < 50;
  const textTooShort = baseText.trim().length < 180;
  return weirdness > 0.16 || (textTooShort && summaryShort);
}

function isMissingSourceQuestion(question: string) {
  return includesAnyPhrase(question, ['sin fuente', 'sin fuentes', 'no tienen fuente', 'no tengan fuente', 'faltan fuentes']);
}

function isMissingSummaryQuestion(question: string) {
  return includesAnyPhrase(question, ['sin resumen', 'sin resúmen', 'sin resumenes', 'sin resúmenes', 'no tienen resumen', 'no tengan resumen']);
}

function isWeakTagsQuestion(question: string) {
  return includesAnyPhrase(question, ['tags debiles', 'tags débiles', 'etiquetas debiles', 'etiquetas débiles', 'sin tags', 'sin etiquetas', 'pocas etiquetas', 'pocos tags']);
}

function isDuplicateQuestion(question: string) {
  return includesAnyPhrase(question, ['duplicados', 'duplicado', 'muy parecidos', 'muy parecido', 'similares', 'similar', 'parecidos']);
}

function isPoorOcrQuestion(question: string) {
  return includesAnyPhrase(question, ['ocr', 'texto basura', 'textos basura', 'texto raro', 'mala extraccion', 'mala extracción', 'mal extraido', 'mal extraído']);
}

function isReprocessQuestion(question: string) {
  return includesAnyPhrase(question, ['reprocesar', 'reprocesado', 'conviene reprocesar', 'debo reprocesar']);
}

function isAudioQuestion(question: string) {
  return includesAnyPhrase(question, ['audio adjunto', 'audios adjuntos', 'nota de voz', 'notas de voz', 'audios']);
}

function isVideoQuestion(question: string) {
  return includesAnyPhrase(question, ['video adjunto', 'videos adjuntos', 'vídeo adjunto', 'vídeos adjuntos', 'videos']);
}

function isTranscriptionQuestion(question: string) {
  return includesAnyPhrase(question, ['transcripcion', 'transcripción', 'transcripciones']);
}

function isCoverageQuestion(question: string) {
  return includesAnyPhrase(question, ['temas mas cubiertos', 'temas más cubiertos', 'bloques mas cubiertos', 'bloques más cubiertos', 'temas cubiertos', 'bloques cubiertos']);
}

function isGrowthQuestion(question: string) {
  return includesAnyPhrase(question, ['bloques estan creciendo', 'bloques están creciendo', 'temas estan creciendo', 'temas están creciendo', 'estan creciendo', 'están creciendo']);
}

function isGapQuestion(question: string) {
  return includesAnyPhrase(question, ['huecos tematicos', 'huecos temáticos', 'huecos de temas', 'temas faltantes', 'poco cubiertos']);
}

function isTagCatalogQuestion(question: string) {
  return includesAnyPhrase(question, ['etiquetas sobran', 'tags sobran', 'etiquetas duplicadas', 'tags duplicados', 'etiquetas duplican', 'tags duplican']);
}

function formatArticleCount(count: number) {
  if (count === 1) {
    return '1 artículo';
  }

  return `${count} artículos`;
}

async function buildAttachmentMap(
  contents: AssistantRepositoryItem[],
  type: 'audio' | 'video',
) {
  const pairs = await Promise.all(
    contents.map(async (item) => {
      const notes =
        type === 'audio'
          ? await listContentAudioNotes(item.id).catch(() => [])
          : await listContentVideoNotes(item.id).catch(() => []);

      return [item.id, notes] as const;
    }),
  );

  return new Map(pairs);
}

async function replaceContentTags(contentId: string, selectedTags: Array<Pick<TagRecord, 'id' | 'nombre' | 'tipo'>>) {
  const { data: existingRelations, error: relationsError } = await supabaseAdmin
    .from('contenido_tags')
    .select('tag_id, tags(id, frecuencia)')
    .eq('contenido_id', contentId);

  if (relationsError) {
    throw new Error(`No fue posible consultar tags actuales del contenido: ${relationsError.message}`);
  }

  if ((existingRelations || []).length > 0) {
    const { error: deleteRelationsError } = await supabaseAdmin.from('contenido_tags').delete().eq('contenido_id', contentId);

    if (deleteRelationsError) {
      throw new Error(`No fue posible limpiar relaciones previas del contenido: ${deleteRelationsError.message}`);
    }

    for (const relation of existingRelations || []) {
      const tagId = relation.tag_id as string;
      const currentFrequency = Number((relation as any).tags?.frecuencia || 0);
      await supabaseAdmin
        .from('tags')
        .update({ frecuencia: Math.max(0, currentFrequency - 1) })
        .eq('id', tagId);
    }
  }

  const tagIds = await ensureTags(selectedTags);

  if (tagIds.length > 0) {
    const { error: insertRelationsError } = await supabaseAdmin.from('contenido_tags').insert(
      tagIds.map((tagId) => ({
        contenido_id: contentId,
        tag_id: tagId,
      })),
    );

    if (insertRelationsError) {
      throw new Error(`No fue posible guardar nuevas relaciones de tags: ${insertRelationsError.message}`);
    }
  }
}

async function rebuildGeneralDocFromDatabase() {
  const { data, error } = await supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      titulo,
      resumen,
      resumen_largo,
      texto_traducido,
      docx_url,
      fuente_url,
      notas,
      fecha,
      contenido_tags (
        tags (
          nombre
        )
      )
    `,
    )
    .order('fecha', { ascending: true });

  if (error) {
    throw new Error(`No fue posible reconstruir el Google Doc general: ${error.message}`);
  }

  return syncContentsToGeneralGoogleDoc(
    (data || []).map((item) => ({
      syncId: item.id,
      title: item.titulo,
      summary: item.resumen,
      longSummary: item.resumen_largo || item.resumen,
      translatedText: item.texto_traducido,
      docxUrl: item.docx_url,
      articleDate: new Date(item.fecha).toLocaleDateString('es-MX'),
      sourceUrl: item.fuente_url || '',
      notes: item.notas || '',
      tags: (item.contenido_tags || []).flatMap((relation: any) => (relation.tags?.nombre ? [relation.tags.nombre] : [])),
    })),
  );
}

function hydrateRelationTags(relations: any[], tagToBlock: Map<string, string>) {
  return (relations || []).flatMap((relation: any) =>
    relation.tags
      ? [
          {
            ...relation.tags,
            exists: true,
            source: 'existing',
            bloque: tagToBlock.get(relation.tags.nombre.toLowerCase()) ?? null,
          },
        ]
      : [],
  );
}

async function ensureContentExists(contentId: string) {
  const { data, error } = await supabaseAdmin.from('contenidos').select('id').eq('id', contentId).single();

  if (error || !data) {
    throw new Error(`No fue posible cargar el contenido solicitado: ${error?.message}`);
  }
}

export async function listContents(search = '', tags: string[] = []) {
  const { tagToBlock } = await getCatalogTagBlockLookup();
  let query = supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      imagen_url,
      imagenes_urls,
      fuente_url,
      notas,
      titulo,
      resumen,
      resumen_largo,
      texto_original,
      texto_traducido,
      fecha,
      docx_url,
      contenido_tags (
        tags (
          id,
          nombre,
          tipo,
          frecuencia
        )
      )
    `,
    )
    .order('fecha', { ascending: false });

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `titulo.ilike.${term},resumen.ilike.${term},resumen_largo.ilike.${term},texto_original.ilike.${term},texto_traducido.ilike.${term}`,
    );
  }

  if (tags.length > 0) {
    const { data: tagRows, error: tagsError } = await supabaseAdmin.from('tags').select('id, nombre').in('nombre', tags);

    if (tagsError) {
      throw new Error(`No fue posible resolver tags de filtro: ${tagsError.message}`);
    }

    const tagIds = (tagRows || []).map((tag) => tag.id);

    if (tagIds.length === 0) {
      return [];
    }

    const { data: relations, error: relationError } = await supabaseAdmin
      .from('contenido_tags')
      .select('contenido_id')
      .in('tag_id', tagIds);

    if (relationError) {
      throw new Error(`No fue posible filtrar contenidos por tags: ${relationError.message}`);
    }

    const contentIds = [...new Set((relations || []).map((relation) => relation.contenido_id))];

    if (contentIds.length === 0) {
      return [];
    }

    query = query.in('id', contentIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No fue posible consultar contenidos: ${error.message}`);
  }

  return (data || []).map((item) => ({
    id: item.id,
    imagen_url: item.imagen_url,
    imagenes_urls: item.imagenes_urls?.length ? item.imagenes_urls : item.imagen_url ? [item.imagen_url] : [],
    fuente_url: item.fuente_url || null,
    notas: item.notas || '',
    titulo: item.titulo,
    resumen: item.resumen,
    resumen_largo: item.resumen_largo || item.resumen,
    texto_original: item.texto_original,
    texto_traducido: item.texto_traducido,
    fecha: item.fecha,
    docx_url: item.docx_url,
    tags: hydrateRelationTags(item.contenido_tags || [], tagToBlock),
  }));
}

export async function getLibraryDocxUrl() {
  return getGeneralGoogleDocUrl();
}

export async function syncExistingContentsToLibraryDoc() {
  const result = await rebuildGeneralDocFromDatabase();

  return {
    url: getGeneralGoogleDocUrl(),
    count: result.appendedCount + result.skippedCount,
    appendedCount: result.appendedCount,
    skippedCount: result.skippedCount,
  };
}

export async function regenerateExistingDocuments() {
  const { data, error } = await supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      titulo,
      resumen,
      resumen_largo,
      texto_traducido,
      docx_url,
      fuente_url,
      notas,
      fecha,
      contenido_tags (
        tags (
          nombre
        )
      )
    `,
    )
    .order('fecha', { ascending: true });

  if (error) {
    throw new Error(`No fue posible cargar contenidos para regenerar documentos: ${error.message}`);
  }

  for (const item of data || []) {
    const docxBuffer = await generateDocxBuffer({
      title: item.titulo,
      summary: item.resumen_largo || item.resumen,
      translatedText: item.texto_traducido,
      tags: (item.contenido_tags || []).flatMap((relation: any) => (relation.tags?.nombre ? [relation.tags.nombre] : [])),
      date: new Date(item.fecha).toLocaleString('es-MX'),
      sourceUrl: item.fuente_url || '',
      notes: item.notas || '',
    });

    const finalDocxUrl = await uploadDocx(docxBuffer, item.titulo);
    const { error: updateError } = await supabaseAdmin.from('contenidos').update({ docx_url: finalDocxUrl }).eq('id', item.id);

    if (updateError) {
      throw new Error(`No fue posible actualizar el Word del contenido "${item.titulo}": ${updateError.message}`);
    }
  }

  await rebuildGeneralDocFromDatabase();

  return {
    url: getGeneralGoogleDocUrl(),
    count: data?.length ?? 0,
  };
}

export async function saveContent(input: SaveContentInput) {
  const docxBuffer = await generateDocxBuffer({
    title: input.title,
    summary: input.longSummary,
    translatedText: input.translatedText,
    tags: input.selectedTags.map((tag) => tag.nombre),
    date: new Date().toLocaleString('es-MX'),
    sourceUrl: input.sourceUrl,
    notes: input.notes,
  });

  const finalDocxUrl = await uploadDocx(docxBuffer, input.title);

  const { data: content, error: contentError } = await supabaseAdmin
    .from('contenidos')
    .insert({
      imagen_url: input.imageUrl,
      imagenes_urls: input.imageUrls,
      fuente_url: input.sourceUrl || null,
      notas: input.notes,
      texto_original: input.originalText,
      texto_traducido: input.translatedText,
      titulo: input.title,
      resumen: input.summary,
      resumen_largo: input.longSummary,
      docx_url: finalDocxUrl || input.docxUrl,
    })
    .select('id')
    .single();

  if (contentError || !content) {
    throw new Error(`No fue posible guardar el contenido: ${contentError?.message}`);
  }

  await replaceContentTags(content.id, input.selectedTags);
  await saveContentImageFingerprints(
    content.id,
    input.imageFingerprints?.length
      ? input.imageFingerprints
      : input.imageUrls.map((imageUrl) => ({ imageUrl })),
  );

  await appendContentToGeneralGoogleDoc(
    {
      ...input,
      docxUrl: finalDocxUrl || input.docxUrl,
      selectedTags: input.selectedTags,
    },
    {
      articleDate: new Date().toLocaleDateString('es-MX'),
      syncId: content.id,
    },
  );

  return {
    ...content,
    libraryDocxUrl: getGeneralGoogleDocUrl(),
  };
}

export async function enrichContent(contentId: string, supplementalText: string) {
  const normalizedSupplementalText = supplementalText.trim();

  if (!normalizedSupplementalText) {
    throw new Error('Debes ingresar texto complementario para actualizar el contenido.');
  }

  const { data: currentContent, error: contentError } = await supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      imagen_url,
      imagenes_urls,
      fuente_url,
      notas,
      texto_original,
      texto_traducido,
      titulo,
      resumen,
      resumen_largo,
      docx_url,
      fecha
    `,
    )
    .eq('id', contentId)
    .single();

  if (contentError || !currentContent) {
    throw new Error(`No fue posible cargar el contenido a editar: ${contentError?.message}`);
  }

  const combinedOriginalText = [currentContent.texto_original, normalizedSupplementalText]
    .filter(Boolean)
    .join('\n\n=== TEXTO COMPLEMENTARIO ===\n\n');
  const language = detectLanguage(combinedOriginalText);
  const tagCatalog = await getTagCatalog();
  const metadata = await generateKnowledgeMetadata(combinedOriginalText, language, tagCatalog);
  const selectedTags = metadata.tags.map((tag) => ({
    id: null,
    nombre: tag,
    tipo: 'ia' as const,
  }));

  const docxBuffer = await generateDocxBuffer({
    title: metadata.title,
    summary: metadata.longSummary,
    translatedText: metadata.translatedText,
    tags: metadata.tags,
    date: new Date(currentContent.fecha).toLocaleString('es-MX'),
    sourceUrl: currentContent.fuente_url || '',
    notes: currentContent.notas || '',
  });
  const finalDocxUrl = await uploadDocx(docxBuffer, metadata.title);

  const { data: updatedContent, error: updateError } = await supabaseAdmin
    .from('contenidos')
    .update({
      texto_original: combinedOriginalText,
      texto_traducido: metadata.translatedText,
      titulo: metadata.title,
      resumen: metadata.summary,
      resumen_largo: metadata.longSummary,
      docx_url: finalDocxUrl,
    })
    .eq('id', contentId)
    .select(
      `
      id,
      imagen_url,
      imagenes_urls,
      fuente_url,
      notas,
      titulo,
      resumen,
      resumen_largo,
      texto_original,
      texto_traducido,
      fecha,
      docx_url
    `,
    )
    .single();

  if (updateError || !updatedContent) {
    throw new Error(`No fue posible actualizar el contenido: ${updateError?.message}`);
  }

  await replaceContentTags(contentId, selectedTags);
  await rebuildGeneralDocFromDatabase();

  const { data: refreshedContent, error: refreshedError } = await supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      imagen_url,
      imagenes_urls,
      fuente_url,
      notas,
      titulo,
      resumen,
      resumen_largo,
      texto_original,
      texto_traducido,
      fecha,
      docx_url,
      contenido_tags (
        tags (
          id,
          nombre,
          tipo,
          frecuencia
        )
      )
    `,
    )
    .eq('id', contentId)
    .single();

  if (refreshedError || !refreshedContent) {
    throw new Error(`No fue posible recargar el contenido actualizado: ${refreshedError?.message}`);
  }

  const { tagToBlock } = await getCatalogTagBlockLookup();

  return {
    id: refreshedContent.id,
    imagen_url: refreshedContent.imagen_url,
    imagenes_urls: refreshedContent.imagenes_urls?.length ? refreshedContent.imagenes_urls : refreshedContent.imagen_url ? [refreshedContent.imagen_url] : [],
    fuente_url: refreshedContent.fuente_url || null,
    notas: refreshedContent.notas || '',
    titulo: refreshedContent.titulo,
    resumen: refreshedContent.resumen,
    resumen_largo: refreshedContent.resumen_largo || refreshedContent.resumen,
    texto_original: refreshedContent.texto_original,
    texto_traducido: refreshedContent.texto_traducido,
    fecha: refreshedContent.fecha,
    docx_url: refreshedContent.docx_url,
    tags: hydrateRelationTags(refreshedContent.contenido_tags || [], tagToBlock),
  };
}

export async function updateContentMetadata(contentId: string, input: { title: string; sourceUrl: string; notes: string }) {
  const { data: currentContent, error: contentError } = await supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      imagen_url,
      imagenes_urls,
      fuente_url,
      notas,
      texto_original,
      texto_traducido,
      titulo,
      resumen,
      resumen_largo,
      fecha,
      contenido_tags (
        tags (
          id,
          nombre,
          tipo,
          frecuencia
        )
      )
    `,
    )
    .eq('id', contentId)
    .single();

  if (contentError || !currentContent) {
    throw new Error(`No fue posible cargar el contenido a actualizar: ${contentError?.message}`);
  }

  const selectedTags = (currentContent.contenido_tags || []).flatMap((relation: any) =>
    relation.tags
      ? [
          {
            id: relation.tags.id,
            nombre: relation.tags.nombre,
            tipo: relation.tags.tipo,
          },
        ]
      : [],
  );

  const docxBuffer = await generateDocxBuffer({
    title: input.title.trim() || currentContent.titulo,
    summary: currentContent.resumen_largo || currentContent.resumen,
    translatedText: currentContent.texto_traducido,
    tags: selectedTags.map((tag) => tag.nombre),
    date: new Date(currentContent.fecha).toLocaleString('es-MX'),
    sourceUrl: input.sourceUrl.trim(),
    notes: input.notes.trim(),
  });
  const finalDocxUrl = await uploadDocx(docxBuffer, input.title.trim() || currentContent.titulo);

  const { error: updateError } = await supabaseAdmin
    .from('contenidos')
    .update({
      titulo: input.title.trim() || currentContent.titulo,
      fuente_url: input.sourceUrl.trim() || null,
      notas: input.notes.trim(),
      docx_url: finalDocxUrl,
    })
    .eq('id', contentId);

  if (updateError) {
    throw new Error(`No fue posible actualizar título, fuente o notas: ${updateError.message}`);
  }

  await rebuildGeneralDocFromDatabase();

  const refreshed = await listContents();
  const updatedItem = refreshed.find((item) => item.id === contentId);

  if (!updatedItem) {
    throw new Error('No fue posible recargar el contenido actualizado.');
  }

  return updatedItem;
}

export async function appendImagesToContent(contentId: string, imageUrls: string[], imageFingerprints: ImageFingerprintInput[] = []) {
  const normalizedUrls = imageUrls.map((url) => url.trim()).filter(Boolean);

  if (normalizedUrls.length === 0) {
    throw new Error('Debes enviar al menos una imagen para agregar al contenido.');
  }

  const { data: currentContent, error: contentError } = await supabaseAdmin
    .from('contenidos')
    .select('id, imagen_url, imagenes_urls')
    .eq('id', contentId)
    .single();

  if (contentError || !currentContent) {
    throw new Error(`No fue posible cargar el contenido para agregar imágenes: ${contentError?.message}`);
  }

  const mergedImages = [...new Set([...(currentContent.imagenes_urls || []), ...normalizedUrls])];
  const coverImage = currentContent.imagen_url || mergedImages[0] || '';

  const { error: updateError } = await supabaseAdmin
    .from('contenidos')
    .update({
      imagen_url: coverImage,
      imagenes_urls: mergedImages,
    })
    .eq('id', contentId);

  if (updateError) {
    throw new Error(`No fue posible guardar imágenes adicionales: ${updateError.message}`);
  }

  await saveContentImageFingerprints(
    contentId,
    imageFingerprints.length ? imageFingerprints : normalizedUrls.map((imageUrl) => ({ imageUrl })),
  );

  const refreshed = await listContents();
  const updatedItem = refreshed.find((item) => item.id === contentId);

  if (!updatedItem) {
    throw new Error('No fue posible recargar el contenido con las imágenes nuevas.');
  }

  return updatedItem;
}

export async function getContentAudioNotes(contentId: string) {
  await ensureContentExists(contentId);
  return listContentAudioNotes(contentId);
}

export async function getContentVideoNotes(contentId: string) {
  await ensureContentExists(contentId);
  return listContentVideoNotes(contentId);
}

export async function attachAudioToContent(contentId: string, file: Buffer, mimeType: string, originalName: string) {
  await ensureContentExists(contentId);
  return uploadContentAudioNote(contentId, file, mimeType, originalName);
}

export async function attachVideoToContent(contentId: string, file: Buffer, mimeType: string, originalName: string) {
  await ensureContentExists(contentId);
  return uploadContentVideoNote(contentId, file, mimeType, originalName);
}

export async function removeAudioFromContent(contentId: string, fileName: string) {
  await ensureContentExists(contentId);
  return deleteContentAudioNote(contentId, fileName);
}

export async function removeVideoFromContent(contentId: string, fileName: string) {
  await ensureContentExists(contentId);
  return deleteContentVideoNote(contentId, fileName);
}

export async function transcribeContentAudio(contentId: string, fileName: string) {
  await ensureContentExists(contentId);
  const notes = await listContentAudioNotes(contentId);
  const targetNote = notes.find((note) => note.fileName === fileName);

  if (!targetNote) {
    throw new Error('No se encontró el audio solicitado para transcribir.');
  }

  const fileBuffer = await downloadContentAudioNote(contentId, fileName);
  const transcription = await transcribeAudioBuffer(fileBuffer, targetNote.mimeType, targetNote.originalName);

  return updateAudioTranscription(contentId, fileName, transcription);
}

export async function deleteContent(contentId: string) {
  const { data: currentContent, error: contentError } = await supabaseAdmin
    .from('contenidos')
    .select(
      `
      id,
      titulo,
      contenido_tags (
        tag_id,
        tags (
          id,
          frecuencia
        )
      )
    `,
    )
    .eq('id', contentId)
    .single();

  if (contentError || !currentContent) {
    throw new Error(`No fue posible cargar el contenido a eliminar: ${contentError?.message}`);
  }

  for (const relation of currentContent.contenido_tags || []) {
    const tagId = relation.tag_id as string;
    const currentFrequency = Number((relation as any).tags?.frecuencia || 0);

    await supabaseAdmin
      .from('tags')
      .update({ frecuencia: Math.max(0, currentFrequency - 1) })
      .eq('id', tagId);
  }

  const { data: deletedRows, error: deleteError } = await supabaseAdmin
    .from('contenidos')
    .delete()
    .eq('id', contentId)
    .select('id');

  if (deleteError) {
    throw new Error(`No fue posible eliminar el contenido "${currentContent.titulo}": ${deleteError.message}`);
  }

  if (!deletedRows || deletedRows.length === 0) {
    throw new Error(`Supabase no confirmó la eliminación del contenido "${currentContent.titulo}".`);
  }

  const { data: remainingContent, error: verifyError } = await supabaseAdmin
    .from('contenidos')
    .select('id')
    .eq('id', contentId)
    .maybeSingle();

  if (verifyError) {
    throw new Error(`No fue posible verificar la eliminación del contenido "${currentContent.titulo}": ${verifyError.message}`);
  }

  if (remainingContent) {
    throw new Error(`El contenido "${currentContent.titulo}" sigue existiendo después del intento de borrado.`);
  }

  try {
    await removeAllContentAudioNotes(contentId);
  } catch (audioCleanupError) {
    console.warn(`No fue posible limpiar audios del contenido eliminado ${contentId}:`, audioCleanupError);
  }

  try {
    await removeAllContentVideoNotes(contentId);
  } catch (videoCleanupError) {
    console.warn(`No fue posible limpiar videos del contenido eliminado ${contentId}:`, videoCleanupError);
  }

  await rebuildGeneralDocFromDatabase();

  return {
    id: contentId,
    libraryDocxUrl: getGeneralGoogleDocUrl(),
  };
}

export async function queryRepositoryAssistant(question: string) {
  const trimmedQuestion = question.trim();

  if (!trimmedQuestion) {
    throw new Error('Debes escribir una pregunta para consultar el repositorio.');
  }

  const contents = (await listContents()) as AssistantRepositoryItem[];
  const normalizedQuestion = normalizeAssistantQuestion(trimmedQuestion);
  const rankedContents = rankAssistantContents(contents, trimmedQuestion);
  const positiveMatches = rankedContents.filter((entry) => entry.score > 0).map((entry) => entry.item);

  if (isRepositoryCountQuestion(trimmedQuestion)) {
    const topicTokens = extractMeaningfulAssistantTokens(trimmedQuestion);

    if (topicTokens.length > 0) {
      if (positiveMatches.length === 0) {
        return {
          answer: `No encontré artículos cargados sobre "${topicTokens.join(' ')}" dentro del repositorio actual.`,
          matchedContentIds: [],
          candidateCount: contents.length,
          reviewedItems: [],
        };
      }

      const reason = `Coincide con el tema consultado: ${topicTokens.join(', ')}.`;
      const reasonById = new Map(positiveMatches.map((item) => [item.id, reason]));

      return buildAssistantResponse(
        `Actualmente hay ${formatArticleCount(positiveMatches.length)} relacionados con "${topicTokens.join(' ')}" en el repositorio.`,
        positiveMatches,
        positiveMatches,
        contents.length,
        reasonById,
      );
    }

    return {
      answer: buildRepositoryCountAnswer(contents.length),
      matchedContentIds: [],
      candidateCount: contents.length,
      reviewedItems: [],
    };
  }

  if (isMissingSourceQuestion(normalizedQuestion)) {
    const itemsWithoutSource = contents.filter((item) => !item.fuente_url);
    const reasonById = new Map(itemsWithoutSource.map((item) => [item.id, 'No tiene fuente o URL de origen registrada.']));

    return buildAssistantResponse(
      itemsWithoutSource.length
        ? `Encontré ${formatArticleCount(itemsWithoutSource.length)} sin fuente registrada.`
        : 'No encontré artículos sin fuente registrada.',
      itemsWithoutSource,
      itemsWithoutSource,
      contents.length,
      reasonById,
    );
  }

  if (isMissingSummaryQuestion(normalizedQuestion)) {
    const itemsWithoutSummary = contents.filter((item) => !item.resumen.trim() || item.resumen.trim().length < 50);
    const reasonById = new Map(itemsWithoutSummary.map((item) => [item.id, 'Tiene un resumen vacío o demasiado corto.']));

    return buildAssistantResponse(
      itemsWithoutSummary.length
        ? `Encontré ${formatArticleCount(itemsWithoutSummary.length)} con resumen faltante o demasiado corto.`
        : 'No detecté artículos con resumen faltante o demasiado corto.',
      itemsWithoutSummary,
      itemsWithoutSummary,
      contents.length,
      reasonById,
    );
  }

  if (isWeakTagsQuestion(normalizedQuestion)) {
    const weakTagItems = contents.filter((item) => item.tags.length < 2);
    const reasonById = new Map(weakTagItems.map((item) => [item.id, 'Tiene pocas etiquetas para clasificarlo con fuerza.']));

    return buildAssistantResponse(
      weakTagItems.length
        ? `Encontré ${formatArticleCount(weakTagItems.length)} con etiquetas débiles o insuficientes.`
        : 'No detecté artículos con etiquetas débiles o insuficientes.',
      weakTagItems,
      weakTagItems,
      contents.length,
      reasonById,
    );
  }

  if (isDuplicateQuestion(normalizedQuestion)) {
    const duplicatePairs: Array<{ score: number; left: AssistantRepositoryItem; right: AssistantRepositoryItem }> = [];
    const limit = Math.min(contents.length, 120);

    for (let leftIndex = 0; leftIndex < limit; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < limit; rightIndex += 1) {
        const left = contents[leftIndex];
        const right = contents[rightIndex];
        const similarity = contentSimilarity(left, right);

        if (similarity >= 0.58) {
          duplicatePairs.push({ score: similarity, left, right });
        }
      }
    }

    duplicatePairs.sort((left, right) => right.score - left.score);
    const topPairs = duplicatePairs.slice(0, 5);
    const uniqueItems = Array.from(new Map(topPairs.flatMap((pair) => [pair.left, pair.right]).map((item) => [item.id, item])).values());
    const reasonById = new Map<string, string>();

    topPairs.forEach((pair) => {
      reasonById.set(pair.left.id, `Muy parecido a "${pair.right.titulo}".`);
      reasonById.set(pair.right.id, `Muy parecido a "${pair.left.titulo}".`);
    });

    const duplicateGroups = topPairs.map((pair, index) => ({
      type: 'duplicate-pair' as const,
      title: `Posible duplicado ${index + 1}`,
      description: `Similitud estimada: ${Math.round(pair.score * 100)}%.`,
      items: [pair.left, pair.right],
    }));

    return buildAssistantResponse(
      topPairs.length
        ? `Detecté ${topPairs.length} pareja(s) de artículos potencialmente duplicados o muy parecidos.`
        : 'No detecté duplicados claros ni artículos demasiado parecidos con las reglas actuales.',
      uniqueItems,
      uniqueItems,
      contents.length,
      reasonById,
      duplicateGroups,
    );
  }

  if (isPoorOcrQuestion(normalizedQuestion)) {
    const poorOcrItems = contents.filter(seemsPoorOcr);
    const reasonById = new Map(poorOcrItems.map((item) => [item.id, 'Muestra señales de OCR débil o texto poco confiable.']));

    return buildAssistantResponse(
      poorOcrItems.length
        ? `Detecté ${formatArticleCount(poorOcrItems.length)} con señales de OCR débil o texto problemático.`
        : 'No detecté artículos claramente problemáticos por OCR con las reglas actuales.',
      poorOcrItems,
      poorOcrItems,
      contents.length,
      reasonById,
    );
  }

  if (isReprocessQuestion(normalizedQuestion)) {
    const reprocessCandidates = contents.filter(
      (item) =>
        seemsPoorOcr(item) ||
        !item.resumen.trim() ||
        item.resumen.trim().length < 50 ||
        item.tags.length < 2,
    );
    const reasonById = new Map<string, string>();

    reprocessCandidates.forEach((item) => {
      const reasons: string[] = [];

      if (seemsPoorOcr(item)) {
        reasons.push('OCR débil');
      }

      if (!item.resumen.trim() || item.resumen.trim().length < 50) {
        reasons.push('resumen corto o faltante');
      }

      if (item.tags.length < 2) {
        reasons.push('etiquetas insuficientes');
      }

      reasonById.set(item.id, `Conviene revisarlo por ${reasons.join(', ')}.`);
    });

    return buildAssistantResponse(
      reprocessCandidates.length
        ? `Sugiero considerar ${formatArticleCount(reprocessCandidates.length)} para revisión o reprocesado.`
        : 'No detecté candidatos claros para reprocesado con las reglas actuales.',
      reprocessCandidates,
      reprocessCandidates,
      contents.length,
      reasonById,
    );
  }

  if (isTranscriptionQuestion(normalizedQuestion)) {
    const audioMap = await buildAttachmentMap(contents, 'audio');
    const queryTokens = extractMeaningfulAssistantTokens(trimmedQuestion);
    const matchedItems = contents.filter((item) => {
      const notes = audioMap.get(item.id) || [];
      const transcriptionText = notes
        .map((note) => note.transcription || '')
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!transcriptionText) {
        return false;
      }

      if (queryTokens.length === 0) {
        return true;
      }

      return queryTokens.some((token) => transcriptionText.includes(token));
    });
    const reasonById = new Map(matchedItems.map((item) => [item.id, 'Coincide dentro de una transcripción de audio adjunta.']));

    return buildAssistantResponse(
      matchedItems.length
        ? `Encontré ${formatArticleCount(matchedItems.length)} cuya transcripción de audio coincide con tu consulta.`
        : 'No encontré coincidencias dentro de las transcripciones de audio disponibles.',
      matchedItems,
      matchedItems,
      contents.length,
      reasonById,
    );
  }

  if (isAudioQuestion(normalizedQuestion)) {
    const audioMap = await buildAttachmentMap(contents, 'audio');
    const matchedItems = contents.filter((item) => (audioMap.get(item.id) || []).length > 0);
    const reasonById = new Map(
      matchedItems.map((item) => [item.id, `${(audioMap.get(item.id) || []).length} audio(s) adjunto(s).`]),
    );

    return buildAssistantResponse(
      matchedItems.length
        ? `Encontré ${formatArticleCount(matchedItems.length)} con audio adjunto.`
        : 'No encontré artículos con audio adjunto.',
      matchedItems,
      matchedItems,
      contents.length,
      reasonById,
    );
  }

  if (isVideoQuestion(normalizedQuestion)) {
    const videoMap = await buildAttachmentMap(contents, 'video');
    const matchedItems = contents.filter((item) => (videoMap.get(item.id) || []).length > 0);
    const reasonById = new Map(
      matchedItems.map((item) => [item.id, `${(videoMap.get(item.id) || []).length} video(s) adjunto(s).`]),
    );

    return buildAssistantResponse(
      matchedItems.length
        ? `Encontré ${formatArticleCount(matchedItems.length)} con video adjunto.`
        : 'No encontré artículos con video adjunto.',
      matchedItems,
      matchedItems,
      contents.length,
      reasonById,
    );
  }

  if (isCoverageQuestion(normalizedQuestion)) {
    const catalog = await getTagCatalog();
    const counts = new Map<string, number>();

    catalog.forEach((block) => counts.set(block.nombre, 0));
    contents.forEach((item) => {
      const uniqueBlocks = new Set(item.tags.map((tag) => tag.bloque).filter(Boolean));
      uniqueBlocks.forEach((block) => counts.set(block as string, (counts.get(block as string) || 0) + 1));
    });

    const topBlocks = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .filter(([, count]) => count > 0);

    const answer = topBlocks.length
      ? `Los bloques más cubiertos actualmente son: ${topBlocks.map(([name, count]) => `${name} (${count})`).join(', ')}.`
      : 'Todavía no hay suficientes datos para identificar bloques bien cubiertos.';

    return buildAssistantResponse(answer, [], [], contents.length);
  }

  if (isGrowthQuestion(normalizedQuestion)) {
    const catalog = await getTagCatalog();
    const now = Date.now();
    const recentStart = now - 30 * 24 * 60 * 60 * 1000;
    const previousStart = now - 60 * 24 * 60 * 60 * 1000;
    const deltas = new Map<string, { recent: number; previous: number }>();

    catalog.forEach((block) => deltas.set(block.nombre, { recent: 0, previous: 0 }));

    contents.forEach((item) => {
      const time = new Date(item.fecha).getTime();
      const uniqueBlocks = new Set(item.tags.map((tag) => tag.bloque).filter(Boolean));

      uniqueBlocks.forEach((block) => {
        const current = deltas.get(block as string);

        if (!current) {
          return;
        }

        if (time >= recentStart) {
          current.recent += 1;
        } else if (time >= previousStart && time < recentStart) {
          current.previous += 1;
        }
      });
    });

    const rankedGrowth = Array.from(deltas.entries())
      .map(([name, value]) => ({ name, delta: value.recent - value.previous, recent: value.recent, previous: value.previous }))
      .sort((left, right) => right.delta - left.delta)
      .slice(0, 5)
      .filter((entry) => entry.recent > 0 || entry.previous > 0);

    const answer = rankedGrowth.length
      ? `Tomando los últimos 30 días contra los 30 anteriores, los bloques con mayor empuje reciente son: ${rankedGrowth
          .map((entry) => `${entry.name} (${entry.recent} vs ${entry.previous})`)
          .join(', ')}.`
      : 'No hay suficiente histórico reciente para estimar qué bloques están creciendo.';

    return buildAssistantResponse(answer, [], [], contents.length);
  }

  if (isGapQuestion(normalizedQuestion)) {
    const catalog = await getTagCatalog();
    const counts = new Map<string, number>();

    catalog.forEach((block) => counts.set(block.nombre, 0));
    contents.forEach((item) => {
      const uniqueBlocks = new Set(item.tags.map((tag) => tag.bloque).filter(Boolean));
      uniqueBlocks.forEach((block) => counts.set(block as string, (counts.get(block as string) || 0) + 1));
    });

    const gaps = Array.from(counts.entries())
      .filter(([, count]) => count <= 1)
      .sort((left, right) => left[1] - right[1]);

    const answer = gaps.length
      ? `Los huecos temáticos más claros hoy están en: ${gaps.slice(0, 6).map(([name, count]) => `${name} (${count})`).join(', ')}.`
      : 'No detecté huecos temáticos obvios: todos los bloques tienen al menos algo de cobertura.';

    return buildAssistantResponse(answer, [], [], contents.length);
  }

  if (isTagCatalogQuestion(normalizedQuestion)) {
    const catalog = await getTagCatalog();
    const usageCount = new Map<string, number>();
    const normalizedTagOwners = new Map<string, string[]>();

    catalog.forEach((block) => {
      block.tags.forEach((tag) => {
        usageCount.set(tag, 0);
        const normalizedTag = normalizeAssistantQuestion(tag);
        normalizedTagOwners.set(normalizedTag, [...(normalizedTagOwners.get(normalizedTag) || []), block.nombre]);
      });
    });

    contents.forEach((item) => {
      item.tags.forEach((tag) => {
        usageCount.set(tag.nombre, (usageCount.get(tag.nombre) || 0) + 1);
      });
    });

    const duplicateTags = Array.from(normalizedTagOwners.entries())
      .filter(([, owners]) => owners.length > 1)
      .map(([tag, owners]) => `${tag} en ${owners.join(' / ')}`);
    const unusedTags = Array.from(usageCount.entries())
      .filter(([, count]) => count === 0)
      .map(([tag]) => tag);

    const fragments: string[] = [];

    if (duplicateTags.length > 0) {
      fragments.push(`etiquetas potencialmente duplicadas: ${duplicateTags.slice(0, 5).join(', ')}`);
    }

    if (unusedTags.length > 0) {
      fragments.push(`etiquetas hoy sin uso: ${unusedTags.slice(0, 8).join(', ')}`);
    }

    const answer = fragments.length
      ? `Detecté ${fragments.join('. ')}.`
      : 'No detecté etiquetas duplicadas ni etiquetas claramente sobrantes con las reglas actuales.';

    return buildAssistantResponse(answer, [], [], contents.length);
  }

  const rankedCandidates = rankedContents
    .filter((entry, index) => entry.score > 0 || index < 8)
    .slice(0, 8)
    .map(({ item }) => ({
      id: item.id,
      title: item.titulo,
      summary: item.resumen_largo || item.resumen,
      tags: item.tags.map((tag) => tag.nombre),
      publishedAt: new Date(item.fecha).toLocaleDateString('es-MX'),
      textSnippet: item.texto_traducido.slice(0, 1200),
    }));

  return answerRepositoryQuestion(trimmedQuestion, rankedCandidates);
}
