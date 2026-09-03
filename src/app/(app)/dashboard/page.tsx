import { getTenant } from "@/lib/tenant";
import { getDashboardData, PERIOD_LABELS, type Period } from "@/server/queries/dashboard";
import { PIPELINE_STAGES } from "@/lib/order-flow";
import type { OrderStatus } from "@/generated/prisma";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiSection } from "@/components/dashboard/kpi-section";
import { AlertsBanner } from "@/components/dashboard/alerts-banner";
import { PipelineBoard } from "@/components/dashboard/pipeline-board";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";

const PERIODS: Period[] = ["hoje", "7dias", "30dias"];

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const searchParams = await props.searchParams;
  const tenant = await getTenant();

  const periodParam = Array.isArray(searchParams.period) ? searchParams.period[0] : searchParams.period;
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "hoje";

  const data = await getDashboardData(tenant.restaurantId, period);

  const stageParam = Array.isArray(searchParams.stage) ? searchParams.stage[0] : searchParams.stage;
  const defaultStage = data.pipeline.find((s) => s.count > 0)?.status ?? "NOVO";
  const activeStage: OrderStatus = PIPELINE_STAGES.includes(stageParam as OrderStatus)
    ? (stageParam as OrderStatus)
    : defaultStage;

  const firstName = tenant.name.split(" ")[0] || tenant.name;

  return (
    <div className="flex flex-col">
      <DashboardHeader firstName={firstName} period={period} hasAlerts={data.alerts.secondary.length > 0 || !data.alerts.critical.positive} />
      {/*
        Mobile order follows operational priority (pedidos/operação → resumo →
        alertas → análises secundárias); `lg:order-none` restores the original
        desktop order (KPIs → alertas → pipeline → análises) unchanged.
      */}
      <div className="flex flex-col gap-[18px] px-[clamp(18px,2.4vw,34px)] pt-1 pb-11">
        <div className="order-2 lg:order-none">
          <KpiSection kpi={data.kpi} periodLabel={PERIOD_LABELS[period]} />
        </div>
        <div className="order-3 lg:order-none">
          <AlertsBanner alerts={data.alerts} />
        </div>
        <div className="order-1 lg:order-none">
          <PipelineBoard pipeline={data.pipeline} queue={data.queue} activeStage={activeStage} />
        </div>
        <div className="order-4 lg:order-none">
          <AnalyticsPanel analytics={data.analytics} periodLabel={PERIOD_LABELS[period]} />
        </div>
      </div>
    </div>
  );
}
