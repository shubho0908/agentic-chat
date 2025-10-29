"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ImageOff, AlertCircle, Loader } from "lucide-react";
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
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleImageError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!isLoading && !hasError) {
      onClick();
    }
  }, [isLoading, hasError, onClick]);

  return (
    <div
      className={`group relative aspect-video rounded-lg overflow-hidden border border-border/60 bg-muted/30 transition-all duration-200 ${
        !isLoading && !hasError ? 'cursor-pointer hover:border-primary/40 hover:shadow-md' : 'cursor-default'
      }`}
      onClick={handleClick}
    >
      {!hasError ? (
        <>
          <Image
            src={image.url}
            alt={image.description || `Search result ${index + 1}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes={sizes}
            unoptimized
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-muted/50 to-muted/80 backdrop-blur-sm">
              <Loader className="size-5 text-primary animate-spin" />
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-linear-to-br from-muted via-muted/90 to-muted/70 p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="relative">
              <ImageOff className="size-8 text-muted-foreground/40" />
              <AlertCircle className="absolute -top-1 -right-1 size-4 text-destructive/60" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Image unavailable
              </p>
              {image.description && (
                <p className="text-[10px] text-muted-foreground/70 line-clamp-2 max-w-[180px]">
                  {image.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {!hasError && !isLoading && (
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
      
      {showOverlay}
      
      {!hasError && !isLoading && showDescription && image.description && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-linear-to-t from-black/80 to-transparent">
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
                    onClick={() => handleImageSelect(image.url, image.description)}
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
                    onClick={() => handleImageSelect(image.url, image.description)}
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
