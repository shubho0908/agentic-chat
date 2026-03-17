"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { ImageOff, AlertCircle, Loader, X } from "lucide-react";
import { useTheme } from "next-themes";
import { ImageLightbox } from "./imageLightbox";
import { getImageModalTheme } from "./imageModalTheme";
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

type ImageStatus = "loaded" | "error";

interface ImageCardProps {
  image: SearchImage;
  index: number;
  onClick: () => void;
  showOverlay?: React.ReactNode;
  showDescription?: boolean;
  sizes?: string;
  onStatusChange?: (url: string, status: ImageStatus) => void;
  className?: string;
  contentClassName?: string;
}

function getSearchImageKey(image: SearchImage) {
  return `${image.url}::${image.description ?? ""}`;
}

function ImageCard({
  image,
  index,
  onClick,
  showOverlay,
  showDescription = true,
  sizes = "(max-width: 640px) 50vw, 25vw",
  onStatusChange,
  className,
  contentClassName,
}: ImageCardProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleImageError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
    onStatusChange?.(image.url, "error");
  }, [image.url, onStatusChange]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    onStatusChange?.(image.url, "loaded");
  }, [image.url, onStatusChange]);

  const handleClick = useCallback(() => {
    if (!isLoading && !hasError) {
      onClick();
    }
  }, [isLoading, hasError, onClick]);

  return (
    <button
      type="button"
      className={`group relative aspect-video overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-all duration-200 ease-out ${
        !isLoading && !hasError ? 'cursor-pointer hover:border-primary/40 hover:shadow-lg active:scale-[0.98]' : 'cursor-default'
      } ${className ?? ""}`}
      onClick={handleClick}
      disabled={isLoading || hasError}
      aria-label={image.description || `Open search result image ${index + 1}`}
    >
      {!hasError ? (
        <>
          <Image
            src={image.url}
            alt={image.description || `Search result ${index + 1}`}
            fill
            className={`absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105 ${contentClassName ?? ""}`}
            sizes={sizes}
            unoptimized
            referrerPolicy="no-referrer"
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
    </button>
  );
}

export function SearchImages({ images, maxDisplay = 4 }: SearchImagesProps) {
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [showAllImages, setShowAllImages] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ url: string; alt: string } | null>(null);
  const [imageStatuses, setImageStatuses] = useState<Record<string, ImageStatus>>({});
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const modalTheme = getImageModalTheme(resolvedTheme);
  const mobilePanelClass = isMobile ? modalTheme.mobilePanel : modalTheme.panel;

  const handleImageStatusChange = useCallback((url: string, status: ImageStatus) => {
    setImageStatuses((current) => {
      if (current[url] === status) {
        return current;
      }

      return {
        ...current,
        [url]: status,
      };
    });
  }, []);

  const handleImageSelect = useCallback((url: string, description?: string) => {
    const nextSelection = { url, alt: description || "Search result image" };

    if (showAllImages) {
      setPendingSelection(nextSelection);
      setShowAllImages(false);
      return;
    }

    setSelectedImage(nextSelection);
  }, [showAllImages]);

  const handleShowAll = useCallback(() => {
    setShowAllImages(true);
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

  useEffect(() => {
    if (!showAllImages && pendingSelection) {
      setSelectedImage(pendingSelection);
      setPendingSelection(null);
    }
  }, [showAllImages, pendingSelection]);

  if (!images?.length) {
    return null;
  }

  const availableImages = images.filter((image) => imageStatuses[image.url] !== "error");
  const failedCount = images.length - availableImages.length;
  const visibleImages = availableImages.length > 0 ? availableImages : images;
  const displayImages = visibleImages.slice(0, maxDisplay);
  const remainingCount = visibleImages.length - maxDisplay;
  const hasMoreImages = remainingCount > 0;

  return (
    <>
      <div className="not-prose my-4 w-full max-w-full self-stretch">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {displayImages.map((image, index) => {
            const isLastImage = index === maxDisplay - 1;
            const shouldShowOverlay = isLastImage && hasMoreImages;
            
            return (
              <ImageCard
                key={getSearchImageKey(image)}
                image={image}
                index={index}
                onClick={() => shouldShowOverlay ? handleShowAll() : handleImageSelect(image.url, image.description)}
                showDescription={!shouldShowOverlay}
                onStatusChange={handleImageStatusChange}
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
          {visibleImages.length} {visibleImages.length === 1 ? 'image' : 'images'} from search results
          {failedCount > 0 ? ` • ${failedCount} unavailable hidden as they fail to load` : ""}
        </p>
      </div>

      {isMobile ? (
        <Drawer open={showAllImages} onOpenChange={setShowAllImages} shouldScaleBackground={false}>
          <DrawerContent
            variant="bare"
            showHandle={false}
            className="h-[100dvh] overflow-hidden border-0 bg-transparent p-0 shadow-none"
          >
            <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-t-[28px] border border-b-0 ${mobilePanelClass}`}>
              <div className="relative rounded-t-[inherit] px-4 py-3">
                <div className={`pointer-events-none absolute inset-x-4 bottom-0 border-b ${modalTheme.border}`} />
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <DrawerTitle className={`mt-1 text-left text-xl font-semibold ${modalTheme.title}`}>
                      All Images
                    </DrawerTitle>
                    <p className={`mt-1 text-sm ${modalTheme.mutedText}`}>
                      {visibleImages.length} results
                      {failedCount > 0 ? ` • ${failedCount} unavailable hidden` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAllImages(false)}
                    className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 ${modalTheme.closeButton}`}
                    aria-label="Close all images"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <div className="grid grid-cols-2 gap-3 p-3">
                {visibleImages.map((image, index) => (
                  <ImageCard
                    key={getSearchImageKey(image)}
                    image={image}
                    index={index}
                    onClick={() => handleImageSelect(image.url, image.description)}
                    sizes="50vw"
                    onStatusChange={handleImageStatusChange}
                    className={`aspect-[4/5] rounded-2xl ${modalTheme.galleryCard}`}
                    contentClassName="group-hover:scale-[1.03]"
                  />
                ))}
              </div>
            </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showAllImages} onOpenChange={setShowAllImages}>
          <DialogContent
            variant="bare"
            className="max-h-[92vh] w-[min(96vw,1240px)] max-w-[96vw] overflow-hidden border-0 bg-transparent p-0 shadow-none"
            showCloseButton={false}
          >
            <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border ${modalTheme.panel}`}>
              <div className="relative rounded-t-[inherit] px-4 py-3 sm:px-5">
                <div className={`pointer-events-none absolute inset-x-4 bottom-0 border-b sm:inset-x-5 ${modalTheme.border}`} />
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <DialogTitle className={`mt-1 text-2xl font-semibold ${modalTheme.title}`}>
                      All Images
                    </DialogTitle>
                    <p className={`mt-1 text-sm ${modalTheme.mutedText}`}>
                      {visibleImages.length} results
                      {failedCount > 0 ? ` • ${failedCount} unavailable hidden` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAllImages(false)}
                    className={`inline-flex size-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 ${modalTheme.closeButton}`}
                    aria-label="Close all images"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {visibleImages.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visibleImages.map((image, index) => (
                      <ImageCard
                        key={getSearchImageKey(image)}
                        image={image}
                        index={index}
                        onClick={() => handleImageSelect(image.url, image.description)}
                        sizes="(max-width: 768px) 90vw, (max-width: 1280px) 42vw, 30vw"
                        onStatusChange={handleImageStatusChange}
                        className={`aspect-[16/10] rounded-[22px] ${modalTheme.galleryCard}`}
                        contentClassName="group-hover:scale-[1.03]"
                      />
                    ))}
                  </div>
                ) : (
                  <div className={`flex min-h-[280px] items-center justify-center rounded-3xl border border-dashed ${modalTheme.emptyState}`}>
                    <p className={`max-w-sm text-center text-sm ${modalTheme.mutedText}`}>
                      Search results returned image links, but none of them are loading reliably right now.
                    </p>
                  </div>
                )}
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
