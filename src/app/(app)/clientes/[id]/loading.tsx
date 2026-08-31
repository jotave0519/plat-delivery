import { Skeleton } from "@/components/ui/skeleton";

export default function ClienteDetailLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-9 w-36 rounded-[10px]" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[150px] rounded-[20px]" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[110px] rounded-[16px]" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-[16px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
