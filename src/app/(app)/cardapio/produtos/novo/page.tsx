import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { listCategoryOptions } from "@/server/queries/cardapio";
import { ProductForm } from "@/components/cardapio/product-form";

export default async function NovoProdutoPage(props: PageProps<"/cardapio/produtos/novo">) {
  const searchParams = await props.searchParams;
  const tenant = await getTenant();
  const categories = await listCategoryOptions(tenant.restaurantId);

  const categoriaParam = Array.isArray(searchParams.categoria) ? searchParams.categoria[0] : searchParams.categoria;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Link href="/cardapio" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-[15px] w-[15px]" />
        Voltar para o cardápio
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight">Novo produto</h1>

      {categories.length === 0 ? (
        <p className="text-[13.5px] text-faint">Crie uma categoria antes de cadastrar um produto.</p>
      ) : (
        <ProductForm categories={categories} defaultCategoryId={categoriaParam} />
      )}
    </div>
  );
}
