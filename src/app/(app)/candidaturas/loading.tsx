import { Skeleton } from "@/components/ui/skeleton";

export default function CandidaturasLoading() {
  return (
    <div className="flex flex-col gap-6 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-7 w-36" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-[150px] rounded-[18px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
