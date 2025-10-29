"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ImageLightbox } from "./imageLightbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface SearchImage {
  url: string;
  description?: string;
}

interface SearchImagesProps {
  images: SearchImage[];
  maxDisplay?: number;
}

interface ImageCardProps {
  image: SearchImage;
  index: number;
  onClick: () => void;
  showOverlay?: React.ReactNode;
  showDescription?: boolean;
  sizes?: string;
}

function ImageCard({ image, index, onClick, showOverlay, showDescription = true, sizes = "(max-width: 640px) 50vw, 25vw" }: ImageCardProps) {
  return (
    <div
      className="group relative aspect-video rounded-lg overflow-hidden border border-border/60 bg-muted/30 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md"
      onClick={onClick}
    >
      <Image
        src={image.url}
        alt={image.description || `Search result ${index + 1}`}
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-105"
        sizes={sizes}
        unoptimized
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {showOverlay}
      
      {showDescription && image.description && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-white text-xs line-clamp-2">
            {image.description}
          </p>
        </div>
      )}
    </div>
  );
}

export function SearchImages({ images, maxDisplay = 4 }: SearchImagesProps) {
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [showAllImages, setShowAllImages] = useState(false);
  const isMobile = useIsMobile();

  const handleImageSelect = useCallback((url: string, description?: string) => {
    setSelectedImage({ url, alt: description || "Search result image" });
  }, []);

  const handleShowAll = useCallback(() => {
    setShowAllImages(true);
  }, []);

  const handleImageClickFromSheet = useCallback((url: string, description?: string) => {
    handleImageSelect(url, description);
  }, [handleImageSelect]);

  const handleCloseLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

  if (!images?.length) {
    return null;
  }

  const displayImages = images.slice(0, maxDisplay);
  const remainingCount = images.length - maxDisplay;
  const hasMoreImages = remainingCount > 0;

  return (
    <>
      <div className="not-prose my-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {displayImages.map((image, index) => {
            const isLastImage = index === maxDisplay - 1;
            const shouldShowOverlay = isLastImage && hasMoreImages;
            
            return (
              <ImageCard
                key={`preview-${image.url}-${index}`}
                image={image}
                index={index}
                onClick={() => shouldShowOverlay ? handleShowAll() : handleImageSelect(image.url, image.description)}
                showDescription={!shouldShowOverlay}
                showOverlay={
                  shouldShowOverlay ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                      <span className="text-white text-lg font-semibold">
                        +{remainingCount}
                      </span>
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground mt-2">
          {images.length} {images.length === 1 ? 'image' : 'images'} from search results
        </p>
      </div>

      {isMobile ? (
        <Drawer open={showAllImages} onOpenChange={setShowAllImages}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerTitle className="text-center py-4">
              All Images ({images.length})
            </DrawerTitle>
            <div className="overflow-y-auto pb-4">
              <div className="grid grid-cols-2 gap-4 px-4">
                {images.map((image, index) => (
                  <ImageCard
                    key={`sheet-${image.url}-${index}`}
                    image={image}
                    index={index}
                    onClick={() => handleImageClickFromSheet(image.url, image.description)}
                    sizes="50vw"
                  />
                ))}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showAllImages} onOpenChange={setShowAllImages}>
          <DialogContent className="max-h-[70vh] overflow-hidden flex flex-col p-6">
            <DialogTitle>All Images ({images.length})</DialogTitle>
            <div className="overflow-y-auto flex-1 -mx-2">
              <div className="grid grid-cols-2 gap-4 px-2">
                {images.map((image, index) => (
                  <ImageCard
                    key={`dialog-${image.url}-${index}`}
                    image={image}
                    index={index}
                    onClick={() => handleImageClickFromSheet(image.url, image.description)}
                    sizes="(max-width: 1024px) 33vw, 25vw"
                  />
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <ImageLightbox
        imageUrl={selectedImage?.url || ""}
        alt={selectedImage?.alt || ""}
        open={!!selectedImage}
        onClose={handleCloseLightbox}
      />
    </>
  );
}
