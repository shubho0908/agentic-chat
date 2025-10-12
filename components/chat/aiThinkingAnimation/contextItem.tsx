import { LucideIcon } from "lucide-react";

interface ContextItemProps {
  icon: LucideIcon;
  label: string;
  treeSymbol: "├─" | "└─";
  note?: string;
  iconClassName?: string;
  labelClassName?: string;
  skipped?: boolean;
}

export function ContextItem({
  icon: Icon,
  label,
  treeSymbol,
  note,
  iconClassName,
  labelClassName,
  skipped = false,
}: ContextItemProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-foreground/40 font-mono text-[10px] select-none">
        {treeSymbol}
      </span>
      <Icon
        className={`w-3.5 h-3.5 flex-shrink-0 ${
          skipped ? "" : "animate-pulse"
        } ${iconClassName}`}
      />
      <span
        className={`font-medium ${
          skipped ? "line-through" : ""
        } ${labelClassName}`}
      >
        {label}
      </span>
      {note && (
        <span className="text-foreground/40 text-[10px] ml-auto">{note}</span>
      )}
    </div>
  );
}
