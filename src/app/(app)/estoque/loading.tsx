import { Skeleton } from "@/components/ui/skeleton";

export default function EstoqueLoading() {
  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="ml-auto h-10 w-40 rounded-[10px]" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[130px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
