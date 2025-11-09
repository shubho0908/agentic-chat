"use client";

import { useState, forwardRef, type MouseEvent, type ReactNode, type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStreaming } from "@/contexts/streaming-context";
import { NavigationGuardDialog } from "./navigationGuardDialog";

interface ProtectedConversationLinkProps extends Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> {
  conversationId: string;
  conversationTitle: string;
  children: ReactNode;
}

export const ProtectedConversationLink = forwardRef<HTMLAnchorElement, ProtectedConversationLinkProps>(
  ({ conversationId, conversationTitle, children, onClick, ...props }, ref) => {
  const pathname = usePathname();
  const router = useRouter();
  const { isStreaming, streamingConversationId, stopStreaming } = useStreaming();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const targetPath = `/c/${conversationId}`;

    if (pathname === targetPath) {
      return;
    }

    const isStreamingInDifferentConversation =
      isStreaming && streamingConversationId !== conversationId;

    if (isStreamingInDifferentConversation) {
      e.preventDefault();
      setPendingNavigation(targetPath);
      setShowDialog(true);
    } else if (onClick) {
      onClick(e);
    }
  };

  const handleConfirm = () => {
    stopStreaming();

    if (pendingNavigation) {
      setTimeout(() => {
        router.push(pendingNavigation);
      }, 50);
    }
  };

    return (
      <>
        <Link
          ref={ref}
          href={`/c/${conversationId}`}
          onClick={handleClick}
          {...props}
        >
          {children}
        </Link>
        <NavigationGuardDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          onConfirm={handleConfirm}
          destinationTitle={conversationTitle}
        />
      </>
    );
  }
);

ProtectedConversationLink.displayName = "ProtectedConversationLink";
