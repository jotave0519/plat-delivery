import { Phone, ArrowRightLeft } from "lucide-react";

import type { PhoneCallListItem } from "@/server/queries/telefonia";
import { formatElapsed, minutesAgo } from "@/lib/format";

const STATUS_LABEL: Record<PhoneCallListItem["status"], string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  TRANSFERIDA: "Transferida",
  FALHA: "Falhou",
};

const STATUS_TONE: Record<PhoneCallListItem["status"], string> = {
  EM_ANDAMENTO: "bg-accent-bg text-accent-hover",
  CONCLUIDA: "bg-ok-bg text-ok-fg",
  TRANSFERIDA: "bg-warn-bg text-warn-fg",
  FALHA: "bg-crit-bg text-crit-fg",
};

function formatDuration(seconds: number | null) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PhoneCallsList({ calls }: { calls: PhoneCallListItem[] }) {
  if (calls.length === 0) {
    return <p className="py-6 text-center text-[13px] text-faint">Nenhuma ligação ainda.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border-soft">
      {calls.map((c) => (
        <div key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-bg text-neutral-icon">
            <Phone className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13.5px] font-medium">{c.customerName ?? c.callerPhone}</span>
            <span className="truncate text-[12px] text-faint">
              {c.orderNumber ? `Pedido #${c.orderNumber}` : "Sem pedido"}
              {c.transferredToHuman ? " · transferida" : ""}
            </span>
          </div>
          <div className="ml-auto flex flex-none flex-col items-end gap-1">
            <span className="text-[11.5px] text-faint">há {formatElapsed(minutesAgo(new Date(c.startedAt)))}</span>
            <div className="flex items-center gap-1.5">
              {formatDuration(c.durationSeconds) ? (
                <span className="text-[10.5px] text-faint">{formatDuration(c.durationSeconds)}</span>
              ) : null}
              {c.transferredToHuman ? <ArrowRightLeft className="h-3 w-3 text-warn-fg" /> : null}
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_TONE[c.status]}`}>
                {STATUS_LABEL[c.status]}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
