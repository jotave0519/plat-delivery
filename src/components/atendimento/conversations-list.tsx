import Link from "next/link";
import { MessageCircle } from "lucide-react";

import type { ConversationListItem } from "@/server/queries/atendimento";
import { formatElapsed, minutesAgo } from "@/lib/format";

export function ConversationsList({ conversations }: { conversations: ConversationListItem[] }) {
  if (conversations.length === 0) {
    return <p className="py-6 text-center text-[13px] text-faint">Nenhuma conversa ainda.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border-soft">
      {conversations.map((c) => (
        <Link
          key={c.id}
          href={`/atendimento-ia/conversas/${c.id}`}
          className="flex items-center gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:opacity-80"
        >
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-neutral-bg text-neutral-icon">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13.5px] font-medium">{c.customerName ?? c.contactName ?? c.phoneNumber}</span>
            <span className="truncate text-[12px] text-faint">{c.lastMessagePreview ?? "—"}</span>
          </div>
          <div className="ml-auto flex flex-none flex-col items-end gap-0.5">
            <span className="text-[11.5px] text-faint">há {formatElapsed(minutesAgo(new Date(c.lastMessageAt)))}</span>
            {!c.aiEnabled ? (
              <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[10.5px] font-medium text-warn-fg">Com atendente</span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
