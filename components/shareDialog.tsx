"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Download, Globe2, LoaderCircle, LockKeyhole, Share2 } from "lucide-react";
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
import { toast } from "sonner";
import { ExportSection } from "@/components/export/exportSection";
import { buildShareUrl } from "@/lib/routes";
import { normalizeOrigin } from "@/lib/appUrl";

interface ShareDialogProps {
  conversationId: string;
  isPublic: boolean;
  onToggleSharing: (id: string, isPublic: boolean) => void;
  isToggling?: boolean;
  trigger?: React.ReactNode;
}

const subscribeToBrowserOrigin = () => () => {};

function getBrowserOriginSnapshot(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return normalizeOrigin(window.location.origin);
}

function getServerBrowserOriginSnapshot(): null {
  return null;
}

function updateDialogScrollIndicator(
  viewport: HTMLDivElement | null,
  thumb: HTMLDivElement | null
) {
  if (!viewport || !thumb) return;

  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  const trackHeight = Math.max(0, viewport.clientHeight - 8);
  const thumbHeight = maxScroll > 0
    ? Math.min(trackHeight, Math.max(56, (viewport.clientHeight / viewport.scrollHeight) * trackHeight))
    : 0;
  const thumbTop = maxScroll > 0 && trackHeight > thumbHeight
    ? 4 + (viewport.scrollTop / maxScroll) * (trackHeight - thumbHeight)
    : 0;

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${thumbTop}px)`;
  thumb.style.opacity = thumbHeight > 0 ? "1" : "0";
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
  const browserOrigin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    getBrowserOriginSnapshot,
    getServerBrowserOriginSnapshot,
  );
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollThumbRef = useRef<HTMLDivElement>(null);
  const shareUrl = browserOrigin ? buildShareUrl(conversationId, browserOrigin) : null;

  useEffect(() => () => clearTimeout(copiedTimeoutRef.current), []);

  useEffect(() => {
    if (!open) return;

    const viewport = scrollViewportRef.current;
    const content = scrollContentRef.current;
    if (!viewport || !content) return;

    const handleResize = () => updateDialogScrollIndicator(viewport, scrollThumbRef.current);
    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);

    return () => resizeObserver.disconnect();
  }, [open, isPublic]);

  const handleScrollThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = scrollViewportRef.current;
    const thumb = event.currentTarget;
    if (!viewport) return;

    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    if (maxScroll <= 0) return;

    event.preventDefault();
    thumb.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startScrollTop = viewport.scrollTop;
    const thumbRange = Math.max(1, viewport.clientHeight - 8 - thumb.offsetHeight);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      viewport.scrollTop = startScrollTop
        + ((moveEvent.clientY - startY) * maxScroll) / thumbRange;
    };
    const handlePointerUp = () => {
      thumb.removeEventListener("pointermove", handlePointerMove);
      thumb.removeEventListener("pointerup", handlePointerUp);
      thumb.removeEventListener("pointercancel", handlePointerUp);
      if (thumb.hasPointerCapture(event.pointerId)) {
        thumb.releasePointerCapture(event.pointerId);
      }
    };

    thumb.addEventListener("pointermove", handlePointerMove);
    thumb.addEventListener("pointerup", handlePointerUp);
    thumb.addEventListener("pointercancel", handlePointerUp);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      clearTimeout(copiedTimeoutRef.current);
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
      <DialogContent className="block max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden border border-black/10 bg-background/95 p-0 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.45)] supports-[backdrop-filter]:bg-background/90 dark:border-white/10 sm:max-w-[440px] sm:rounded-2xl sm:p-0">
        <div
          ref={scrollViewportRef}
          onScroll={() => updateDialogScrollIndicator(scrollViewportRef.current, scrollThumbRef.current)}
          className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain scrollbar-hide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:max-h-[calc(100dvh-2rem)]"
        >
          <div aria-hidden className="pointer-events-none sticky top-0 z-20 h-0 w-full">
            <div
              ref={scrollThumbRef}
              onPointerDown={handleScrollThumbPointerDown}
              className="pointer-events-auto absolute right-1 top-0 w-[5px] cursor-grab touch-none rounded-full bg-muted-foreground/60 opacity-0 shadow-sm transition-opacity active:cursor-grabbing"
            />
          </div>

          <div ref={scrollContentRef}>
            <DialogHeader className="relative p-3 pr-14 text-left min-[360px]:p-4 min-[360px]:pr-14 sm:p-5 sm:pr-16">
              <DialogTitle className="text-base font-semibold sm:text-lg">Share conversation</DialogTitle>
              <DialogDescription className="text-sm leading-5 sm:text-[15px]">
                {isPublic
                  ? "Anyone with the link can view this conversation."
                  : "Make this conversation public to share a link."}
              </DialogDescription>
            </DialogHeader>

            <div className="w-full self-stretch border-t border-border shadow-[1px_0_0_var(--border),-1px_0_0_var(--border)]" />

            <div className="p-3 min-[360px]:p-4 sm:p-5">
              <div className="flex flex-col gap-3 min-[360px]:flex-row min-[360px]:items-center">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  {isPublic ? <Globe2 className="size-4" /> : <LockKeyhole className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{isPublic ? "Public" : "Private"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPublic ? "Anyone with the link can view" : "Only you can view"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isPublic ? "outline" : "default"}
                  onClick={handleToggleSharing}
                  disabled={isToggling}
                  className="h-11 w-full shrink-0 gap-2 rounded-lg px-3 text-sm min-[360px]:w-auto sm:h-10 sm:text-[13px]"
                >
                  {isToggling ? <LoaderCircle className="size-4 animate-spin" /> : isPublic ? <LockKeyhole className="size-4" /> : <Globe2 className="size-4" />}
                  {isToggling ? "Updating…" : isPublic ? "Make private" : "Make public"}
                </Button>
              </div>

              {isPublic ? (
                <div className="mt-4 flex flex-col gap-2 min-[360px]:mt-5 min-[360px]:flex-row">
                  <Input
                    id={`share-link-${conversationId}`}
                    aria-label="Share link"
                    value={shareUrl ?? ""}
                    readOnly
                    disabled={!shareUrl}
                    className="h-11 w-full min-w-0 rounded-lg bg-muted/30 font-mono text-sm min-[360px]:flex-1 sm:h-10 sm:text-xs"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyLink}
                    aria-label="Copy link"
                    disabled={!shareUrl}
                    className="h-11 shrink-0 gap-2 rounded-lg px-4 text-sm sm:h-10 sm:px-3 sm:text-[13px]"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="w-full self-stretch border-t border-border shadow-[1px_0_0_var(--border),-1px_0_0_var(--border)]" />

            <div className="p-3 min-[360px]:p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Download className="size-4" aria-hidden="true" />
                <h3 className="text-sm font-medium">Download</h3>
              </div>
              <ExportSection conversationId={conversationId} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
