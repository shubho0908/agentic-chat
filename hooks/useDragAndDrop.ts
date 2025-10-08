import { useState, useCallback, useRef } from "react";

export interface DragState {
  isDraggingOver: boolean;
  isProcessing: boolean;
}

export interface UseDragAndDropOptions {
  onFilesDropped: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  currentFileCount?: number;
}

export function useDragAndDrop({
  onFilesDropped,
  disabled = false,
  maxFiles = 5,
  currentFileCount = 0,
}: UseDragAndDropOptions) {
  const [dragState, setDragState] = useState<DragState>({
    isDraggingOver: false,
    isProcessing: false,
  });

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setDragState((prev) => ({ ...prev, isDraggingOver: true }));
      }
    },
    [disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setDragState((prev) => ({ ...prev, isDraggingOver: false }));
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      dragCounterRef.current = 0;
      setDragState({
        isDraggingOver: false,
        isProcessing: true,
      });

      const files = Array.from(e.dataTransfer.files);
      
      if (files.length > 0) {
        const remainingSlots = maxFiles - currentFileCount;
        const filesToProcess = files.slice(0, remainingSlots);
        
        onFilesDropped(filesToProcess);
        
        setTimeout(() => {
          setDragState((prev) => ({ ...prev, isProcessing: false }));
        }, 300);
      } else {
        setDragState((prev) => ({ ...prev, isProcessing: false }));
      }
    },
    [disabled, onFilesDropped, maxFiles, currentFileCount]
  );

  const reset = useCallback(() => {
    dragCounterRef.current = 0;
    setDragState({
      isDraggingOver: false,
      isProcessing: false,
    });
  }, []);

  return {
    dragState,
    dropZoneRef,
    handlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    reset,
  };
}
