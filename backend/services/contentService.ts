import { generateDocxBuffer } from './docxService';
import { appendContentToGeneralGoogleDoc, getGeneralGoogleDocUrl, syncContentsToGeneralGoogleDoc } from './googleDocsService';
import { answerRepositoryQuestion, generateKnowledgeMetadata } from './aiService';
import { detectLanguage } from './languageService';
import { getCatalogTagBlockLookup, getTagCatalog } from './tagCatalogService';
import { uploadDocx } from './storageService';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ensureTags, type TagRecord } from './tagService';

export interface SaveContentInput {
  imageUrl: string;
  imageUrls: string[];
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

export async function appendImagesToContent(contentId: string, imageUrls: string[]) {
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

  const refreshed = await listContents();
  const updatedItem = refreshed.find((item) => item.id === contentId);

  if (!updatedItem) {
    throw new Error('No fue posible recargar el contenido con las imágenes nuevas.');
  }

  return updatedItem;
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

  const contents = await listContents();
  const rankedCandidates = contents
    .map((item) => ({
      id: item.id,
      title: item.titulo,
      summary: item.resumen_largo || item.resumen,
      tags: item.tags,
      translatedText: item.texto_traducido,
      publishedAt: new Date(item.fecha).toLocaleDateString('es-MX'),
      score: scoreAssistantMatch(trimmedQuestion, {
        title: item.titulo,
        summary: item.resumen_largo || item.resumen,
        translatedText: item.texto_traducido,
        tags: item.tags,
      }),
    }))
    .sort((left, right) => right.score - left.score)
    .filter((item, index) => item.score > 0 || index < 8)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      tags: item.tags.map((tag) => tag.nombre),
      publishedAt: item.publishedAt,
      textSnippet: item.translatedText.slice(0, 1200),
    }));

  return answerRepositoryQuestion(trimmedQuestion, rankedCandidates);
}
