import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceiroLoading() {
  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="ml-auto h-9 w-52 rounded-[10px]" />
      </div>
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-[16px]" />
        ))}
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-[260px] rounded-[20px]" />
        <Skeleton className="h-[260px] rounded-[20px]" />
      </div>
    </div>
  );
}
