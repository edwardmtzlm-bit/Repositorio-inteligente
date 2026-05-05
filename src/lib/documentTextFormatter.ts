export type FormattedTextBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: string[] };

const sequenceKeywords = ['primero', 'luego', 'después', 'despues', 'finalmente', 'first', 'then', 'next', 'finally'];
const introVerbs = ['incluye', 'incluyen', 'incluía', 'contiene', 'contienen', 'presenta', 'presentan', 'abarca', 'abarcan', 'considera', 'consideran', 'cubre', 'cubren', 'includes', 'contains', 'presents', 'covers'];

function capitalize(text: string) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function normalizeListItem(item: string) {
  const normalized = capitalize(normalizeWhitespace(item).replace(/^[-*•\d.)\s]+/, ''));

  if (!/[.!?:;]$/.test(normalized) && normalized.split(/\s+/).length <= 8) {
    return normalized;
  }

  return normalized;
}

function splitCommaSeparatedItems(listText: string) {
  const normalized = normalizeWhitespace(listText)
    .replace(/\s+(y|e|and)\s+/gi, ', ')
    .replace(/;/g, ',');

  return normalized
    .split(',')
    .map((item) => normalizeListItem(item))
    .filter(Boolean);
}

function detectExistingBulletList(lines: string[]): string[] | null {
  if (lines.length < 2 || !lines.every((line) => /^[-*•]\s+/.test(line.trim()))) {
    return null;
  }

  return lines.map((line) => normalizeListItem(line));
}

function detectExistingNumberedList(lines: string[]): string[] | null {
  if (lines.length < 2 || !lines.every((line) => /^\d+[.)]\s+/.test(line.trim()))) {
    return null;
  }

  return lines.map((line) => normalizeListItem(line));
}

function detectCommaList(paragraph: string): FormattedTextBlock[] | null {
  const normalized = normalizeWhitespace(paragraph);
  const lower = normalized.toLowerCase();

  if (!introVerbs.some((verb) => lower.includes(` ${verb} `)) || (normalized.match(/,/g) || []).length < 2) {
    return null;
  }

  const separators = normalized.match(/\b(?:incluye|incluyen|incluía|contiene|contienen|presenta|presentan|abarca|abarcan|considera|consideran|cubre|cubren|includes|contains|presents|covers)\b/i);

  if (!separators) {
    return null;
  }

  const splitIndex = separators.index! + separators[0].length;
  const intro = normalized.slice(0, splitIndex).trim();
  const items = splitCommaSeparatedItems(normalized.slice(splitIndex));

  if (items.length < 3 || items.some((item) => item.split(/\s+/).length > 10)) {
    return null;
  }

  return [
    { type: 'paragraph', text: `${capitalize(intro)}:` },
    { type: 'bullet-list', items },
  ];
}

function detectSequenceList(paragraph: string): FormattedTextBlock[] | null {
  const normalized = normalizeWhitespace(paragraph);
  const lower = normalized.toLowerCase();

  if (!sequenceKeywords.some((keyword) => lower.includes(keyword))) {
    return null;
  }

  const pattern = /\b(primero|luego|después|despues|finalmente|first|then|next|finally)\b[:,-]?\s*([^.;\n]+)/gi;
  const items: string[] = [];
  let match: RegExpExecArray | null = pattern.exec(normalized);

  while (match) {
    items.push(normalizeListItem(match[2]));
    match = pattern.exec(normalized);
  }

  if (items.length < 2) {
    return null;
  }

  const intro = normalized.split(pattern)[0]?.trim();

  return [
    ...(intro ? [{ type: 'paragraph' as const, text: `${capitalize(intro)}:` }] : []),
    { type: 'numbered-list', items },
  ];
}

function splitLongParagraph(paragraph: string) {
  const normalized = normalizeWhitespace(paragraph);

  if (normalized.length < 420 || /[\n]/.test(normalized)) {
    return [normalized];
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:["'”’)]*)|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [normalized];

  if (sentences.length < 2) {
    return [normalized];
  }

  const chunks: string[] = [];
  let current = '';

  sentences.forEach((sentence) => {
    const candidate = current ? `${current} ${sentence}` : sentence;
    const sentenceCount = candidate.match(/[.!?]+(?:["'”’)]*)/g)?.length ?? 0;

    if (current && (candidate.length > 420 || sentenceCount > 3)) {
      chunks.push(current);
      current = sentence;
      return;
    }

    current = candidate;
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function parseChunk(chunk: string): FormattedTextBlock[] {
  const normalized = normalizeWhitespace(chunk);

  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletItems = detectExistingBulletList(lines);

  if (bulletItems) {
    return [{ type: 'bullet-list', items: bulletItems }];
  }

  const numberedItems = detectExistingNumberedList(lines);

  if (numberedItems) {
    return [{ type: 'numbered-list', items: numberedItems }];
  }

  const sequenceBlocks = detectSequenceList(normalized);

  if (sequenceBlocks) {
    return sequenceBlocks;
  }

  const commaBlocks = detectCommaList(normalized);

  if (commaBlocks) {
    return commaBlocks;
  }

  return splitLongParagraph(normalized).map((text) => ({ type: 'paragraph' as const, text: capitalize(text) }));
}

export function formatTextForReading(text: string): FormattedTextBlock[] {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap((chunk) => parseChunk(chunk))
    .filter((block) => (block.type === 'paragraph' ? Boolean(block.text) : block.items.length > 0));
}
