/**
 * Best-effort extraction of a 0-10 rating from a customer's free-text
 * feedback reply. The request message never explicitly asks for a number,
 * so most replies won't have one — returning null in that case is the
 * expected common outcome, not a failure. Looks for a standalone number
 * 0-10 (optionally followed by "estrelas"/"/10"/"de 10") anywhere in the
 * text; the first match wins.
 */
export function extractRating(text: string): number | null {
  const match = text.match(/\b(10|[0-9])\s*(?:\/\s*10|estrelas?|de\s*10)?\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
}
