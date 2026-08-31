import { Skeleton } from "@/components/ui/skeleton";

export default function PedidoDetailLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-24 rounded-[9px]" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="ml-auto h-11 w-40 rounded-[11px]" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[220px] rounded-[20px]" />
          <Skeleton className="h-[140px] rounded-[20px]" />
        </div>
        <Skeleton className="h-[260px] rounded-[20px]" />
      </div>
    </div>
  );
}
