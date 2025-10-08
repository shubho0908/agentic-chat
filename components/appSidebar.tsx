"use client";

import * as React from "react";
import { MessageSquare, Plus, Trash2, MoreHorizontal, Loader, Pencil, Share2 } from "lucide-react";
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
  SidebarMenuAction,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RenameDialog } from "@/components/renameDialog";
import { ShareDialog } from "@/components/shareDialog";
import { DeleteDialog } from "@/components/deleteDialog";
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/lib/auth-client";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Separator } from "./ui/separator";

export function AppSidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const currentConversationId = pathname.startsWith("/c/") ? pathname.split("/c/")[1] : null;
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const {
    conversations,
    isLoading,
    deleteConversation,
    renameConversation,
    toggleSharing,
    isRenaming,
    isToggling,
  } = useConversations();

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
        <SidebarContent className="flex-1 scrollbar-hide">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <SidebarMenuItem key={index}>
                      <SidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))
                ) : conversations.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                    No conversations yet
                  </div>
                ) : (
                  conversations.map((conversation) => {
                    const isDeleting = deletingId === conversation.id;
                    return (
                      <SidebarMenuItem key={conversation.id} className={isDeleting ? "opacity-50 pointer-events-none" : ""}>
                        <SidebarMenuButton asChild isActive={currentConversationId === conversation.id} disabled={isDeleting}>
                          <Link href={`/c/${conversation.id}`} className={`py-3 px-3 ${isDeleting ? "cursor-not-allowed" : "cursor-pointer"}`}>
                            {isDeleting ? (
                              <Loader className="size-4 shrink-0 animate-spin" />
                            ) : null}
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="truncate font-medium">{conversation.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(conversation.updatedAt), {
                                  addSuffix: true,
                                })}
                              </span>
                            </div>
                          </Link>
                        </SidebarMenuButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={isDeleting}>
                            <SidebarMenuAction className="cursor-pointer" showOnHover>
                              {isDeleting ? (
                                <Loader className="size-4 animate-spin" />
                              ) : (
                                <MoreHorizontal />
                              )}
                              <span className="sr-only">More</span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start">
                            <RenameDialog
                              conversationId={conversation.id}
                              currentTitle={conversation.title}
                              onRename={(id, title) => renameConversation({ id, title })}
                              isRenaming={isRenaming}
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="cursor-pointer"
                                >
                                  <Pencil className="mr-2 size-4" />
                                  Rename
                                </DropdownMenuItem>
                              }
                            />
                            <ShareDialog
                              conversationId={conversation.id}
                              isPublic={conversation.isPublic}
                              onToggleSharing={(id, isPublic) => toggleSharing({ id, isPublic })}
                              isToggling={isToggling}
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="cursor-pointer"
                                >
                                  <Share2 className="mr-2 size-4" />
                                  Share
                                </DropdownMenuItem>
                              }
                            />
                            <DropdownMenuSeparator />
                            <DeleteDialog
                              conversationId={conversation.id}
                              conversationTitle={conversation.title}
                              onDelete={handleDeleteConversation}
                              isDeleting={isDeleting}
                              trigger={
                                <DropdownMenuItem
                                  onSelect={(e) => e.preventDefault()}
                                  className="text-destructive cursor-pointer"
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="mr-2 size-4" />
                                  Delete
                                </DropdownMenuItem>
                              }
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-sidebar to-transparent" />
      </div>
    </Sidebar>
  );
}
