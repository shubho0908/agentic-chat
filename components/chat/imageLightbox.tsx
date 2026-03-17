"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ImageOff, AlertCircle, Loader, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface ImageLightboxProps {
  imageUrl: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

interface LightboxStageProps {
  imageUrl: string;
  alt: string;
  caption: string;
  isMobile: boolean;
  onClose: () => void;
}

function LightboxStage({ imageUrl, alt, caption, isMobile, onClose }: LightboxStageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleImageError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden border border-white/10 bg-neutral-950/92 text-white shadow-[0_20px_80px_rgba(0,0,0,0.45)] ${isMobile ? "h-full rounded-t-[28px] border-b-0" : "w-fit max-w-[96vw] rounded-[24px]"}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm text-white/80">
            {caption}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center p-0 text-white/80 transition hover:text-white"
          aria-label="Close image viewer"
        >
          <X className="size-4" />
        </button>
      </div>

      {!hasError ? (
        <div className={`relative flex items-center justify-center ${isMobile ? "min-h-0 flex-1 p-3" : "p-2 sm:p-3"}`}>
          <Image
            src={imageUrl}
            alt={alt}
            width={1600}
            height={1200}
            unoptimized
            priority
            referrerPolicy="no-referrer"
            className="h-auto w-auto max-w-full rounded-2xl object-contain"
            style={{
              maxWidth: isMobile ? "100%" : "min(92vw, 1200px)",
              maxHeight: isMobile ? "calc(100dvh - 8rem - env(safe-area-inset-bottom))" : "calc(90vh - 5rem)",
            }}
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
          {isLoading && (
            <div className={`absolute flex items-center justify-center rounded-2xl bg-black/35 backdrop-blur-sm ${isMobile ? "inset-3" : "inset-2 sm:inset-3"}`}>
              <Loader className="size-5 animate-spin text-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex flex-1 items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
            <div className="relative">
              <ImageOff className="size-16 text-white/35" />
              <AlertCircle className="absolute -top-2 -right-2 size-6 text-amber-300/75" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">
                Image Unavailable
              </p>
              <p className="text-sm text-white/65">
                The image could not be loaded. It may have been removed or the link is broken.
              </p>
              {alt && alt !== "Search result image" && (
                <p className="mt-4 text-xs italic text-white/50">
                  {alt}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ImageLightbox({ imageUrl, alt, open, onClose }: ImageLightboxProps) {
  const isMobile = useIsMobile();
  const hasImage = open && !!imageUrl;

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      onClose();
    }
  }, [onClose]);

  const caption = alt && alt !== "Search result image" ? alt : "Web search image";
  
  if (isMobile) {
    return (
      <Drawer open={hasImage} onOpenChange={handleOpenChange}>
        <DrawerContent className="h-[100dvh] overflow-hidden border-0 bg-transparent p-0 shadow-none">
          <DrawerTitle className="sr-only">{alt}</DrawerTitle>
          {imageUrl && (
            <LightboxStage
              key={imageUrl}
              imageUrl={imageUrl}
              alt={alt}
              caption={caption}
              isMobile={isMobile}
              onClose={onClose}
            />
          )}
        </DrawerContent>
      </Drawer>
    );
  }
  
  return (
    <Dialog open={hasImage} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        variant="bare"
        className="max-h-[92vh] overflow-visible border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {imageUrl && (
          <LightboxStage
            key={imageUrl}
            imageUrl={imageUrl}
            alt={alt}
            caption={caption}
            isMobile={isMobile}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
