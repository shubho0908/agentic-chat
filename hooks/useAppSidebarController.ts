"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useSidebar } from "@/components/ui/sidebar";
import { useStreaming } from "@/contexts/streaming-context";
import { useConversations } from "@/hooks/useConversations";
import { useSession } from "@/lib/authClient";

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

export function useAppSidebarController() {
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

  const conversationsState = useConversations({ enabled: !!session });
  const {
    conversations,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    deleteConversation,
    bulkDeleteConversations,
  } = conversationsState;

  // TanStack Virtual returns non-memoizable functions; this hook intentionally opts out.
  // eslint-disable-next-line react-hooks/incompatible-library
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
    if (conversations.length === 0) {
      return;
    }

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
  }, [conversations.length, isMobile, openMobile, virtualizer]);

  useEffect(() => {
    const scrollElement = parentRef.current;
    const loader = loaderRef.current;

    if (!scrollElement || !loader || conversations.length === 0 || !hasNextPage) {
      return;
    }

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
        rootMargin: "200px",
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
  }, [conversations.length, fetchNextPage, hasNextPage, isMobile, openMobile]);

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

  return {
    ...conversationsState,
    currentConversationId,
    deletingId,
    dispatchSelection,
    handleBulkDelete,
    handleConfirmNewChat,
    handleDeleteConversation,
    handleNewChat,
    handleToggleSelect,
    handleToggleSelectionMode,
    isMobile,
    loaderRef,
    logoSrc,
    openMobile,
    parentRef,
    selectedIds,
    selectionMode,
    session,
    setShowGuardDialog,
    showDeleteDialog,
    showGuardDialog,
    virtualizer,
  };
}
