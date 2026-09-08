import { Skeleton } from "@/components/ui/skeleton";

export default function DespachoLoading() {
  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-[140px] rounded-[18px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
