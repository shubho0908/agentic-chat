"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DragState } from "@/hooks/useDragAndDrop";

interface DropZoneProps {
  dragState: DragState;
  disabled?: boolean;
  children: React.ReactNode;
  dropZoneRef: React.RefObject<HTMLDivElement | null>;
  handlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  className?: string;
}

export function DropZone({
  dragState,
  disabled,
  children,
  dropZoneRef,
  handlers,
  className,
}: DropZoneProps) {
  const { isDraggingOver } = dragState;

  return (
    <div
      ref={dropZoneRef}
      {...handlers}
      className={cn(
        "relative",
        className
      )}
    >
      {children}

      <AnimatePresence>
        {isDraggingOver && !disabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 pointer-events-none rounded-2xl"
          >
            <div className="absolute inset-0 rounded-3xl border-2 border-dashed border-primary/30 bg-primary/5" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
