import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getCatalogTagBlockLookup } from './tagCatalogService';

export interface TagRecord {
  id: string | null;
  nombre: string;
  tipo: 'manual' | 'ia';
  frecuencia: number;
  exists: boolean;
  source: 'existing' | 'ai-suggested' | 'manual-created';
  bloque: string | null;
}

function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export async function getAllTags(): Promise<TagRecord[]> {
  const { tagToBlock } = await getCatalogTagBlockLookup();
  const { data, error } = await supabaseAdmin.from('tags').select('id, nombre, tipo, frecuencia').order('nombre');

  if (error) {
    throw new Error(`No fue posible cargar tags: ${error.message}`);
  }

  return (data || []).map((tag) => ({
    ...tag,
    exists: true,
    source: 'existing',
    bloque: tagToBlock.get(tag.nombre.toLowerCase()) ?? null,
  })) as TagRecord[];
}

export async function buildHybridTags(suggestedTags: string[]) {
  const existingTags = await getAllTags();
  const existingMap = new Map(existingTags.map((tag) => [tag.nombre.toLowerCase(), tag]));
  const { tagToBlock } = await getCatalogTagBlockLookup();

  const hybridTags = suggestedTags.map((suggestedTag) => {
    const normalizedName = normalizeTagName(suggestedTag);
    const existing = existingMap.get(normalizedName.toLowerCase());

    if (existing) {
      return {
        ...existing,
        source: 'ai-suggested' as const,
      };
    }

    return {
      id: null,
      nombre: normalizedName,
      tipo: 'ia' as const,
      frecuencia: 0,
      exists: false,
      source: 'ai-suggested' as const,
      bloque: tagToBlock.get(normalizedName.toLowerCase()) ?? null,
    };
  });

  return {
    suggestedTags: hybridTags,
    existingTags,
  };
}

export async function ensureTags(selectedTags: Array<Pick<TagRecord, 'id' | 'nombre' | 'tipo'>>) {
  const tagIds: string[] = [];

  for (const tag of selectedTags) {
    const normalizedName = normalizeTagName(tag.nombre);

    const { data: existing } = await supabaseAdmin
      .from('tags')
      .select('id, frecuencia')
      .ilike('nombre', normalizedName)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('tags')
        .update({ frecuencia: existing.frecuencia + 1 })
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`No fue posible actualizar la frecuencia del tag "${normalizedName}".`);
      }

      tagIds.push(existing.id);
      continue;
    }

    const { data: createdTag, error: createError } = await supabaseAdmin
      .from('tags')
      .insert({
        nombre: normalizedName,
        tipo: tag.tipo,
        frecuencia: 1,
      })
      .select('id')
      .single();

    if (createError || !createdTag) {
      throw new Error(`No fue posible crear el tag "${normalizedName}".`);
    }

    tagIds.push(createdTag.id);
  }

  return tagIds;
}

export async function deleteTag(tagId: string) {
  const { data: tag, error: tagLookupError } = await supabaseAdmin
    .from('tags')
    .select('id, nombre')
    .eq('id', tagId)
    .maybeSingle();

  if (tagLookupError) {
    throw new Error(`No fue posible consultar el tag: ${tagLookupError.message}`);
  }

  if (!tag) {
    throw new Error('El tag ya no existe o no fue encontrado.');
  }

  const { error: relationError } = await supabaseAdmin.from('contenido_tags').delete().eq('tag_id', tagId);

  if (relationError) {
    throw new Error(`No fue posible quitar el tag de los contenidos: ${relationError.message}`);
  }

  const { error: deleteError } = await supabaseAdmin.from('tags').delete().eq('id', tagId);

  if (deleteError) {
    throw new Error(`No fue posible eliminar el tag "${tag.nombre}": ${deleteError.message}`);
  }

  return {
    id: tag.id,
    nombre: tag.nombre,
  };
}
