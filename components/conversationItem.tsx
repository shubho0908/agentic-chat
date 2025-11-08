"use client";

import { forwardRef } from "react";
import { Trash2, MoreHorizontal, Loader, Pencil, Share2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DeleteConversationDialog } from "@/components/deleteConversationDialog";
import { ProtectedConversationLink } from "@/components/protectedConversationLink";
import { formatDistanceToNow } from "date-fns";

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
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
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
    selectionMode = false,
    isSelected = false,
    onToggleSelect,
  }, ref) => {
    const handleRowClick = () => {
      if (selectionMode && onToggleSelect && !isDeleting) {
        onToggleSelect(conversation.id);
      }
    };

    return (
      <SidebarMenuItem
        ref={ref}
        className={isDeleting ? "opacity-50 pointer-events-none" : ""}
      >
        {selectionMode ? (
          <div
            data-sidebar="menu-button"
            className="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 h-14 cursor-pointer"
            onClick={handleRowClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRowClick();
              }
            }}
          >
            <Checkbox
              checked={isSelected}
              disabled={isDeleting}
              className="shrink-0 pointer-events-none"
              tabIndex={-1}
            />
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="truncate font-medium text-sm leading-none">{conversation.title}</span>
              <span className="text-xs text-muted-foreground leading-none">
                {formatDistanceToNow(new Date(conversation.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        ) : (
          <SidebarMenuButton asChild isActive={isActive} disabled={isDeleting}>
            <ProtectedConversationLink
              conversationId={conversation.id}
              conversationTitle={conversation.title}
              className="py-2 px-2"
            >
              {isDeleting && <Loader className="size-4 shrink-0 animate-spin" />}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="truncate font-medium text-sm leading-none">{conversation.title}</span>
                <span className="text-xs text-muted-foreground leading-none">
                  {formatDistanceToNow(new Date(conversation.updatedAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </ProtectedConversationLink>
          </SidebarMenuButton>
        )}
        {!selectionMode && (
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
            <DeleteConversationDialog
              mode="single"
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
        )}
      </SidebarMenuItem>
    );
  }
);

ConversationItem.displayName = "ConversationItem";
