import { Globe, Check } from "lucide-react";
import { ContextItem } from "./contextItem";
import type { ContextDetailsProps } from "./types";

export function UrlContentContext({ memoryStatus }: ContextDetailsProps) {
  const urlCount = memoryStatus.urlCount || 0;
  const labelText = urlCount === 1 ? "1 URL scraped" : `${urlCount} URLs scraped`;

  return (
    <div className="flex items-center gap-1.5">
      <ContextItem
        icon={Globe}
        iconClassName="text-blue-500"
        label={labelText}
        treeSymbol="├─"
      />
      <Check className="size-3.5 text-green-500" />
    </div>
  );
}
