import { Lock } from "lucide-react";

import { getTenant } from "@/lib/tenant";
import { getRestaurantSettings, listUsers } from "@/server/queries/configuracoes";
import { RestaurantForm } from "@/components/configuracoes/restaurant-form";
import { OpeningHoursForm } from "@/components/configuracoes/opening-hours-form";
import { NotificationSettingsForm } from "@/components/configuracoes/notification-settings-form";
import { UsersSection } from "@/components/configuracoes/users-section";

export default async function ConfiguracoesPage() {
  const tenant = await getTenant();
  const canAccess = tenant.role === "OWNER" || tenant.role === "ADMIN";

  if (!canAccess) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-neutral-bg text-neutral-icon">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-[21px] font-semibold tracking-tight">Acesso restrito</h1>
        <p className="max-w-sm text-[13.5px] text-muted">
          Configurações do restaurante são visíveis apenas para proprietários e administradores.
        </p>
      </div>
    );
  }

  const [restaurant, users] = await Promise.all([
    getRestaurantSettings(tenant.restaurantId),
    listUsers(tenant.restaurantId),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Configurações</h1>
        <p className="text-[13px] text-faint">Dados do restaurante, horário de funcionamento e usuários.</p>
      </div>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Dados do restaurante</h2>
        <RestaurantForm restaurant={restaurant} />
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Horário de funcionamento</h2>
        <OpeningHoursForm initial={restaurant.openingHours} />
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Notificações</h2>
        <NotificationSettingsForm orderSoundEnabled={restaurant.orderSoundEnabled} />
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Usuários</h2>
        <UsersSection users={users} currentUserId={tenant.userId} canManage={tenant.role === "OWNER"} />
      </section>
    </div>
  );
}
