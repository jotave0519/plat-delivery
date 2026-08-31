"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";

import {
  analyzeMenuImport,
  confirmMenuImport,
  type ImportDraftCategory,
  type ConfirmMenuImportInput,
} from "@/server/actions/cardapio-import";
import { MenuImportReview } from "@/components/cardapio/menu-import-review";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";
const MAX_FILE_BYTES = 14 * 1024 * 1024;

type Step = "idle" | "analyzing" | "reviewing" | "done";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL gives "data:<mime>;base64,<data>" — we only want the
      // part after the comma, same convention the WhatsApp QR code flow
      // uses in reverse (server → client) elsewhere in this app.
      const result = reader.result as string;
      const base64 = result.slice(result.indexOf(",") + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MenuImportFlow() {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportDraftCategory[]>([]);
  const [result, setResult] = useState<{ createdCategories: number; createdProducts: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File) {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato não suportado. Envie um PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Esse arquivo é muito grande. Envie um arquivo de até 14 MB.");
      return;
    }

    setStep("analyzing");
    try {
      const fileBase64 = await fileToBase64(file);
      const response = await analyzeMenuImport({ fileBase64, mimeType: file.type, fileSize: file.size });
      if ("error" in response) {
        setError(response.error);
        setStep("idle");
        return;
      }
      setDraft(response.categories);
      setStep("reviewing");
    } catch {
      setError("Não foi possível ler esse arquivo. Tente novamente.");
      setStep("idle");
    }
  }

  async function handleConfirm(payload: ConfirmMenuImportInput) {
    const response = await confirmMenuImport(payload);
    if ("error" in response) {
      setError(response.error);
      return;
    }
    setResult(response);
    setStep("done");
  }

  if (step === "analyzing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-surface py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <span className="text-[14px] font-medium">Analisando seu cardápio...</span>
        <span className="max-w-xs text-[12.5px] text-faint">Isso pode levar alguns segundos, dependendo do arquivo.</span>
      </div>
    );
  }

  if (step === "reviewing") {
    return (
      <MenuImportReview
        categories={draft}
        onConfirm={handleConfirm}
        onCancel={() => {
          setDraft([]);
          setStep("idle");
        }}
      />
    );
  }

  if (step === "done" && result) {
    const productsLabel = `${result.createdProducts} produto${result.createdProducts === 1 ? "" : "s"}`;
    const categoriesLabel =
      result.createdCategories > 0
        ? ` em ${result.createdCategories} categoria${result.createdCategories === 1 ? "" : "s"} nova${result.createdCategories === 1 ? "" : "s"}`
        : "";
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-surface py-16 text-center">
        <CheckCircle2 className="h-8 w-8 text-ok" />
        <span className="text-[16px] font-semibold">Cardápio atualizado!</span>
        <span className="max-w-sm text-[13.5px] text-faint">
          {productsLabel} adicionado{result.createdProducts === 1 ? "" : "s"} ao seu cardápio{categoriesLabel}.
        </span>
        <Link
          href="/cardapio"
          className="mt-2 rounded-[10px] bg-charcoal px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border-strong bg-surface py-16 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-neutral-bg text-neutral-icon">
        <Upload className="h-5 w-5" />
      </div>
      <span className="text-[14px] font-medium">Envie um PDF ou uma foto do seu cardápio</span>
      <span className="max-w-sm text-[12.5px] text-faint">PDF, JPG, PNG ou WEBP — até 14 MB.</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFileSelected(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1 flex items-center gap-2 rounded-[11px] bg-charcoal px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
      >
        Selecionar arquivo
      </button>
      {error ? <p className="mt-1 max-w-sm rounded-[10px] bg-crit-bg px-3 py-2 text-[12.5px] text-crit-fg">{error}</p> : null}
    </div>
  );
}
