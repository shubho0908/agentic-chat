"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface LayoutContextType {
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [showSidebar, setShowSidebar] = useState(true);

  return (
    <LayoutContext.Provider value={{ showSidebar, setShowSidebar }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
