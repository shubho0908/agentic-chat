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
  const truncateLabel = (text: string, maxWords: number = 6) => {
    const words = text.split(' ');
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ') + '...';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-foreground/40 font-mono text-[10px] select-none">
        {treeSymbol}
      </span>
      <Icon
        className={`w-3.5 h-3.5 flex-shrink-0 ${
          skipped ? "" : "animate-pulse"
        } ${iconClassName}`}
        suppressHydrationWarning
      />
      <span
        className={`font-medium truncate max-w-[200px] ${
          skipped ? "line-through" : ""
        } ${labelClassName}`}
        suppressHydrationWarning
        title={label}
      >
        {truncateLabel(label)}
      </span>
      {note && (
        <span className="text-foreground/40 text-[10px] ml-auto">{note}</span>
      )}
    </div>
  );
}
