"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { listCategoriesWithProducts } from "@/server/queries/cardapio";
import { normalizeText, isProbableDuplicate } from "@/lib/text-similarity";
import {
  extractMenuFromFile,
  MenuImportNotConfiguredError,
  SUPPORTED_MENU_FILE_TYPES,
  MAX_MENU_FILE_BYTES,
  type SupportedMenuFileType,
} from "@/server/integrations/anthropic/menu-import";

/**
 * Menu import: PDF/image -> AI extraction (analyzeMenuImport, read-only) ->
 * client-side review -> confirmed creation (confirmMenuImport). Kept in its
 * own file, separate from cardapio.ts, since it's a distinct sub-feature
 * with its own dependency (Anthropic SDK) — same "own private
 * revalidateCardapio()" pattern every actions file in this project already
 * follows (orders.ts/estoque.ts each have their own too), rather than
 * exporting a non-async helper out of a "use server" file (which Next
 * disallows — every export of such a file must be an async function).
 */
function revalidateCardapio() {
  revalidatePath("/cardapio");
  revalidatePath("/dashboard");
  revalidatePath("/pedidos/novo");
}

// ---------- analyze (read-only — never writes to the database) ----------

export type ImportDraftProduct = {
  key: string;
  name: string;
  description: string | null;
  price: number | null;
  duplicateOf: { id: string; name: string; price: number } | null;
};
export type ImportDraftCategory = {
  key: string;
  name: string;
  /** Set when this category name matches one the restaurant already has — reused, not recreated. */
  existingCategoryId: string | null;
  products: ImportDraftProduct[];
};

const analyzeInputSchema = z.object({
  fileBase64: z.string().min(1),
  mimeType: z.string(),
  fileSize: z.number().int().positive(),
});

export async function analyzeMenuImport(
  input: z.infer<typeof analyzeInputSchema>,
): Promise<{ error: string } | { categories: ImportDraftCategory[] }> {
  const tenant = await getTenant();
  const parsed = analyzeInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Arquivo inválido." };
  const { fileBase64, mimeType, fileSize } = parsed.data;

  if (fileSize > MAX_MENU_FILE_BYTES) {
    return { error: "O arquivo é muito grande. Envie um arquivo de até 14 MB." };
  }
  if (!SUPPORTED_MENU_FILE_TYPES.includes(mimeType as SupportedMenuFileType)) {
    return { error: "Formato de arquivo não suportado. Envie um PDF, JPG, PNG ou WEBP." };
  }

  let extracted;
  try {
    extracted = await extractMenuFromFile(fileBase64, mimeType as SupportedMenuFileType);
  } catch (err) {
    if (err instanceof MenuImportNotConfiguredError) {
      return { error: "Importação por IA não está disponível no momento." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { error: "Muitas importações em pouco tempo. Aguarde um instante e tente de novo." };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { error: "Não foi possível conectar ao serviço de importação. Tente novamente em instantes." };
    }
    if (err instanceof Anthropic.APIError) {
      return { error: "O serviço de importação não conseguiu processar esse arquivo. Tente novamente." };
    }
    return {
      error: "Não conseguimos interpretar esse arquivo como um cardápio. Tente uma foto mais nítida ou um arquivo diferente.",
    };
  }

  const totalProducts = extracted.categories.reduce((sum, c) => sum + c.products.length, 0);
  if (totalProducts === 0) {
    return { error: "Não encontramos nenhum produto nesse arquivo. Confira se ele realmente contém um cardápio." };
  }

  const existingCategories = await listCategoriesWithProducts(tenant.restaurantId);
  const existingProducts = existingCategories.flatMap((c) =>
    c.products.map((p) => ({ id: p.id, name: p.name, price: p.price })),
  );

  const draft: ImportDraftCategory[] = extracted.categories.map((category) => {
    const existingCategory = existingCategories.find(
      (ec) => normalizeText(ec.name) === normalizeText(category.name),
    );
    return {
      key: crypto.randomUUID(),
      name: category.name,
      existingCategoryId: existingCategory?.id ?? null,
      products: category.products.map((product) => {
        const duplicate = existingProducts.find((ep) => isProbableDuplicate(product.name, ep.name));
        return {
          key: crypto.randomUUID(),
          name: product.name,
          description: product.description,
          price: product.price,
          duplicateOf: duplicate ? { id: duplicate.id, name: duplicate.name, price: duplicate.price } : null,
        };
      }),
    };
  });

  return { categories: draft };
}

// ---------- confirm (the only step that writes to the database) ----------

const confirmCategorySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  existingCategoryId: z.string().nullable(),
});
const confirmProductSchema = z.object({
  categoryKey: z.string().min(1),
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  price: z.number().min(0),
});
const confirmMenuImportSchema = z.object({
  categories: z.array(confirmCategorySchema),
  products: z.array(confirmProductSchema).min(1, "Selecione ao menos um produto para importar."),
});

export type ConfirmMenuImportInput = z.infer<typeof confirmMenuImportSchema>;

/**
 * Creates only what the user confirmed — new categories (deduped by the
 * client-side `key`) and new products. Never updates or deletes anything
 * that already exists; a category with `existingCategoryId` set is reused
 * as-is, never renamed.
 */
export async function confirmMenuImport(
  input: ConfirmMenuImportInput,
): Promise<{ error: string } | { createdCategories: number; createdProducts: number }> {
  const tenant = await getTenant();
  const parsed = confirmMenuImportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const data = parsed.data;

  const categoryKeys = new Set(data.categories.map((c) => c.key));
  for (const product of data.products) {
    if (!categoryKeys.has(product.categoryKey)) return { error: "Categoria inválida em um dos produtos." };
  }

  // Never trust a client-supplied "this category already exists" id at face
  // value — re-verify it actually belongs to this tenant (same discipline
  // as the option-group ownership check in saveProduct).
  const claimedExistingIds = data.categories.flatMap((c) => (c.existingCategoryId ? [c.existingCategoryId] : []));
  if (claimedExistingIds.length > 0) {
    const owned = await db.category.findMany({
      where: { id: { in: claimedExistingIds }, restaurantId: tenant.restaurantId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((c) => c.id));
    if (claimedExistingIds.some((id) => !ownedIds.has(id))) {
      return { error: "Uma das categorias informadas não pertence a este restaurante." };
    }
  }

  let createdCategories = 0;
  let createdProducts = 0;

  await db.$transaction(async (tx) => {
    const resolvedCategoryIds = new Map<string, string>(); // draft key -> real Category id

    for (const category of data.categories) {
      if (category.existingCategoryId) {
        resolvedCategoryIds.set(category.key, category.existingCategoryId);
        continue;
      }
      // Don't create a category nobody ended up keeping a product for.
      const hasSurvivingProduct = data.products.some((p) => p.categoryKey === category.key);
      if (!hasSurvivingProduct) continue;

      const last = await tx.category.findFirst({
        where: { restaurantId: tenant.restaurantId },
        orderBy: { position: "desc" },
      });
      const created = await tx.category.create({
        data: { restaurantId: tenant.restaurantId, name: category.name, position: (last?.position ?? -1) + 1 },
      });
      resolvedCategoryIds.set(category.key, created.id);
      createdCategories++;
    }

    const productsToCreate = data.products.flatMap((p) => {
      const categoryId = resolvedCategoryIds.get(p.categoryKey);
      return categoryId
        ? [{ restaurantId: tenant.restaurantId, categoryId, name: p.name, description: p.description?.trim() || null, price: p.price }]
        : [];
    });

    if (productsToCreate.length > 0) {
      await tx.product.createMany({ data: productsToCreate });
      createdProducts = productsToCreate.length;
    }
  });

  revalidateCardapio();
  return { createdCategories, createdProducts };
}
