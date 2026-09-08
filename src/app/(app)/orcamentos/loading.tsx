import { Skeleton } from "@/components/ui/skeleton";

export default function OrcamentosLoading() {
  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[160px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
