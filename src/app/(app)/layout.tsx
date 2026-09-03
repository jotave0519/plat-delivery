import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { countNewFeedbacks } from "@/server/queries/feedbacks";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ToastProvider } from "@/components/ui/toast";
import { OrderNotificationsProvider } from "@/components/realtime/order-notifications-provider";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário(a)",
  ADMIN: "Administrador(a)",
  ATTENDANT: "Atendente",
  KITCHEN: "Cozinha",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();

  const [restaurant, openOrders, stockLevels, newFeedbacks] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: tenant.restaurantId }, select: { name: true, orderSoundEnabled: true } }),
    db.order.count({ where: { restaurantId: tenant.restaurantId, status: { notIn: ["CONCLUIDO", "CANCELADO"] } } }),
    db.stockItem.findMany({
      where: { restaurantId: tenant.restaurantId },
      select: { quantityOnHand: true, minQuantity: true },
    }),
    countNewFeedbacks(tenant.restaurantId),
  ]);
  // Prisma can't compare two columns of the same row in a `where` filter,
  // so the low-stock threshold is applied in application code instead.
  const lowStock = stockLevels.filter((s) => s.quantityOnHand.lte(s.minQuantity)).length;
  const badges = { "/pedidos": openOrders, "/estoque": lowStock || undefined, "/feedbacks": newFeedbacks || undefined };

  return (
    <ToastProvider>
      <OrderNotificationsProvider soundEnabled={restaurant.orderSoundEnabled}>
        <div className="flex min-h-screen">
          <Sidebar
            restaurantName={restaurant.name}
            userName={tenant.name}
            userRoleLabel={ROLE_LABELS[tenant.role] ?? tenant.role}
            badges={badges}
          />
          <main className="min-w-0 flex-1 pb-[calc(5rem+var(--safe-bottom))] md:pb-0">{children}</main>
          <MobileNav badges={badges} />
        </div>
      </OrderNotificationsProvider>
    </ToastProvider>
  );
}
