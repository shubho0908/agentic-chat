"use client";

import { createContext, use, useMemo, useState, ReactNode } from "react";

interface LayoutContextType {
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [showSidebar, setShowSidebar] = useState(true);

  const value = useMemo(() => ({ showSidebar, setShowSidebar }), [showSidebar]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = use(LayoutContext);
  if (context === undefined) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
