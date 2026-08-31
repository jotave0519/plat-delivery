import type { Prisma } from "@/generated/prisma";

export function formatBRL(value: number | Prisma.Decimal | null | undefined) {
  const num = value == null ? 0 : typeof value === "number" ? value : Number(value);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatDelta(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? { label: "novo no período", positive: true } : { label: "estável", positive: true };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return { label: `${pct >= 0 ? "+" : ""}${pct}%`, positive: pct >= 0 };
}

export function minutesAgo(date: Date, now: Date = new Date()) {
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
}

export function formatElapsed(mins: number) {
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

/** "30/08/2026" — short date used in list rows (customer cards, financial entries). */
export function formatShortDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTimeHeader(date: Date) {
  const formatted = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return `${capitalized} · ${time}`;
}
