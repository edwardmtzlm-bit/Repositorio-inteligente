import { franc } from 'franc';

const spanishHints = /\b(el|la|los|las|de|que|para|con|una|por|del|identidad|poder|estrategia)\b/i;
const englishHints = /\b(the|and|for|with|this|that|from|power|strategy|identity)\b/i;
const spanishStopwords = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al',
  'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sin', 'sobre',
  'también', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra',
]);
const englishStopwords = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'you', 'your', 'are', 'was', 'were', 'have', 'has', 'had', 'not', 'but',
  'they', 'their', 'there', 'what', 'when', 'where', 'which', 'will', 'would', 'can', 'could', 'about', 'into', 'than', 'then',
  'them', 'who', 'how', 'our', 'out', 'more', 'been', 'because', 'while', 'over', 'after', 'before',
]);

function scoreStopwords(text: string, vocabulary: Set<string>) {
  const words: string[] = text.toLowerCase().match(/[a-záéíóúñü]+/gi) ?? [];

  return words.reduce((total: number, word) => total + (vocabulary.has(word) ? 1 : 0), 0);
}

export function detectLanguage(text: string): 'es' | 'en' {
  const normalized = text.trim();

  if (!normalized) {
    return 'es';
  }

  const detected = franc(normalized, { minLength: 20 });

  if (detected === 'spa') {
    return 'es';
  }

  if (detected === 'eng') {
    return 'en';
  }

  const spanishScore = scoreStopwords(normalized, spanishStopwords) + (spanishHints.test(normalized) ? 3 : 0);
  const englishScore = scoreStopwords(normalized, englishStopwords) + (englishHints.test(normalized) ? 3 : 0);

  if (spanishScore >= englishScore + 2) {
    return 'es';
  }

  if (englishScore >= spanishScore + 2) {
    return 'en';
  }

  if (spanishHints.test(normalized)) {
    return 'es';
  }

  if (englishHints.test(normalized)) {
    return 'en';
  }

  return 'es';
}
