import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getProductForEdit, listCategoryOptions } from "@/server/queries/cardapio";
import { ProductForm } from "@/components/cardapio/product-form";

export default async function EditarProdutoPage(props: PageProps<"/cardapio/produtos/[id]">) {
  const { id } = await props.params;
  const tenant = await getTenant();
  const [product, categories] = await Promise.all([
    getProductForEdit(tenant.restaurantId, id),
    listCategoryOptions(tenant.restaurantId),
  ]);
  if (!product) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Link href="/cardapio" className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-[15px] w-[15px]" />
        Voltar para o cardápio
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight">Editar produto</h1>
      <ProductForm categories={categories} initial={product} />
    </div>
  );
}
