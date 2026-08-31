import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { StockItemForm } from "@/components/estoque/stock-item-form";

export default function NovoItemEstoquePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Link href="/estoque" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-[15px] w-[15px]" />
        Voltar para o estoque
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight">Novo item de estoque</h1>
      <div className="rounded-[20px] border border-border bg-surface p-5">
        <StockItemForm />
      </div>
    </div>
  );
}
