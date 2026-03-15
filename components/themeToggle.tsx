"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeToggle } from "@/hooks/useThemeToggle";

export function ThemeToggle() {
  const { theme, mounted, toggleTheme } = useThemeToggle();

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-9 rounded-full"
        disabled
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="size-9 rounded-full hover:bg-accent/50 transition-all duration-200 ease-out active:scale-[0.98]"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
