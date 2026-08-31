"use client";

import { useState } from "react";
import { Trash2, Plus, TriangleAlert, Loader2 } from "lucide-react";

import { formatBRL } from "@/lib/format";
import type { ImportDraftCategory, ConfirmMenuImportInput } from "@/server/actions/cardapio-import";

type ReviewProduct = {
  key: string;
  categoryKey: string;
  name: string;
  description: string;
  price: string; // kept as the raw input string; parsed to a number on submit
  selected: boolean;
  duplicateOf: { id: string; name: string; price: number } | null;
};
type ReviewCategory = { key: string; name: string; existingCategoryId: string | null };

const inputClass =
  "rounded-[9px] border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

function buildInitialState(categories: ImportDraftCategory[]) {
  const reviewCategories: ReviewCategory[] = categories.map((c) => ({
    key: c.key,
    name: c.name,
    existingCategoryId: c.existingCategoryId,
  }));
  const reviewProducts: ReviewProduct[] = categories.flatMap((c) =>
    c.products.map((p) => ({
      key: p.key,
      categoryKey: c.key,
      name: p.name,
      description: p.description ?? "",
      price: p.price != null ? String(p.price) : "",
      // Default to selected, EXCEPT when the price couldn't be read or this
      // looks like a duplicate — those need an explicit opt-in, not a
      // silent auto-import.
      selected: p.price != null && !p.duplicateOf,
      duplicateOf: p.duplicateOf,
    })),
  );
  return { reviewCategories, reviewProducts };
}

export function MenuImportReview({
  categories,
  onConfirm,
  onCancel,
}: {
  categories: ImportDraftCategory[];
  onConfirm: (payload: ConfirmMenuImportInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [initial] = useState(() => buildInitialState(categories));
  const [reviewCategories, setReviewCategories] = useState<ReviewCategory[]>(initial.reviewCategories);
  const [products, setProducts] = useState<ReviewProduct[]>(initial.reviewProducts);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFound = categories.reduce((sum, c) => sum + c.products.length, 0);

  function updateProduct(key: string, patch: Partial<ReviewProduct>) {
    setProducts((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }
  function removeProduct(key: string) {
    setProducts((current) => current.filter((item) => item.key !== key));
  }
  function addManualProduct(categoryKey: string) {
    setProducts((current) => [
      ...current,
      { key: crypto.randomUUID(), categoryKey, name: "", description: "", price: "", selected: true, duplicateOf: null },
    ]);
  }
  function toggleCategory(categoryKey: string, selected: boolean) {
    setProducts((current) => current.map((item) => (item.categoryKey === categoryKey ? { ...item, selected } : item)));
  }
  function renameCategory(key: string, name: string) {
    setReviewCategories((current) => current.map((c) => (c.key === key ? { ...c, name } : c)));
  }

  function handleSubmit() {
    setError(null);
    const selected = products.filter((p) => p.selected);
    if (selected.length === 0) {
      setError("Selecione ao menos um produto para importar.");
      return;
    }
    for (const p of selected) {
      if (!p.name.trim()) {
        setError("Um dos produtos selecionados está sem nome.");
        return;
      }
      const priceNumber = Number(p.price.replace(",", "."));
      if (!p.price.trim() || !Number.isFinite(priceNumber) || priceNumber < 0) {
        setError(`Informe um preço válido para "${p.name}".`);
        return;
      }
    }

    const payload: ConfirmMenuImportInput = {
      categories: reviewCategories,
      products: selected.map((p) => ({
        categoryKey: p.categoryKey,
        name: p.name.trim(),
        description: p.description.trim() || undefined,
        price: Number(p.price.replace(",", ".")),
      })),
    };

    setPending(true);
    onConfirm(payload).finally(() => setPending(false));
  }

  const selectedCount = products.filter((p) => p.selected).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[16px] border border-border bg-surface p-4">
        <p className="text-[14px] font-medium">
          Encontramos {totalFound} produto{totalFound === 1 ? "" : "s"} em {categories.length} categoria
          {categories.length === 1 ? "" : "s"}.
        </p>
        <p className="text-[12.5px] text-faint">Revise, edite o que for preciso e confirme para adicionar ao seu cardápio.</p>
      </div>

      {reviewCategories.map((category) => {
        const categoryProducts = products.filter((p) => p.categoryKey === category.key);
        if (categoryProducts.length === 0) return null;
        const allSelected = categoryProducts.every((p) => p.selected);

        return (
          <section key={category.key} className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleCategory(category.key, e.target.checked)}
                className="h-4 w-4 flex-none accent-charcoal"
                title="Selecionar/desselecionar todos os produtos desta categoria"
              />
              <input
                value={category.name}
                onChange={(e) => renameCategory(category.key, e.target.value)}
                className={`${inputClass} min-w-0 flex-1 font-medium`}
              />
              <span
                className={`flex-none rounded-[7px] px-2 py-1 text-[11px] font-medium ${
                  category.existingCategoryId ? "bg-neutral-bg text-neutral-fg" : "bg-accent-bg text-accent-hover"
                }`}
              >
                {category.existingCategoryId ? "já existe" : "nova categoria"}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {categoryProducts.map((product) => (
                <div key={product.key} className="flex flex-col gap-1.5 rounded-[12px] border border-border-soft p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={product.selected}
                      onChange={(e) => updateProduct(product.key, { selected: e.target.checked })}
                      className="h-4 w-4 flex-none accent-charcoal"
                    />
                    <input
                      value={product.name}
                      onChange={(e) => updateProduct(product.key, { name: e.target.value })}
                      placeholder="Nome do produto"
                      className={`${inputClass} min-w-[140px] flex-1`}
                    />
                    <select
                      value={product.categoryKey}
                      onChange={(e) => updateProduct(product.key, { categoryKey: e.target.value })}
                      className={`${inputClass} w-36 flex-none`}
                    >
                      {reviewCategories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name || "(sem nome)"}
                        </option>
                      ))}
                    </select>
                    <input
                      value={product.price}
                      onChange={(e) => updateProduct(product.key, { price: e.target.value })}
                      placeholder="0,00"
                      inputMode="decimal"
                      className={`${inputClass} w-24 flex-none`}
                    />
                    <button
                      type="button"
                      onClick={() => removeProduct(product.key)}
                      title="Remover da importação"
                      className="grid h-8 w-8 flex-none place-items-center rounded-[8px] text-faint transition-colors hover:bg-crit-bg hover:text-crit"
                    >
                      <Trash2 className="h-[14px] w-[14px]" />
                    </button>
                  </div>
                  <input
                    value={product.description}
                    onChange={(e) => updateProduct(product.key, { description: e.target.value })}
                    placeholder="Descrição (opcional)"
                    className={`${inputClass} ml-6`}
                  />
                  {!product.price ? (
                    <span className="ml-6 flex items-center gap-1.5 text-[12px] text-warn-fg">
                      <TriangleAlert className="h-[12px] w-[12px] flex-none" />
                      Preço não identificado — informe antes de importar.
                    </span>
                  ) : null}
                  {product.duplicateOf ? (
                    <span className="ml-6 flex items-center gap-1.5 text-[12px] text-warn-fg">
                      <TriangleAlert className="h-[12px] w-[12px] flex-none" />
                      &quot;{product.duplicateOf.name}&quot; parece já existir no seu cardápio ({formatBRL(product.duplicateOf.price)}).
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addManualProduct(category.key)}
              className="flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-accent-hover"
            >
              <Plus className="h-[13px] w-[13px]" />
              Adicionar produto
            </button>
          </section>
        );
      })}

      {error ? <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-[11px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : null}
          Adicionar ao cardápio{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className="text-[13px] font-medium text-muted hover:text-ink disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}
