import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CodeCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Code copied");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-7 w-7 rounded-md border-0 bg-transparent p-0 text-zinc-500 shadow-none transition-colors hover:bg-transparent hover:text-zinc-900 focus-visible:bg-transparent dark:text-zinc-400 dark:hover:bg-transparent dark:hover:text-zinc-100"
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
