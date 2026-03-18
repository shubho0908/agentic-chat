"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ImageOff, AlertCircle, Loader, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/useMobile";
import { getImageModalTheme, type ImageModalTheme } from "./imageModalTheme";

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
  theme: ImageModalTheme;
}

function LightboxStage({ imageUrl, alt, caption, isMobile, onClose, theme }: LightboxStageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const panelClass = isMobile ? theme.mobilePanel : theme.panel;

  const handleImageError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden border ${panelClass} ${isMobile ? "h-full rounded-t-[28px] border-b-0" : "w-fit max-w-[96vw] rounded-[24px]"}`}
    >
      <div className="relative rounded-t-[inherit] px-4 py-3 sm:px-5">
        <div className={`pointer-events-none absolute inset-x-4 bottom-0 border-b sm:inset-x-5 ${theme.border}`} />
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={`truncate text-sm ${theme.mutedText}`}>
              {caption}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 ${theme.closeButton}`}
            aria-label="Close image viewer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!hasError ? (
        <div
          className={`relative flex items-center justify-center ${theme.imageFrame} ${isMobile ? "min-h-0 flex-1 p-3" : "p-2 sm:p-3"}`}
        >
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
            <div
              className={`absolute flex items-center justify-center rounded-2xl ${theme.loadingOverlay} ${isMobile ? "inset-3" : "inset-2 sm:inset-3"}`}
            >
              <Loader className={`size-5 animate-spin ${theme.loader}`} />
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex flex-1 items-center justify-center p-8">
          <div className={`flex max-w-md flex-col items-center gap-4 rounded-2xl border p-8 text-center backdrop-blur-sm ${theme.errorCard}`}>
            <div className="relative">
              <ImageOff className={`size-16 ${theme.errorIcon}`} />
              <AlertCircle className={`absolute -top-2 -right-2 size-6 ${theme.errorAccent}`} />
            </div>
            <div className="space-y-2">
              <p className={`text-lg font-semibold ${theme.title}`}>
                Image Unavailable
              </p>
              <p className={`text-sm ${theme.errorMutedText}`}>
                The image could not be loaded. It may have been removed or the link is broken.
              </p>
              {alt && alt !== "Search result image" && (
                <p className={`mt-4 text-xs italic ${theme.mutedText}`}>
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
  const { resolvedTheme } = useTheme();
  const hasImage = open && !!imageUrl;
  const theme = getImageModalTheme(resolvedTheme);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      onClose();
    }
  }, [onClose]);

  const caption = alt && alt !== "Search result image" ? alt : "Web search image";
  
  if (isMobile) {
    return (
      <Drawer open={hasImage} onOpenChange={handleOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          variant="bare"
          showHandle={false}
          className="h-[100dvh] overflow-hidden border-0 bg-transparent p-0 shadow-none"
        >
          <DrawerTitle className="sr-only">{alt}</DrawerTitle>
          {imageUrl && (
            <LightboxStage
              key={imageUrl}
              imageUrl={imageUrl}
              alt={alt}
              caption={caption}
              isMobile={isMobile}
              onClose={onClose}
              theme={theme}
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
            theme={theme}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
