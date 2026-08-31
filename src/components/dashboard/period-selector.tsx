import Link from "next/link";

import { PERIOD_LABELS, type Period } from "@/server/queries/dashboard";

const PERIODS: Period[] = ["hoje", "7dias", "30dias"];

export function PeriodSelector({ active }: { active: Period }) {
  return (
    <div className="flex rounded-[11px] border border-border-strong bg-surface p-[3px]">
      {PERIODS.map((period) => (
        <Link
          key={period}
          href={`/dashboard?period=${period}`}
          className={`rounded-[8px] px-[13px] py-[6px] text-[13px] font-medium transition-colors ${
            period === active ? "bg-charcoal text-white" : "text-muted hover:text-ink"
          }`}
        >
          {PERIOD_LABELS[period]}
        </Link>
      ))}
    </div>
  );
}
