import { createHash } from 'node:crypto';
import { extractTextFromImage } from './ocrService';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export interface ImageFingerprintInput {
  imageUrl: string;
  originalName?: string;
  sha256?: string;
  perceptualHash?: string | null;
  ocrText?: string;
}

export interface ImageSearchMatch {
  id: string;
  title: string;
  summary: string;
  reason: string;
  score: number;
}

export function hashImageBuffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isMissingImageIndexTableError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() || '';
  return error?.code === '42P01' || message.includes('contenido_imagenes') || message.includes('could not find the table');
}

function normalizeImageSearchText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeImageSearchText(text: string) {
  const stopwords = new Set([
    'para',
    'por',
    'con',
    'que',
    'una',
    'uno',
    'los',
    'las',
    'del',
    'de',
    'el',
    'la',
    'and',
    'the',
    'from',
    'this',
    'that',
  ]);

  return Array.from(
    new Set(
      normalizeImageSearchText(text)
        .split(' ')
        .filter((token) => token.length >= 4 && !stopwords.has(token)),
    ),
  );
}

function textOverlapScore(needle: string, haystack: string) {
  const tokens = tokenizeImageSearchText(needle);

  if (tokens.length === 0) {
    return 0;
  }

  const normalizedHaystack = normalizeImageSearchText(haystack);
  const matches = tokens.filter((token) => normalizedHaystack.includes(token));
  return matches.length / tokens.length;
}

export async function saveContentImageFingerprints(contentId: string, fingerprints: ImageFingerprintInput[]) {
  const rows = fingerprints
    .map((fingerprint) => ({
      contenido_id: contentId,
      image_url: fingerprint.imageUrl?.trim(),
      original_name: fingerprint.originalName?.trim() || '',
      sha256: fingerprint.sha256?.trim() || null,
      perceptual_hash: fingerprint.perceptualHash?.trim() || null,
      ocr_text: fingerprint.ocrText?.trim() || '',
    }))
    .filter((row) => row.image_url);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from('contenido_imagenes').upsert(rows, {
    onConflict: 'contenido_id,image_url',
  });

  if (error) {
    if (isMissingImageIndexTableError(error)) {
      console.warn('La tabla contenido_imagenes todavía no existe; se omitió el indexado de imágenes.');
      return;
    }

    throw new Error(`No fue posible indexar las imágenes del contenido: ${error.message}`);
  }
}

export async function searchRepositoryByImageBuffer(buffer: Buffer, mimeType: string) {
  const sha256 = hashImageBuffer(buffer);
  const uploadedOcrText = await extractTextFromImage(buffer, mimeType).catch(() => '');
  const matches = new Map<string, ImageSearchMatch>();

  const { data: exactRows, error: exactError } = await supabaseAdmin
    .from('contenido_imagenes')
    .select(
      `
      contenido_id,
      image_url,
      ocr_text,
      contenidos (
        id,
        titulo,
        resumen,
        resumen_largo
      )
    `,
    )
    .eq('sha256', sha256)
    .limit(8);

  if (exactError) {
    if (!isMissingImageIndexTableError(exactError)) {
      throw new Error(`No fue posible buscar coincidencias exactas de imagen: ${exactError.message}`);
    }

    console.warn('La tabla contenido_imagenes todavía no existe; la búsqueda exacta por hash se omitió.');
  }

  (exactRows || []).forEach((row: any) => {
    const content = row.contenidos;
    if (!content?.id) {
      return;
    }

    matches.set(content.id, {
      id: content.id,
      title: content.titulo,
      summary: content.resumen_largo || content.resumen,
      reason: 'Coincidencia exacta: la imagen tiene la misma huella SHA-256 que una imagen guardada.',
      score: 1,
    });
  });

  if (uploadedOcrText.trim()) {
    const { data: contents, error: contentsError } = await supabaseAdmin
      .from('contenidos')
      .select('id, titulo, resumen, resumen_largo, texto_original, texto_traducido')
      .limit(250);

    if (contentsError) {
      throw new Error(`No fue posible comparar el texto extraído de la imagen: ${contentsError.message}`);
    }

    (contents || [])
      .map((content) => {
        const score = textOverlapScore(
          uploadedOcrText,
          `${content.titulo} ${content.resumen} ${content.resumen_largo} ${content.texto_original} ${content.texto_traducido}`,
        );
        return { content, score };
      })
      .filter(({ score }) => score >= 0.28)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .forEach(({ content, score }) => {
        const current = matches.get(content.id);
        const reason = `Coincidencia por OCR: el texto visible de la imagen comparte ${Math.round(score * 100)}% de sus términos clave con este contenido.`;

        if (!current || score > current.score) {
          matches.set(content.id, {
            id: content.id,
            title: content.titulo,
            summary: content.resumen_largo || content.resumen,
            reason,
            score,
          });
        }
      });
  }

  return {
    sha256,
    extractedText: uploadedOcrText,
    matches: Array.from(matches.values()).sort((left, right) => right.score - left.score).slice(0, 8),
  };
}
