"use client";

import { useEffect, type ReactNode } from "react";
import { useLayout } from "@/components/providers/layoutProvider";

export function LegalRouteShell({ children }: { children: ReactNode }) {
  const { setShowSidebar } = useLayout();

  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(true);
  }, [setShowSidebar]);

  return children;
}
