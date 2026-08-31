import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border-soft px-[clamp(18px,2.4vw,34px)] py-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="ml-auto h-9 w-52 rounded-[10px]" />
      </div>

      <div className="flex flex-col gap-[18px] px-[clamp(18px,2.4vw,34px)] pt-1 pb-11">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-[18px]" />
          ))}
        </div>

        <Skeleton className="h-[64px] rounded-[16px]" />

        <div className="flex flex-col gap-3.5 rounded-[22px] border border-border bg-surface p-5">
          <Skeleton className="h-5 w-36" />
          <div className="flex gap-2.5 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] w-[132px] flex-none rounded-[15px]" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[176px] rounded-[18px]" />
            ))}
          </div>
        </div>

        <Skeleton className="h-[280px] rounded-[22px]" />
      </div>
    </div>
  );
}
