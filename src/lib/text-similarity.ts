/**
 * Small, dependency-free string-similarity helper used by the menu-import
 * feature to flag possible duplicates ("Pizza de Calabresa" imported again
 * as "Pizza Calabresa") without pulling in a fuzzy-matching library for one
 * feature. Dice's coefficient over character bigrams -- cheap, well
 * understood, good enough for short product/category names.
 */

// Unicode property escape for combining marks -- strips accents after NFD
// normalization (e.g. "a" + combining acute -> "a") without hardcoding a
// codepoint range.
const COMBINING_MARKS = /\p{M}/gu;

/** Lowercase, strip accents, collapse whitespace/punctuation noise. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): string[] {
  const chars = value.replace(/\s+/g, "");
  if (chars.length < 2) return chars.length === 1 ? [chars] : [];
  const result: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) result.push(chars.slice(i, i + 2));
  return result;
}

/** Dice's coefficient: 1 = identical, 0 = nothing in common. */
export function diceCoefficient(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) return a === b ? 1 : 0;

  const counts = new Map<string, number>();
  for (const bg of bigramsA) counts.set(bg, (counts.get(bg) ?? 0) + 1);

  let matches = 0;
  for (const bg of bigramsB) {
    const remaining = counts.get(bg) ?? 0;
    if (remaining > 0) {
      matches++;
      counts.set(bg, remaining - 1);
    }
  }
  return (2 * matches) / (bigramsA.length + bigramsB.length);
}

const DUPLICATE_THRESHOLD = 0.6;

/** True if `name` is close enough to `existingName` to warrant a "might already exist" warning. */
export function isProbableDuplicate(name: string, existingName: string): boolean {
  return diceCoefficient(normalizeText(name), normalizeText(existingName)) >= DUPLICATE_THRESHOLD;
}
