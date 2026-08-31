import Link from "next/link";
import { Plus, Upload } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { listCategoriesWithProducts } from "@/server/queries/cardapio";
import { AddCategoryForm } from "@/components/cardapio/add-category-form";
import { CategorySection } from "@/components/cardapio/category-section";

export default async function CardapioPage() {
  const tenant = await getTenant();
  const categories = await listCategoriesWithProducts(tenant.restaurantId);

  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Cardápio</h1>
          <p className="text-[13px] text-faint">Categorias, produtos e adicionais do seu cardápio.</p>
        </div>
        <Link
          href="/cardapio/importar"
          className="ml-auto flex items-center gap-2 rounded-[10px] border border-border-strong px-3.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover"
        >
          <Upload className="h-[15px] w-[15px]" />
          Importar cardápio
        </Link>
        <Link
          href="/cardapio/produtos/novo"
          className="flex items-center gap-2 rounded-[11px] bg-charcoal px-4 py-[11px] text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo produto
        </Link>
      </div>

      <div className="rounded-[16px] border border-dashed border-border-strong p-4">
        <AddCategoryForm />
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-border-strong py-16 text-center text-faint">
          <span className="text-[14px] font-medium text-[#3D4351]">Nenhuma categoria ainda</span>
          <span className="text-[12.5px]">Crie a primeira categoria acima para começar</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((category, i) => (
            <CategorySection
              key={category.id}
              category={category}
              isFirst={i === 0}
              isLast={i === categories.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
