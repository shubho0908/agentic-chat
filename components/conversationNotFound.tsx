"use client";

import { Plus, LogIn } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthModal } from "@/components/authModal";

interface ConversationNotFoundProps {
  isAuthenticated: boolean;
}

export function ConversationNotFound({ isAuthenticated }: ConversationNotFoundProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleNewChat = () => {
    router.push("/");
  };

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center justify-center space-y-8 text-center max-w-md px-6">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 blur-3xl rounded-full" />
          <div className="relative flex items-center justify-center">
              <Image
                src={theme === "dark" ? "/dark.png" : "/light.png"}
                alt="Agentic Chat"
                width={100}
                height={100}
                className="object-contain"
                priority
              />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Conversation Not Found
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            {isAuthenticated 
              ? "The conversation you're looking for doesn't exist or may have been deleted. Start a new conversation to continue chatting."
              : "This conversation is private or doesn't exist. Please sign in to access your conversations."}
          </p>
        </div>

        {isAuthenticated ? (
          <Button
            onClick={handleNewChat}
            size="lg"
            className="gap-2 rounded-xl min-w-[160px]"
          >
            <Plus className="size-4" />
            New Chat
          </Button>
        ) : (
          <Button
            onClick={handleLogin}
            size="lg"
            className="gap-2 rounded-xl min-w-[160px]"
          >
            <LogIn className="size-4" />
            Sign In
          </Button>
        )}

        <p className="text-xs text-muted-foreground/60 mt-4">
          If you believe this is an error, please try refreshing the page.
        </p>
      </div>
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}
