"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ImageOff, AlertCircle, Loader } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface ImageLightboxProps {
  imageUrl: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, alt, open, onClose }: ImageLightboxProps) {
  const isMobile = useIsMobile();
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleImageError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setHasError(false);
      setIsLoading(true);
    }
    onClose();
  }, [onClose]);

  const ImageContent = () => (
    <>
      {!hasError ? (
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src={imageUrl}
            alt={alt}
            width={1920}
            height={1080}
            className="w-full h-auto object-contain rounded-lg"
            style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: isMobile ? 'calc(70vh - 6rem)' : 'calc(90vh - 2rem)' }}
            unoptimized
            priority
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
              <Loader className="size-5 text-primary animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div className="relative w-full h-full flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center max-w-md bg-muted/50 backdrop-blur-sm p-8 rounded-xl border border-border/60">
            <div className="relative">
              <ImageOff className="size-16 text-muted-foreground/40" />
              <AlertCircle className="absolute -top-2 -right-2 size-6 text-destructive/60" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">
                Image Unavailable
              </p>
              <p className="text-sm text-muted-foreground">
                The image could not be loaded. It may have been removed or the link is broken.
              </p>
              {alt && alt !== "Search result image" && (
                <p className="text-xs text-muted-foreground/70 italic mt-4">
                  {alt}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
  
  if (isMobile) {
    return (
      <Drawer open={open && !!imageUrl} onOpenChange={handleOpenChange}>
        <DrawerContent className="h-[80vh] p-4 pb-8">
          <DrawerTitle className="sr-only">{alt}</DrawerTitle>
          {imageUrl && <ImageContent />}
        </DrawerContent>
      </Drawer>
    );
  }
  
  return (
    <Dialog open={open && !!imageUrl} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-7xl max-h-[90vh] p-4 border-0 bg-transparent shadow-none w-fit h-fit">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {imageUrl && <ImageContent />}
      </DialogContent>
    </Dialog>
  );
}
