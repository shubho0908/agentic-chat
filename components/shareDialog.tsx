"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Copy, Check, Globe, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ExportSection } from "@/components/export/exportSection";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
  conversationId: string;
  isPublic: boolean;
  onToggleSharing: (id: string, isPublic: boolean) => void;
  isToggling?: boolean;
  trigger?: React.ReactNode;
}

export function ShareDialog({
  conversationId,
  isPublic,
  onToggleSharing,
  isToggling = false,
  trigger,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/share/${conversationId}`
    : "";

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleToggleSharing = () => {
    onToggleSharing(conversationId, !isPublic);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <Share2 className="mr-2 size-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share conversation</DialogTitle>
          <DialogDescription>
            {isPublic 
              ? "Anyone with the link can view this conversation"
              : "Make this conversation public to share it"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-5 py-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card/60 shadow-sm transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex items-center justify-center p-2 rounded-full transition-colors duration-300",
                isPublic 
                  ? "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400" 
                  : "bg-muted text-muted-foreground"
              )}>
                {isPublic ? (
                  <Globe className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium leading-none">
                  {isPublic ? "Public Access" : "Private Session"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isPublic 
                    ? "Anyone with the link can view"
                    : "Only you can access"
                  }
                </p>
              </div>
            </div>
            <Button
              variant={isPublic ? "outline" : "default"}
              size="sm"
              onClick={handleToggleSharing}
              disabled={isToggling}
              className="rounded-lg transition-all duration-200 ease-out active:scale-[0.98]"
            >
              {isToggling 
                ? "Updating..." 
                : isPublic 
                  ? "Make Private" 
                  : "Make Public"
              }
            </Button>
          </div>

          {isPublic && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label htmlFor="share-link" className="text-sm font-medium">
                  Share link
                </Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="share-link"
                    value={shareUrl}
                    readOnly
                    className="flex-1 cursor-pointer"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyLink}
                    className="shrink-0 transition-transform active:scale-95"
                  >
                    {copied ? (
                      <Check className="size-4 text-green-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link will be publicly accessible to anyone
                </p>
              </div>
            </>
          )}

          <Separator className="my-4" />

          <ExportSection 
            conversationId={conversationId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
