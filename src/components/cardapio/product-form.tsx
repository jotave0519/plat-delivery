"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Lock } from "lucide-react";

import { saveProduct } from "@/server/actions/cardapio";
import type { EditableProduct } from "@/server/queries/cardapio";
import { useToast } from "@/components/ui/toast";

type FormOptionItem = { key: string; id?: string; name: string; price: string; usedCount: number };
type FormOptionGroup = {
  key: string;
  id?: string;
  name: string;
  required: boolean;
  multiple: boolean;
  items: FormOptionItem[];
};

const inputClass =
  "rounded-[11px] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

function toFormGroups(product?: EditableProduct): FormOptionGroup[] {
  if (!product) return [];
  return product.optionGroups.map((g) => ({
    key: g.id,
    id: g.id,
    name: g.name,
    required: g.required,
    multiple: g.multiple,
    items: g.items.map((i) => ({ key: i.id, id: i.id, name: i.name, price: String(i.price), usedCount: i.usedCount })),
  }));
}

export function ProductForm({
  categories,
  initial,
  defaultCategoryId,
}: {
  categories: { id: string; name: string }[];
  initial?: EditableProduct;
  defaultCategoryId?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true);
  const [groups, setGroups] = useState<FormOptionGroup[]>(toFormGroups(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function addGroup() {
    setGroups((g) => [
      ...g,
      { key: crypto.randomUUID(), name: "", required: false, multiple: true, items: [] },
    ]);
  }
  function removeGroup(key: string) {
    setGroups((g) => g.filter((group) => group.key !== key));
  }
  function updateGroup(key: string, patch: Partial<FormOptionGroup>) {
    setGroups((g) => g.map((group) => (group.key === key ? { ...group, ...patch } : group)));
  }
  function addItem(groupKey: string) {
    setGroups((g) =>
      g.map((group) =>
        group.key === groupKey
          ? { ...group, items: [...group.items, { key: crypto.randomUUID(), name: "", price: "0", usedCount: 0 }] }
          : group,
      ),
    );
  }
  function removeItem(groupKey: string, itemKey: string) {
    setGroups((g) =>
      g.map((group) =>
        group.key === groupKey ? { ...group, items: group.items.filter((i) => i.key !== itemKey) } : group,
      ),
    );
  }
  function updateItem(groupKey: string, itemKey: string, patch: Partial<FormOptionItem>) {
    setGroups((g) =>
      g.map((group) =>
        group.key === groupKey
          ? { ...group, items: group.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) }
          : group,
      ),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Informe o nome do produto.");
    if (!categoryId) return setError("Selecione uma categoria.");
    const priceNumber = Number(price.replace(",", "."));
    if (!Number.isFinite(priceNumber) || priceNumber < 0) return setError("Preço inválido.");

    for (const group of groups) {
      if (!group.name.trim()) return setError("Todo grupo de adicionais precisa de um nome.");
      for (const item of group.items) {
        if (!item.name.trim()) return setError(`Um item do grupo "${group.name}" está sem nome.`);
      }
    }

    startTransition(async () => {
      const result = await saveProduct({
        id: initial?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        price: priceNumber,
        imageUrl: imageUrl.trim() || undefined,
        categoryId,
        isAvailable,
        optionGroups: groups.map((g) => ({
          id: g.id,
          name: g.name.trim(),
          required: g.required,
          multiple: g.multiple,
          items: g.items.map((i) => ({ id: i.id, name: i.name.trim(), price: Number(i.price.replace(",", ".")) || 0 })),
        })),
      });
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
      // on success, saveProduct redirects to /cardapio
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <section className="grid grid-cols-1 gap-4 rounded-[20px] border border-border bg-surface p-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[13px] font-medium text-muted">Nome</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: X-Bacon" />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[13px] font-medium text-muted">Descrição (opcional)</span>
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Preço</span>
          <input className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" inputMode="decimal" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Categoria</span>
          <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[13px] font-medium text-muted">URL da imagem (opcional)</span>
          <input className={inputClass} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
        </label>

        <label className="flex items-center gap-2.5 sm:col-span-2">
          <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="h-4 w-4 accent-charcoal" />
          <span className="text-[13.5px] text-muted">Disponível para pedidos</span>
        </label>
      </section>

      <section className="flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Adicionais</h2>
          <button
            type="button"
            onClick={addGroup}
            className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-neutral-bg px-3 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
          >
            <Plus className="h-[14px] w-[14px]" />
            Novo grupo
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-[13px] text-faint">Este produto não tem adicionais.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const groupHasHistory = group.items.some((i) => i.usedCount > 0);
              return (
                <div key={group.key} className="flex flex-col gap-3 rounded-[14px] border border-border-soft p-3.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      className={`${inputClass} flex-1`}
                      placeholder="Nome do grupo (ex.: Adicionais)"
                      value={group.name}
                      onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                    />
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={(e) => updateGroup(group.key, { required: e.target.checked })}
                        className="h-3.5 w-3.5 accent-charcoal"
                      />
                      Obrigatório
                    </label>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                      <input
                        type="checkbox"
                        checked={group.multiple}
                        onChange={(e) => updateGroup(group.key, { multiple: e.target.checked })}
                        className="h-3.5 w-3.5 accent-charcoal"
                      />
                      Múltipla escolha
                    </label>
                    <button
                      type="button"
                      disabled={groupHasHistory}
                      title={groupHasHistory ? "Grupo com itens já usados em pedidos — não pode ser removido" : "Remover grupo"}
                      onClick={() => removeGroup(group.key)}
                      className="grid h-7 w-7 place-items-center rounded-[7px] text-faint transition-colors hover:bg-crit-bg hover:text-crit disabled:opacity-30"
                    >
                      <Trash2 className="h-[14px] w-[14px]" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {group.items.map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <input
                          className={`${inputClass} flex-1`}
                          placeholder="Nome do item (ex.: Bacon extra)"
                          value={item.name}
                          onChange={(e) => updateItem(group.key, item.key, { name: e.target.value })}
                          disabled={item.usedCount > 0}
                        />
                        <input
                          className={`${inputClass} w-24`}
                          placeholder="0,00"
                          inputMode="decimal"
                          value={item.price}
                          onChange={(e) => updateItem(group.key, item.key, { price: e.target.value })}
                        />
                        {item.usedCount > 0 ? (
                          <span
                            title="Já usado em pedidos — não pode ser removido"
                            className="grid h-8 w-8 flex-none place-items-center rounded-[9px] text-faint"
                          >
                            <Lock className="h-[13px] w-[13px]" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeItem(group.key, item.key)}
                            className="grid h-8 w-8 flex-none place-items-center rounded-[9px] text-faint transition-colors hover:bg-crit-bg hover:text-crit"
                          >
                            <Trash2 className="h-[13px] w-[13px]" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(group.key)}
                      className="flex items-center gap-1.5 self-start text-[12.5px] font-medium text-accent-hover"
                    >
                      <Plus className="h-[13px] w-[13px]" />
                      Adicionar item
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error ? <p className="rounded-[10px] bg-crit-bg px-3 py-2 text-[13px] text-crit-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[46px] items-center justify-center rounded-[11px] bg-charcoal px-6 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar produto"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/cardapio")}
          className="text-[13.5px] font-medium text-muted hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
