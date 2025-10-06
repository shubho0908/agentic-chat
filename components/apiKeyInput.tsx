"use client";

import { useState } from "react";
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
}

export function ApiKeyInput({ value, onChange }: ApiKeyInputProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="grid gap-2">
      <Label htmlFor="api-key" className="text-sm">API Key</Label>
      <div className="relative">
        <Input
          id="api-key"
          type={showApiKey ? "text" : "password"}
          placeholder="sk-..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "focus-visible:outline-none focus-visible:ring-0 text-sm pr-10",
            value && !isValidApiKey(value) ? "border-destructive" : ""
          )}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-7 w-7"
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            <span className="sr-only">{showApiKey ? "Hide" : "Show"} API key</span>
          </Button>
        )}
      </div>
      {value && !isValidApiKey(value) ? (
        <p className="text-xs text-destructive break-words">
          Invalid format. Must be sk-..., sk-proj-..., or sk-svcacct-...
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
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
