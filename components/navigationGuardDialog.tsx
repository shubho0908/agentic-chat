"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface NavigationGuardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  destinationTitle?: string;
}

export function NavigationGuardDialog({
  open,
  onOpenChange,
  onConfirm,
  destinationTitle,
}: NavigationGuardDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="size-5 text-amber-500" />
            </div>
            <DialogTitle>Stop ongoing response?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {destinationTitle ? (
              <>
                A response is currently being generated. Switching to{" "}
                <span className="font-medium text-foreground">{destinationTitle}</span> will stop the
                ongoing response.
              </>
            ) : (
              "A response is currently being generated. Switching conversations will stop the ongoing response."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" variant="default" onClick={handleConfirm}>
            Switch conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
