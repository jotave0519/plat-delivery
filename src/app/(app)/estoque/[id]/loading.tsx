import { Skeleton } from "@/components/ui/skeleton";

export default function EstoqueDetailLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-[120px] rounded-[20px]" />
      <Skeleton className="h-[220px] rounded-[20px]" />
    </div>
  );
}
