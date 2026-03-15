"use client";

import { useState } from "react";
import { Plus, Loader, ListChecks, X, Trash2 } from "lucide-react";
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
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConversationItem } from "@/components/conversationItem";
import { DeleteConversationDialog } from "@/components/deleteConversationDialog";
import Link from "next/link";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { NavigationGuardDialog } from "@/components/navigationGuardDialog";
import { useAppSidebarController } from "@/hooks/useAppSidebarController";

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

export function AppSidebar() {
  const {
    conversations,
    currentConversationId,
    deletingId,
    dispatchSelection,
    handleBulkDelete,
    handleConfirmNewChat,
    handleDeleteConversation,
    handleNewChat,
    handleToggleSelect,
    handleToggleSelectionMode,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    isMobile,
    isBulkDeleting,
    isRenaming,
    isToggling,
    loaderRef,
    logoSrc,
    openMobile,
    parentRef,
    renameConversation,
    selectedIds,
    selectionMode,
    session,
    setShowGuardDialog,
    showDeleteDialog,
    showGuardDialog,
    toggleSharing,
    virtualizer,
  } = useAppSidebarController();

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
