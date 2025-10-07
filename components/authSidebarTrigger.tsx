"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSession } from "@/lib/auth-client";

export function AuthSidebarTrigger() {
  const { data: session } = useSession();

  if (!session) {
    return null;
  }

  return (
    <SidebarTrigger className="hidden md:flex fixed left-2 top-4 z-50 transition-[left] duration-200 ease-linear md:left-[13.5rem] md:peer-data-[state=collapsed]:left-2" />
  );
}
