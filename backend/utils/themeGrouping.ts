interface ThemeCandidate {
  index: number;
  originalText: string;
}

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenize(text: string) {
  const stopwords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'your', 'about', 'into', 'para', 'como', 'esto',
    'esta', 'este', 'desde', 'pero', 'porque', 'sobre', 'entre', 'hasta', 'todo', 'toda', 'todos', 'todas', 'una',
    'uno', 'unos', 'unas', 'que', 'por', 'del', 'las', 'los', 'con', 'sin', 'you', 'are', 'was', 'were', 'they',
    'their', 'them', 'then', 'than', 'will', 'just', 'into', 'cada', 'tema', 'image', 'whatsapp',
  ]);

  return Array.from(
    new Set(
      normalize(text)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !stopwords.has(token)),
    ),
  );
}

function jaccard(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((item) => setB.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function groupImagesByTheme(items: ThemeCandidate[]) {
  if (items.length <= 1) {
    return [{ indices: items.map((item) => item.index), rationale: 'Solo hay una imagen.' }];
  }

  const tokenized = items.map((item) => ({
    index: item.index,
    tokens: tokenize(item.originalText),
  }));

  const groups: Array<{ indices: number[]; rationale: string }> = [];
  const used = new Set<number>();

  for (const base of tokenized) {
    if (used.has(base.index)) {
      continue;
    }

    const currentGroup = [base.index];
    used.add(base.index);

    for (const candidate of tokenized) {
      if (used.has(candidate.index) || candidate.index === base.index) {
        continue;
      }

      const similarity = jaccard(base.tokens, candidate.tokens);
      if (similarity >= 0.18) {
        currentGroup.push(candidate.index);
        used.add(candidate.index);
      }
    }

    groups.push({
      indices: currentGroup,
      rationale: currentGroup.length > 1 ? 'Agrupadas por similitud de vocabulario OCR.' : 'Tema independiente.',
    });
  }

  return groups;
}
