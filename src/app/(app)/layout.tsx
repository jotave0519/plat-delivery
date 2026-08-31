import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário(a)",
  ADMIN: "Administrador(a)",
  ATTENDANT: "Atendente",
  KITCHEN: "Cozinha",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();

  const [restaurant, openOrders, stockLevels] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: tenant.restaurantId }, select: { name: true } }),
    db.order.count({ where: { restaurantId: tenant.restaurantId, status: { notIn: ["CONCLUIDO", "CANCELADO"] } } }),
    db.stockItem.findMany({
      where: { restaurantId: tenant.restaurantId },
      select: { quantityOnHand: true, minQuantity: true },
    }),
  ]);
  // Prisma can't compare two columns of the same row in a `where` filter,
  // so the low-stock threshold is applied in application code instead.
  const lowStock = stockLevels.filter((s) => s.quantityOnHand.lte(s.minQuantity)).length;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        restaurantName={restaurant.name}
        userName={tenant.name}
        userRoleLabel={ROLE_LABELS[tenant.role] ?? tenant.role}
        badges={{ "/pedidos": openOrders, "/estoque": lowStock || undefined }}
      />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      <MobileNav />
    </div>
  );
}
