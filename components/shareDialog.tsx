"use client";

import { useState, useEffect } from "react";
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
  const shareUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/share/${conversationId}`
    : "";

  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copied]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
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
        
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Globe className="size-5 text-green-600" />
              ) : (
                <Lock className="size-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {isPublic ? "Public" : "Private"}
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
                    className="shrink-0"
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
