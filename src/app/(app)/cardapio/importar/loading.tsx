import { Skeleton } from "@/components/ui/skeleton";

export default function ImportarCardapioLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-14 w-72" />
      <Skeleton className="h-[220px] rounded-[20px]" />
    </div>
  );
}
