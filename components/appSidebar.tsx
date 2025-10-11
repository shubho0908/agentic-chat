"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Plus, Loader } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
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
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Separator } from "./ui/separator";

export function AppSidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const currentConversationId = pathname?.startsWith("/c/") ? pathname.split("/c/")[1] : null;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const { isMobile, openMobile } = useSidebar();
  const fetchingRef = useRef(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const {
    conversations,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    deleteConversation,
    renameConversation,
    toggleSharing,
    isRenaming,
    isToggling,
  } = useConversations();

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
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 text-foreground">
                  <MessageSquare className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Agentic chat</span>
                  <span className="text-xs">Chat History</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarGroupLabel>Conversations</SidebarGroupLabel>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="top-1.5" asChild>
                  <SidebarGroupAction
                    onClick={handleNewChat}
                    className="cursor-pointer"
                  >
                    <Plus /> <span className="sr-only">New Conversation</span>
                  </SidebarGroupAction>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>New Conversation</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-sidebar to-transparent" />
      </div>
    </Sidebar>
  );
}
