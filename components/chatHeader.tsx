"use client";

import { type RefObject } from "react";
import { LogIn, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BYOK } from "@/components/byok";
import { AuthModal } from "@/components/authModal";
import { UserMenu } from "@/components/userMenu";
import { ShareDialog } from "@/components/shareDialog";
import { useSession } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatHeaderProps {
  onConfigured: (configured: boolean) => void;
  onNewChat: () => void;
  byokTriggerRef?: RefObject<HTMLButtonElement | null>;
  autoOpenByok?: boolean;
  conversationId?: string;
  isPublic?: boolean;
  onToggleSharing?: (id: string, isPublic: boolean) => void;
  isToggling?: boolean;
}

export function ChatHeader({
  onConfigured,
  byokTriggerRef,
  autoOpenByok = false,
  conversationId,
  isPublic = false,
  onToggleSharing,
  isToggling = false
}: ChatHeaderProps) {
  const { data: session, isPending } = useSession();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-white dark:bg-black/30 p-4 shadow-sm dark:shadow-xl border-b border-border/40 dark:border-white/20 md:left-auto md:top-4 md:right-4 md:bg-transparent md:p-0 md:shadow-none md:border-0">
      {session && (
        <SidebarTrigger className="md:hidden" />
      )}
      <div className="flex items-center gap-2 md:ml-0 ml-auto">
      {isPending ? (
        <>
          <Skeleton className="h-9 w-24 rounded-xl" />
          <Skeleton className="size-9 rounded-full" />
        </>
      ) : (
        <>
          {session ? (
            <>
              {conversationId && onToggleSharing && (
                <ShareDialog
                  conversationId={conversationId}
                  isPublic={isPublic}
                  onToggleSharing={onToggleSharing}
                  isToggling={isToggling}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                    >
                      <Share2 className="size-4" />
                    </Button>
                  }
                />
              )}
              <BYOK
                autoOpen={autoOpenByok}
                onConfigured={onConfigured}
                triggerRef={byokTriggerRef}
              />
              <UserMenu />
            </>
          ) : (
            <AuthModal>
              <Button
                variant="default"
                size="sm"
                className="gap-2 rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                <LogIn className="size-4" />
                <span className="hidden sm:inline">Login</span>
              </Button>
            </AuthModal>
          )}
        </>
      )}
      </div>
    </div>
  );
}
