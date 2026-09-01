import { Skeleton } from "@/components/ui/skeleton";

export default function FeedbacksLoading() {
  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-7 w-28" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
