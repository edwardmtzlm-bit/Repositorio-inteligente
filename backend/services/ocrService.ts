import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI, createPartFromBase64, createPartFromText } from '@google/genai';
import Tesseract from 'tesseract.js';

type OcrBlock = Tesseract.Block;
type OcrLine = Tesseract.Line;

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;
const visionModel = 'gemini-2.5-flash';

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanLine(line: string) {
  return line
    .replace(/[|¦]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([A-Za-zÁÉÍÓÚÑáéíóúñ])\s+([.,;:!?])/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function tokenize(text: string) {
  return text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9']+/g) ?? [];
}

function weirdTokenRatio(text: string) {
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return 1;
  }

  const weird = tokens.filter((token) => {
    if (/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,2}$/.test(token)) {
      return true;
    }

    if (/(.)\1\1/.test(token)) {
      return true;
    }

    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{6,}\d+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*/.test(token) || /\d+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{4,}/.test(token)) {
      return true;
    }

    return false;
  });

  return weird.length / tokens.length;
}

function lineHasEnoughText(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length < 2) {
    return false;
  }

  const letters = (trimmed.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const digits = (trimmed.match(/\d/g) || []).length;
  const symbols = (trimmed.match(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d\s]/g) || []).length;

  if (letters + digits === 0) {
    return false;
  }

  if (letters <= 2 && symbols >= letters + digits) {
    return false;
  }

  return true;
}

function scoreLineForReadingOrder(line: OcrLine) {
  const text = cleanLine(line.text || '');
  const letters = (text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const symbols = (text.match(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\d\s]/g) || []).length;

  return letters - symbols * 0.5;
}

function extractBlockText(block: OcrBlock) {
  const paragraphs = block.paragraphs ?? [];
  const paragraphTexts = paragraphs
    .map((paragraph) =>
      (paragraph.lines ?? [])
        .map((line) => cleanLine(line.text || ''))
        .filter((line) => lineHasEnoughText(line))
        .join(' '),
    )
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);

  if (paragraphTexts.length > 0) {
    return paragraphTexts.join('\n\n');
  }

  return normalizeWhitespace(
    (block.text || '')
      .split('\n')
      .map((line) => cleanLine(line))
      .filter((line) => lineHasEnoughText(line))
      .join('\n'),
  );
}

function clusterBlocksIntoColumns(blocks: OcrBlock[]) {
  const columns: Array<{ x0: number; x1: number; blocks: OcrBlock[] }> = [];

  const ordered = [...blocks].sort((left, right) => left.bbox.x0 - right.bbox.x0 || left.bbox.y0 - right.bbox.y0);

  ordered.forEach((block) => {
    const blockLeft = block.bbox.x0;
    const blockRight = block.bbox.x1;
    const overlappingColumn = columns.find((column) => {
      const overlap = Math.min(column.x1, blockRight) - Math.max(column.x0, blockLeft);
      const minWidth = Math.min(column.x1 - column.x0, blockRight - blockLeft);
      return overlap > 0 || Math.abs(column.x0 - blockLeft) < Math.max(40, minWidth * 0.35);
    });

    if (overlappingColumn) {
      overlappingColumn.blocks.push(block);
      overlappingColumn.x0 = Math.min(overlappingColumn.x0, blockLeft);
      overlappingColumn.x1 = Math.max(overlappingColumn.x1, blockRight);
      return;
    }

    columns.push({ x0: blockLeft, x1: blockRight, blocks: [block] });
  });

  return columns
    .sort((left, right) => left.x0 - right.x0)
    .map((column) => column.blocks.sort((left, right) => left.bbox.y0 - right.bbox.y0));
}

function cleanOcrText(text: string) {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return '';
  }

  const withoutBrokenWords = normalized
    .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\n([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, '$1$2')
    .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, '$1$2')
    .replace(/\n([a-záéíóúñ])/g, ' $1');

  const paragraphs = withoutBrokenWords
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);

  const dedupedParagraphs = paragraphs.filter((paragraph, index) => paragraph !== paragraphs[index - 1]);

  return dedupedParagraphs.join('\n\n');
}

function rebuildFromBlocks(blocks: OcrBlock[]) {
  const usableBlocks = blocks
    .filter((block) => (block.confidence ?? 0) >= 20)
    .filter((block) => scoreLineForReadingOrder(block.paragraphs?.[0]?.lines?.[0] ?? ({ text: block.text, bbox: block.bbox } as OcrLine)) > 1)
    .filter((block) => extractBlockText(block).length >= 20);

  if (usableBlocks.length === 0) {
    return '';
  }

  const columns = clusterBlocksIntoColumns(usableBlocks);

  return columns
    .flatMap((column) => column.map((block) => extractBlockText(block)))
    .filter(Boolean)
    .join('\n\n');
}

function qualityScore(text: string) {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return 0;
  }

  const tokens = tokenize(normalized);
  const longWords = tokens.filter((token) => token.length >= 4).length;
  const weirdRatio = weirdTokenRatio(normalized);
  const lineBreaks = (normalized.match(/\n/g) || []).length;
  const noisySymbols = (normalized.match(/[~®©|¦]/g) || []).length;

  return longWords * 0.8 + lineBreaks * 0.4 - weirdRatio * 35 - noisySymbols * 2;
}

async function extractTextWithTesseract(buffer: Buffer) {
  const worker = await Tesseract.createWorker('spa+eng', Tesseract.OEM.DEFAULT, {
    langPath: process.cwd(),
    gzip: false,
    cachePath: path.join(os.tmpdir(), 'marchand-tesseract-cache'),
    dataPath: '/tesseract-data',
    logger: () => undefined,
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    });

    const result = await worker.recognize(
      buffer,
      {},
      {
        text: true,
        blocks: true,
      },
    );

    const structuredText = result.data.blocks?.length ? rebuildFromBlocks(result.data.blocks) : '';
    const fallbackText = normalizeWhitespace(result.data.text || '');
    const bestText = structuredText.length >= Math.max(80, fallbackText.length * 0.55) ? structuredText : fallbackText;

    return cleanOcrText(bestText);
  } finally {
    await worker.terminate();
  }
}

async function extractTextWithGemini(buffer: Buffer, mimeType: string) {
  if (!genAI) {
    return '';
  }

  const prompt = `
Transcribe fielmente el texto visible de esta imagen en español.

Instrucciones obligatorias:
1. NO resumas.
2. NO expliques.
3. NO traduzcas.
4. Respeta el orden de lectura natural de un artículo de periódico con columnas, de izquierda a derecha y de arriba hacia abajo.
5. Omite elementos claramente decorativos o basura visual si no son texto real.
6. Corrige solo errores obvios de OCR visual, pero no inventes contenido no visible.
7. Devuelve únicamente la transcripción final limpia, organizada en párrafos.
`;

  const result = await genAI.models.generateContent({
    model: visionModel,
    contents: [
      createPartFromText(prompt),
      createPartFromBase64(buffer.toString('base64'), mimeType),
    ],
  });

  return cleanOcrText(result.text?.trim() || '');
}

function shouldUseGeminiResult(tesseractText: string, geminiText: string) {
  if (!geminiText) {
    return false;
  }

  if (!tesseractText) {
    return true;
  }

  const tesseractScore = qualityScore(tesseractText);
  const geminiScore = qualityScore(geminiText);

  return geminiScore >= tesseractScore + 8;
}

export async function extractTextFromImage(buffer: Buffer, mimeType = 'image/png') {
  if (!genAI) {
    return extractTextWithTesseract(buffer);
  }

  try {
    const geminiText = await extractTextWithGemini(buffer, mimeType);

    if (geminiText) {
      return geminiText;
    }
  } catch (error) {
    console.error('Gemini OCR primary extraction failed, falling back to Tesseract:', error);
  }

  const tesseractText = await extractTextWithTesseract(buffer);

  try {
    const geminiText = await extractTextWithGemini(buffer, mimeType);
    return shouldUseGeminiResult(tesseractText, geminiText) ? geminiText : tesseractText;
  } catch {
    return tesseractText;
  }
}
