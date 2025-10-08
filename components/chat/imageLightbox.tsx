"use client";

import Image from "next/image";
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
  
  if (isMobile) {
    return (
      <Drawer open={open && !!imageUrl} onOpenChange={onClose}>
        <DrawerContent className="h-[80vh] p-4 pb-8">
          <DrawerTitle className="sr-only">{alt}</DrawerTitle>
          {imageUrl && (
            <div className="relative w-full h-full flex items-center justify-center">
              <Image
                src={imageUrl}
                alt={alt}
                width={1920}
                height={1080}
                className="w-full h-auto max-h-[calc(70vh-6rem)] object-contain rounded-lg"
                style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'calc(70vh - 6rem)' }}
                unoptimized
                priority
              />
            </div>
          )}
        </DrawerContent>
      </Drawer>
    );
  }
  
  return (
    <Dialog open={open && !!imageUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-7xl max-h-[90vh] p-4 border-0 bg-transparent shadow-none w-fit h-fit">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {imageUrl && (
          <div className="relative w-full max-h-[calc(90vh-2rem)] flex items-center justify-center">
            <Image
              src={imageUrl}
              alt={alt}
              width={1920}
              height={1080}
              className="w-full h-auto max-h-[calc(90vh-2rem)] object-contain rounded-lg"
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'calc(90vh - 2rem)' }}
              unoptimized
              priority
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
