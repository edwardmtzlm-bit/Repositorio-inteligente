import { GoogleGenAI, Type } from '@google/genai';
import { detectLanguage } from './languageService';
import type { TagCatalogBlock } from './tagCatalogService';

const model = 'gemini-2.5-flash';

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY es obligatorio para el procesamiento con IA.');
  }

  return new GoogleGenAI({ apiKey });
}

export interface AIProcessingResult {
  translatedText: string;
  title: string;
  summary: string;
  longSummary: string;
  tags: string[];
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tokenize(text: string) {
  return text.toLowerCase().match(/[a-záéíóúñü]+/gi) ?? [];
}

function uniqueWordOverlap(left: string, right: string) {
  const leftWords = new Set(tokenize(left).filter((word) => word.length >= 4));
  const rightWords = new Set(tokenize(right).filter((word) => word.length >= 4));

  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let matches = 0;
  leftWords.forEach((word) => {
    if (rightWords.has(word)) {
      matches += 1;
    }
  });

  return matches / Math.max(1, Math.min(leftWords.size, rightWords.size));
}

function weirdTokenRatio(text: string) {
  const tokens = text.split(/\s+/).map((token) => token.trim()).filter(Boolean);

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

    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{6,}\d+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*/.test(stripped) || /\d+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{4,}/.test(stripped)) {
      return true;
    }

    if (/(.)\1\1/.test(stripped)) {
      return true;
    }

    return false;
  });

  return weirdTokens.length / tokens.length;
}

function shouldKeepOriginalSpanish(sourceText: string, candidateTranslatedText: string, detectedLanguage: 'es' | 'en') {
  const sourceLanguage = detectLanguage(sourceText);
  const candidateLanguage = detectLanguage(candidateTranslatedText);
  const overlap = uniqueWordOverlap(sourceText, candidateTranslatedText);
  const sourceWeirdness = weirdTokenRatio(sourceText);
  const candidateWeirdness = weirdTokenRatio(candidateTranslatedText);

  if (detectedLanguage === 'es' || sourceLanguage === 'es') {
    return true;
  }

  if (candidateLanguage === 'es' && overlap >= 0.72 && candidateWeirdness > sourceWeirdness + 0.04) {
    return true;
  }

  return false;
}

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function expandLongSummary(title: string, translatedText: string, existingSummary: string) {
  const genAI = getGenAI();
  const expansionPrompt = `
Eres un redactor editorial en español.

Necesito que conviertas este contenido en un resumen largo de aproximadamente una cuartilla.

Título:
${title}

Resumen corto actual:
${existingSummary}

Texto base en español:
"""
${translatedText}
"""

Instrucciones obligatorias:
1. Escribe entre 350 y 500 palabras.
2. Redacta en español natural, claro y profesional.
3. Organiza el contenido en varios párrafos.
4. No devuelvas viñetas salvo que el contenido claramente requiera una lista.
5. No inventes datos fuera del texto base.
6. No devuelvas introducciones meta ni explicaciones sobre la tarea.

Devuelve solo el resumen largo.
`;

  const result = await genAI.models.generateContent({
    model,
    contents: expansionPrompt,
  });

  const response = result.text?.trim();

  if (!response) {
    throw new Error('La IA no devolvió un resumen largo ampliado.');
  }

  return response;
}

function buildCatalogPrompt(blocks: TagCatalogBlock[]) {
  return blocks
    .map(
      (block) =>
        `- ${block.nombre}: ${block.tags.join(', ')}`,
    )
    .join('\n');
}

export async function generateKnowledgeMetadata(
  text: string,
  language: 'es' | 'en',
  tagCatalog: TagCatalogBlock[],
): Promise<AIProcessingResult> {
  const genAI = getGenAI();
  const normalizedSourceText = normalizeOcrText(text);
  const tagCatalogPrompt = buildCatalogPrompt(tagCatalog);
  const prompt = `
Eres un sistema que transforma texto OCR en conocimiento útil para una biblioteca personal.

Texto OCR:
"""
${normalizedSourceText}
"""

Idioma detectado: ${language === 'en' ? 'inglés' : 'español'}

Tareas:
1. Si está en inglés, tradúcelo al español de forma fiel.
2. Si ya está en español, conserva el contenido en español sin traducirlo a otro idioma.
3. Genera un título corto en español.
4. Genera un resumen en español de máximo 4 líneas.
5. Genera un resumen largo en español de aproximadamente una cuartilla útil para redactar un artículo.
   Requisitos obligatorios del resumen largo:
   - entre 350 y 500 palabras
   - varios párrafos completos
   - redacción profesional y clara
   - suficiente desarrollo para llenar aproximadamente una página de Word
   - no lo hagas breve
6. Sugiere entre 2 y 6 tags usando exclusivamente la siguiente taxonomía autorizada.
7. No inventes tags nuevas. Si un tema no encaja perfecto, elige la etiqueta autorizada más cercana.
8. Puedes combinar tags de uno o varios bloques si el documento realmente lo requiere.

Taxonomía autorizada:
${tagCatalogPrompt}

Responde solo JSON.
`;

  const result = await genAI.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translatedText: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          longSummary: { type: Type.STRING },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['translatedText', 'title', 'summary', 'longSummary', 'tags'],
      },
    },
  });

  const response = result.text;

  if (!response) {
    throw new Error('La IA no devolvió contenido procesado.');
  }

  const parsed = JSON.parse(response) as AIProcessingResult;
  const candidateTranslatedText = normalizeOcrText(parsed.translatedText || '');
  const translatedText = shouldKeepOriginalSpanish(normalizedSourceText, candidateTranslatedText, language)
    ? normalizedSourceText
    : candidateTranslatedText || normalizedSourceText;
  const title = parsed.title.trim();
  const summary = parsed.summary.trim();
  let longSummary = parsed.longSummary.trim();

  if (countWords(longSummary) < 320) {
    longSummary = await expandLongSummary(title, translatedText, summary);
  }

  return {
    translatedText,
    title,
    summary,
    longSummary: longSummary.trim(),
    tags: parsed.tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, list) => list.findIndex((current) => current.toLowerCase() === tag.toLowerCase()) === index)
      .filter((tag) =>
        tagCatalog.some((block) => block.tags.some((allowedTag) => allowedTag.toLowerCase() === tag.toLowerCase())),
      ),
  };
}
