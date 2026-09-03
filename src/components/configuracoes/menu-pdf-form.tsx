"use client";

import { useRef, useTransition } from "react";
import { FileText, Upload, Trash2, Loader2 } from "lucide-react";

import { saveMenuPdf, removeMenuPdf } from "@/server/actions/configuracoes";
import { useToast } from "@/components/ui/toast";

const MAX_FILE_BYTES = 14 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MenuPdfForm({
  fileName,
  updatedAt,
}: {
  fileName: string | null;
  updatedAt: Date | null;
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Envie um arquivo PDF.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("O arquivo é maior que 14 MB.");
      return;
    }
    startTransition(async () => {
      const base64 = await fileToBase64(file);
      const result = await saveMenuPdf({ base64, fileName: file.name });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cardápio em PDF atualizado.");
    });
  }

  function handleRemove() {
    if (!confirm("Remover o cardápio em PDF? A IA deixará de conseguir enviá-lo até um novo ser cadastrado.")) return;
    startTransition(async () => {
      const result = await removeMenuPdf();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-faint">
        O agente de IA envia este arquivo quando um cliente pede o cardápio em PDF pelo WhatsApp.
      </p>

      {fileName ? (
        <div className="flex items-center gap-3 rounded-[13px] border border-border-strong px-4 py-3">
          <FileText className="h-[18px] w-[18px] flex-none text-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium">{fileName}</span>
            {updatedAt ? (
              <span className="text-[11.5px] text-faint">Atualizado em {new Date(updatedAt).toLocaleDateString("pt-BR")}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            title="Remover"
            className="ml-auto grid h-8 w-8 flex-none place-items-center rounded-[9px] text-faint transition-colors hover:bg-crit-bg hover:text-crit disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="flex w-fit items-center gap-2 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Upload className="h-[14px] w-[14px]" />}
        {fileName ? "Substituir PDF" : "Enviar PDF do cardápio"}
      </button>
    </div>
  );
}
