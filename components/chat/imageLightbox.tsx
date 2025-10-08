import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ImageLightboxProps {
  imageUrl: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, alt, open, onClose }: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] p-0 border-0 bg-transparent shadow-none">
        <div className="relative w-full h-full flex items-center justify-center">
          <Image
            src={imageUrl}
            alt={alt}
            width={1200}
            height={1200}
            className="object-contain max-w-full max-h-full rounded-lg"
            unoptimized
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
