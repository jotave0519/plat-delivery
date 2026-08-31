import type { LucideIcon } from "lucide-react";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-neutral-bg text-neutral-icon">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[11.5px] font-medium uppercase tracking-[.06em] text-faint">Em construção</span>
      <h1 className="text-[21px] font-semibold tracking-tight">{title}</h1>
      <p className="max-w-sm text-[13.5px] text-muted">{description}</p>
    </div>
  );
}
