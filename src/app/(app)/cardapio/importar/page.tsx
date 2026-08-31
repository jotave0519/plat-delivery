import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { MenuImportFlow } from "@/components/cardapio/menu-import-flow";

export default async function ImportarCardapioPage() {
  // Just the auth check — everything else in this flow (upload, review,
  // confirm) is inherently interactive, so it all lives in the client
  // component below. analyzeMenuImport/confirmMenuImport re-derive the
  // tenant server-side on every call, same as every other Server Action.
  await getTenant();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Link href="/cardapio" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-[15px] w-[15px]" />
        Voltar para o cardápio
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Importar cardápio</h1>
        <p className="text-[13px] text-faint">
          Envie um PDF ou uma foto do seu cardápio — a gente identifica as categorias e os produtos pra você revisar
          antes de adicionar.
        </p>
      </div>

      <MenuImportFlow />
    </div>
  );
}
