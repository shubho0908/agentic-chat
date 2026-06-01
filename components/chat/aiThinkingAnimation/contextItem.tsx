import { LucideIcon, Loader, CheckCircle2 } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface ContextItemProps {
  icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  detail?: string;
  note?: string;
  completed?: boolean;
  skipped?: boolean;
}

export function ContextItem({
  icon: Icon,
  label,
  detail,
  note,
  completed = false,
  skipped = false,
}: ContextItemProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={`text-[12px] font-medium truncate ${skipped ? "line-through text-muted-foreground/60" : "text-foreground/80"}`}>
        {label}
      </span>
      {detail && (
        <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
          {detail}
        </span>
      )}
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {note && (
          <span className="text-[10px] text-muted-foreground">{note}</span>
        )}
        {skipped ? null : completed ? (
          <CheckCircle2 className="size-3 text-muted-foreground/70" />
        ) : (
          <Loader className="size-3 animate-spin text-muted-foreground" />
        )}
      </span>
    </div>
  );
}
