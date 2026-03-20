"use client";

import { useId, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isValidApiKey } from "../utils/byokUtils";
import Link from "next/link";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: ReactNode;
}

export function ApiKeyInput({
  value,
  onChange,
  label = "API Key",
  description,
}: ApiKeyInputProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const descriptionId = useId();
  const hintId = useId();
  const describedBy = [description ? descriptionId : null, hintId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-2">
      <div className="space-y-1">
        <Label htmlFor="api-key" className="text-sm font-medium sm:text-[15px]">
          {label}
        </Label>
        {description ? (
          <p id={descriptionId} className="text-[13px] leading-5 text-muted-foreground sm:text-xs">
            {description}
          </p>
        ) : null}
      </div>
      <div className="relative">
        <Input
          id="api-key"
          type={showApiKey ? "text" : "password"}
          placeholder="sk-..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={describedBy}
          className={cn(
            "pr-12 text-base bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 md:text-sm",
            value && !isValidApiKey(value) ? "border-destructive focus-visible:ring-destructive" : ""
          )}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 size-8 rounded-lg"
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            <span className="sr-only">{showApiKey ? "Hide" : "Show"} API key</span>
          </Button>
        )}
      </div>
      {value && !isValidApiKey(value) ? (
        <p id={hintId} className="text-[13px] leading-5 text-destructive break-words sm:text-xs">
          Invalid format. Must be sk-..., sk-proj-..., or sk-svcacct-...
        </p>
      ) : (
        <p id={hintId} className="text-[13px] leading-5 text-muted-foreground sm:text-xs">
          Get your API key from{" "}
          <Link
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground break-all cursor-pointer"
          >
            OpenAI Platform
          </Link>
        </p>
      )}
    </div>
  );
}
