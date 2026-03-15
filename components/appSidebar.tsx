"use client";

import { useState, useRef, useEffect, useCallback, useReducer } from "react";
import { Plus, Loader, ListChecks, X, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTheme } from "next-themes";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConversationItem } from "@/components/conversationItem";
import { DeleteConversationDialog } from "@/components/deleteConversationDialog";
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { useStreaming } from "@/contexts/streaming-context";
import { NavigationGuardDialog } from "@/components/navigationGuardDialog";

function SidebarBrandLogo({ src }: { src: string }) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
      {!imageLoaded && (
        <div className="absolute inset-0 animate-pulse bg-linear-to-br from-primary/20 to-primary/10" />
      )}
      <Image
        src={src}
        alt="Agentic chat logo"
        width={32}
        height={32}
        className="object-contain"
        onLoad={() => setImageLoaded(true)}
        priority
      />
    </div>
  );
}

interface SidebarSelectionState {
  selectionMode: boolean;
  selectedIds: Set<string>;
  showDeleteDialog: boolean;
}

type SidebarSelectionAction =
  | { type: "toggle-selection-mode" }
  | { type: "toggle-selected-id"; id: string }
  | { type: "set-delete-dialog"; open: boolean }
  | { type: "clear-selection" };

const INITIAL_SELECTION_STATE: SidebarSelectionState = {
  selectionMode: false,
  selectedIds: new Set(),
  showDeleteDialog: false,
};

function sidebarSelectionReducer(
  state: SidebarSelectionState,
  action: SidebarSelectionAction
): SidebarSelectionState {
  switch (action.type) {
    case "toggle-selection-mode":
      return {
        ...state,
        selectionMode: !state.selectionMode,
        selectedIds: new Set(),
      };
    case "toggle-selected-id": {
      const nextSelectedIds = new Set(state.selectedIds);

      if (nextSelectedIds.has(action.id)) {
        nextSelectedIds.delete(action.id);
      } else {
        nextSelectedIds.add(action.id);
      }

      return {
        ...state,
        selectedIds: nextSelectedIds,
      };
    }
    case "set-delete-dialog":
      return {
        ...state,
        showDeleteDialog: action.open,
      };
    case "clear-selection":
      return {
        ...state,
        selectionMode: false,
        selectedIds: new Set(),
        showDeleteDialog: false,
      };
    default:
      return state;
  }
}

export function AppSidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const currentConversationId = pathname?.startsWith("/c/") ? pathname.split("/c/")[1] : null;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showGuardDialog, setShowGuardDialog] = useState(false);
  const [selectionState, dispatchSelection] = useReducer(
    sidebarSelectionReducer,
    INITIAL_SELECTION_STATE
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile, openMobile } = useSidebar();
  const fetchingRef = useRef(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const { isStreaming, stopStreaming } = useStreaming();
  const logoSrc = theme === "dark" ? "/dark.png" : "/light.png";
  const { selectionMode, selectedIds, showDeleteDialog } = selectionState;

  const {
    conversations,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    deleteConversation,
    bulkDeleteConversations,
    renameConversation,
    toggleSharing,
    isRenaming,
    isToggling,
    isBulkDeleting,
  } = useConversations({ enabled: !!session });

  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    enabled: conversations.length > 0,
  });

  useEffect(() => {
    if (!isFetchingNextPage) {
      fetchingRef.current = false;
    }
  }, [isFetchingNextPage]);

  useEffect(() => {
    if (conversations.length === 0) return;

    if (isMobile && openMobile && parentRef.current) {
      const timer = setTimeout(() => {
        virtualizer.measure();
      }, 100);
      return () => clearTimeout(timer);
    }

    if (!isMobile && parentRef.current) {
      const timer = setTimeout(() => {
        virtualizer.measure();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isMobile, openMobile, conversations.length, virtualizer]);

  useEffect(() => {
    const scrollElement = parentRef.current;
    const loader = loaderRef.current;

    if (!scrollElement || !loader || conversations.length === 0 || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !fetchingRef.current) {
          fetchingRef.current = true;
          fetchNextPage();
        }
      },
      {
        root: scrollElement,
        rootMargin: '200px',
        threshold: 0,
      }
    );

    observer.observe(loader);

    const checkInitialLoad = setTimeout(() => {
      const { scrollHeight, clientHeight } = scrollElement;
      if (scrollHeight <= clientHeight && !fetchingRef.current) {
        fetchingRef.current = true;
        fetchNextPage();
      }
    }, isMobile && openMobile ? 400 : 100);

    return () => {
      observer.disconnect();
      clearTimeout(checkInitialLoad);
    };
  }, [hasNextPage, fetchNextPage, conversations.length, isMobile, openMobile]);

  const handleNewChat = () => {
    if (isStreaming) {
      setShowGuardDialog(true);
    } else {
      router.push("/");
    }
  };

  const handleConfirmNewChat = () => {
    stopStreaming();
    router.push("/");
  };

  const handleDeleteConversation = (conversationId: string) => {
    setDeletingId(conversationId);
    if (currentConversationId === conversationId) {
      router.push("/");
    }
    deleteConversation(conversationId, {
      onSettled: () => setDeletingId(null),
    });
  };

  const handleToggleSelectionMode = () => {
    dispatchSelection({ type: "toggle-selection-mode" });
  };

  const handleToggleSelect = useCallback((id: string) => {
    dispatchSelection({ type: "toggle-selected-id", id });
  }, []);

  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedIds);
    dispatchSelection({ type: "clear-selection" });

    if (currentConversationId && selectedIds.has(currentConversationId)) {
      router.push("/");
    }

    bulkDeleteConversations(idsToDelete);
  };

  if (!session) {
    return null;
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <SidebarBrandLogo key={logoSrc} src={logoSrc} />
                <div className="flex flex-col gap-0.5 leading-none pl-1">
                  <span className="font-medium text-sm">Agentic</span>
                  <span className="text-[11px] text-muted-foreground">Chat History</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            {selectionMode ? (
              <div className="flex items-center justify-between w-full px-2 py-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleToggleSelectionMode}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Cancel selection</span>
                  </Button>
                  <span className="text-sm font-medium">
                    {selectedIds.size} selected
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => dispatchSelection({ type: "set-delete-dialog", open: true })}
                    disabled={isBulkDeleting}
                    className="h-8 w-8"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Delete selected conversations</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <SidebarGroupLabel>Conversations</SidebarGroupLabel>
                <div className="flex gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={handleToggleSelectionMode}
                        >
                          <ListChecks className="size-4" />
                          <span className="sr-only">Select</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>Select conversations</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={handleNewChat}
                        >
                          <Plus className="size-4" />
                          <span className="sr-only">New Conversation</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>New Conversation</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <Separator />
      <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden">
        <SidebarContent ref={parentRef} className="flex-1 overflow-y-auto scrollbar-hide">
          <SidebarGroup>
            <SidebarGroupContent>
              {isLoading ? (
                <SidebarMenu className="gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <SidebarMenuItem key={index}>
                      <SidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              ) : conversations.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No conversations yet
                </div>
              ) : (
                <div
                  key={`${isMobile}-${openMobile}`}
                  className="relative w-full"
                  style={{
                    height: virtualizer.getTotalSize() || 'auto',
                  }}
                >
                  <SidebarMenu
                    className="gap-2"
                    style={{
                      position: virtualizer.getTotalSize() ? 'absolute' : 'relative',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: virtualizer.getVirtualItems()[0]
                        ? `translateY(${virtualizer.getVirtualItems()[0].start}px)`
                        : 'none',
                    }}
                  >
                    {virtualizer.getVirtualItems().length > 0 ? (
                      virtualizer.getVirtualItems().map((virtualItem) => {
                        const conversation = conversations[virtualItem.index];
                        if (!conversation) return null;

                        return (
                          <ConversationItem
                            key={conversation.id}
                            ref={(node) => {
                              if (node) {
                                node.setAttribute('data-index', String(virtualItem.index));
                                virtualizer.measureElement(node);
                              }
                            }}
                            conversation={conversation}
                            isActive={currentConversationId === conversation.id}
                            isDeleting={deletingId === conversation.id}
                            isRenaming={isRenaming}
                            isToggling={isToggling}
                            onDelete={handleDeleteConversation}
                            onRename={renameConversation}
                            onToggleSharing={toggleSharing}
                            selectionMode={selectionMode}
                            isSelected={selectedIds.has(conversation.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        );
                      })
                    ) : (
                      conversations.map((conversation) => (
                        <ConversationItem
                          key={conversation.id}
                          conversation={conversation}
                          isActive={currentConversationId === conversation.id}
                          isDeleting={deletingId === conversation.id}
                          isRenaming={isRenaming}
                          isToggling={isToggling}
                          onDelete={handleDeleteConversation}
                          onRename={renameConversation}
                          onToggleSharing={toggleSharing}
                          selectionMode={selectionMode}
                          isSelected={selectedIds.has(conversation.id)}
                          onToggleSelect={handleToggleSelect}
                        />
                      ))
                    )}
                    {isFetchingNextPage && (
                      <SidebarMenuItem>
                        <div className="flex items-center justify-center py-4">
                          <Loader className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      </SidebarMenuItem>
                    )}
                    {hasNextPage && !isFetchingNextPage && (
                      <SidebarMenuItem>
                        <div ref={loaderRef} className="h-1 w-full" />
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </div>
      <DeleteConversationDialog
        mode="bulk"
        open={showDeleteDialog}
        onOpenChange={(open) => dispatchSelection({ type: "set-delete-dialog", open })}
        selectedCount={selectedIds.size}
        onConfirm={handleBulkDelete}
        isDeleting={isBulkDeleting}
      />
      <NavigationGuardDialog
        open={showGuardDialog}
        onOpenChange={setShowGuardDialog}
        onConfirm={handleConfirmNewChat}
        destinationTitle="New Conversation"
      />
    </Sidebar>
  );
}
