"use client";

import { useState, useRef, type MouseEvent, type ReactNode, type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStreaming } from "@/contexts/streaming-context";
import { NavigationGuardDialog } from "./navigationGuardDialog";

interface ProtectedConversationLinkProps extends Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> {
  conversationId: string;
  conversationTitle: string;
  children: ReactNode;
  ref?: React.Ref<HTMLAnchorElement>;
}

export const ProtectedConversationLink = ({
  conversationId,
  conversationTitle,
  children,
  onClick,
  ref,
  ...props
}: ProtectedConversationLinkProps) => {
  const { push } = useRouter();
  const { isStreaming, streamingConversationId, stopStreaming } = useStreaming();
  const [showDialog, setShowDialog] = useState(false);
  const pendingNavigation = useRef<string | null>(null);

  const handleConversationLinkClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const targetPath = `/c/${conversationId}`;
    const currentPath = window.location.pathname;

    if (currentPath === targetPath) {
      return;
    }

    const isStreamingInDifferentConversation =
      isStreaming && streamingConversationId !== conversationId;

    if (isStreamingInDifferentConversation) {
      e.preventDefault();
      pendingNavigation.current = targetPath;
      setShowDialog(true);
    } else if (onClick) {
      onClick(e);
    }
  };

  const handleConfirm = () => {
    stopStreaming();

    if (pendingNavigation.current) {
      const target = pendingNavigation.current;
      setTimeout(() => {
        push(target);
      }, 50);
    }
  };

    return (
      <>
        <Link
          ref={ref}
          href={`/c/${conversationId}`}
          onClick={handleConversationLinkClick}
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
};

ProtectedConversationLink.displayName = "ProtectedConversationLink";
