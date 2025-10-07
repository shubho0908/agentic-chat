"use client";

import { AppSidebar } from "@/components/appSidebar";
import { AuthSidebarTrigger } from "@/components/authSidebarTrigger";
import { useLayout } from "@/components/providers/layoutProvider";

export function ConditionalSidebar() {
  const { showSidebar } = useLayout();

  if (!showSidebar) {
    return null;
  }

  return (
    <>
      <AppSidebar />
      <AuthSidebarTrigger />
    </>
  );
}
