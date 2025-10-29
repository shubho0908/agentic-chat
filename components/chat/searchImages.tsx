"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageLightbox } from "./imageLightbox";

interface SearchImage {
  url: string;
  description?: string;
}

interface SearchImagesProps {
  images: SearchImage[];
  maxDisplay?: number;
}

export function SearchImages({ images, maxDisplay = 4 }: SearchImagesProps) {
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);

  if (!images || images.length === 0) {
    return null;
  }

  const displayImages = images.slice(0, maxDisplay);
  const remainingCount = images.length - maxDisplay;

  const handleImageClick = (url: string, description?: string) => {
    setSelectedImage({ url, alt: description || "Search result image" });
  };

  return (
    <>
      <div className="not-prose my-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {displayImages.map((image, index) => (
            <div
              key={`${image.url}-${index}`}
              className="group relative aspect-video rounded-lg overflow-hidden border border-border/60 bg-muted/30 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md"
              onClick={() => handleImageClick(image.url, image.description)}
            >
              <Image
                src={image.url}
                alt={image.description || `Search result ${index + 1}`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, 25vw"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {index === maxDisplay - 1 && remainingCount > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <span className="text-white text-lg font-semibold">
                    +{remainingCount}
                  </span>
                </div>
              )}
              
              {image.description && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-white text-xs line-clamp-2">
                    {image.description}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {images.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {images.length} {images.length === 1 ? 'image' : 'images'} from search results
          </p>
        )}
      </div>

      <ImageLightbox
        imageUrl={selectedImage?.url || ""}
        alt={selectedImage?.alt || ""}
        open={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}
