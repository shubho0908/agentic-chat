"use client";

import { useSyncExternalStore } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function useDomResolvedTheme(): "light" | "dark" | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof document === "undefined") {
        return () => {};
      }

      const root = document.documentElement;
      const observer = new MutationObserver(onStoreChange);
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["class"],
      });

      return () => observer.disconnect();
    },
    () => {
      if (typeof document === "undefined") {
        return null;
      }

      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    },
    () => null,
  );
}

function Toaster({ ...props }: ToasterProps) {
  const resolvedTheme = useDomResolvedTheme();

  return (
    <Sonner
      theme={(resolvedTheme ?? "light") as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
