"use client";

import { use, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader, Lock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChatContainer } from "@/components/chat/chatContainer";
import { type Message, type Attachment } from "@/lib/schemas/chat";
import { useLayout } from "@/components/providers/layoutProvider";
import { convertDbMessagesToFrontend, flattenMessageTree } from "@/lib/message-utils";

interface SharedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  siblingIndex: number;
  attachments?: Attachment[];
  versions?: SharedMessage[];
}

interface SharedConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string | null;
    email: string;
  };
  messages: SharedMessage[];
}

async function fetchSharedConversation(conversationId: string): Promise<SharedConversation> {
  const response = await fetch(`/api/share/${conversationId}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("NOT_FOUND");
    }
    if (response.status === 403) {
      throw new Error("PRIVATE");
    }
    throw new Error("FAILED_TO_FETCH");
  }
  
  return response.json();
}

export default function SharedConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { setShowSidebar } = useLayout();
  
  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(true);
  }, [setShowSidebar]);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-conversation", id],
    queryFn: () => fetchSharedConversation(id),
    retry: false,
  });

  const messages: Message[] = useMemo(() => {
    if (!data?.messages) return [];
    const dbMessages = convertDbMessagesToFrontend(data.messages);
    return flattenMessageTree(dbMessages);
  }, [data?.messages]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="size-5 animate-spin" />
          <span>Loading conversation...</span>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = (error as Error).message;
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center justify-center space-y-8 text-center max-w-md px-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 blur-3xl rounded-full" />
            <div className="relative bg-muted/50 p-8 rounded-3xl border border-border/40">
              <Lock className="size-20 text-muted-foreground/60" strokeWidth={1.5} />
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {errorMessage === "PRIVATE" 
                ? "This Conversation is Private"
                : errorMessage === "NOT_FOUND"
                  ? "Conversation Not Found"
                  : "Failed to Load Conversation"
              }
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {errorMessage === "PRIVATE"
                ? "This conversation is not publicly shared or the owner has made it private. Only the owner can access private conversations."
                : errorMessage === "NOT_FOUND"
                  ? "The conversation you're looking for doesn't exist or has been deleted. It may have been removed by the owner."
                  : "Something went wrong while loading this conversation. Please try again later."
              }
            </p>
          </div>

          <Button
            asChild
            size="lg"
            className="gap-2 rounded-xl min-w-[160px]"
          >
            <Link href="/">
              <ArrowLeft className="size-4" />
              Go Home
            </Link>
          </Button>

          <p className="text-xs text-muted-foreground/60 mt-4">
            If you believe this is an error, please contact the conversation owner.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-12 sm:h-14 items-center justify-between px-3 sm:px-4 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button variant="ghost" size="sm" className="shrink-0" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate max-w-[120px] xs:max-w-[180px] sm:max-w-[300px] md:max-w-md">
                {data.title}
              </h1>
              <p className="text-xs text-muted-foreground hidden xs:block">Shared conversation</p>
            </div>
          </div>
          <Button asChild variant="default" size="sm" className="shrink-0 text-xs sm:text-sm">
            <Link href="/">
              <span className="hidden sm:inline">Start Your Own Chat</span>
              <span className="sm:hidden">Start Chat</span>
            </Link>
          </Button>
        </div>
      </div>
      <ChatContainer 
        messages={messages} 
        isLoading={false}
        userName={data.user.name || data.user.email.split('@')[0]}
      />
    </div>
  );
}
