// Pure types/constants/logic for Restaurant.openingHours — deliberately
// free of "server-only" (unlike src/server/queries/configuracoes.ts) so
// client components (the opening-hours editor) can import WEEKDAYS/types
// directly without dragging a server-only guard into the client bundle.

export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type DayHours = { open: string; close: string; closed: boolean };
export type OpeningHours = Record<Weekday, DayHours>;

const DEFAULT_DAY: DayHours = { open: "18:00", close: "23:00", closed: false };

/**
 * `Restaurant.openingHours` was seeded as plain "HH:MM-HH:MM" strings before
 * this module gave it a real editor — normalize both that legacy shape and
 * the newer `{ open, close, closed }` object into one consistent type so
 * the UI never has to know which one it's looking at.
 */
export function normalizeOpeningHours(raw: unknown): OpeningHours {
  const source = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ?? {};
  const result = {} as OpeningHours;

  for (const day of WEEKDAYS) {
    const value = source[day];
    if (typeof value === "string") {
      const [open, close] = value.split("-").map((s) => s.trim());
      result[day] = open && close ? { open, close, closed: false } : { ...DEFAULT_DAY, closed: true };
    } else if (value && typeof value === "object" && "open" in value && "close" in value) {
      const v = value as Partial<DayHours>;
      result[day] = { open: v.open ?? DEFAULT_DAY.open, close: v.close ?? DEFAULT_DAY.close, closed: Boolean(v.closed) };
    } else {
      result[day] = { ...DEFAULT_DAY, closed: true };
    }
  }
  return result;
}
