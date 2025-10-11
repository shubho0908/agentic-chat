"use client";

import { forwardRef } from "react";
import { Trash2, MoreHorizontal, Loader, Pencil, Share2 } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RenameDialog } from "@/components/renameDialog";
import { ShareDialog } from "@/components/shareDialog";
import { DeleteDialog } from "@/components/deleteDialog";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface Conversation {
  id: string;
  title: string;
  isPublic: boolean;
  updatedAt: string;
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  isDeleting: boolean;
  isRenaming: boolean;
  isToggling: boolean;
  onDelete: (id: string) => void;
  onRename: (data: { id: string; title: string }) => void;
  onToggleSharing: (data: { id: string; isPublic: boolean }) => void;
}

export const ConversationItem = forwardRef<HTMLLIElement, ConversationItemProps>(
  ({
    conversation,
    isActive,
    isDeleting,
    isRenaming,
    isToggling,
    onDelete,
    onRename,
    onToggleSharing,
  }, ref) => {
    return (
      <SidebarMenuItem
        ref={ref}
        className={isDeleting ? "opacity-50 pointer-events-none" : ""}
      >
        <SidebarMenuButton asChild isActive={isActive} disabled={isDeleting}>
          <Link 
            href={`/c/${conversation.id}`} 
            className={`py-3 px-3 ${isDeleting ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            {isDeleting && <Loader className="size-4 shrink-0 animate-spin" />}
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
              onRename={(id, title) => onRename({ id, title })}
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
              onToggleSharing={(id, isPublic) => onToggleSharing({ id, isPublic })}
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
              onDelete={onDelete}
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
  }
);

ConversationItem.displayName = "ConversationItem";
