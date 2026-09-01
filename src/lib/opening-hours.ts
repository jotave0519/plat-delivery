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

const JS_SHORT_DAY_TO_WEEKDAY: Record<string, Weekday> = {
  Mon: "seg",
  Tue: "ter",
  Wed: "qua",
  Thu: "qui",
  Fri: "sex",
  Sat: "sab",
  Sun: "dom",
};

/**
 * Used by the WhatsApp AI agent to know whether the restaurant is open
 * right now, in the restaurant's own timezone (not the server's). Handles
 * overnight ranges (e.g. 18:00-00:30). If the timezone/formatting fails for
 * any reason, fails "open" rather than silently refusing every order.
 */
export function isOpenNow(hours: OpeningHours, timezone: string, now: Date = new Date()): boolean {
  try {
    const dayShort = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
    const weekday = JS_SHORT_DAY_TO_WEEKDAY[dayShort];
    if (!weekday) return true;

    const day = hours[weekday];
    if (!day || day.closed) return false;

    const currentTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    // Overnight range (closes after midnight, e.g. 18:00-00:30)
    if (day.close < day.open) {
      return currentTime >= day.open || currentTime < day.close;
    }
    return currentTime >= day.open && currentTime < day.close;
  } catch {
    return true;
  }
}

const WEEKDAY_LABELS: Record<Weekday, string> = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom: "Domingo",
};

/** One line per day — used to give the AI agent a plain-text schedule it can quote. */
export function formatOpeningHoursSummary(hours: OpeningHours): string {
  return WEEKDAYS.map((day) => {
    const d = hours[day];
    return `${WEEKDAY_LABELS[day]}: ${d.closed ? "fechado" : `${d.open} às ${d.close}`}`;
  }).join("\n");
}
