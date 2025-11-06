"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SingleDeleteProps {
  mode: "single";
  conversationId: string;
  conversationTitle: string;
  onDelete: (id: string) => void;
  trigger?: React.ReactNode;
}

interface BulkDeleteProps {
  mode: "bulk";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: () => void;
}

type DeleteConversationDialogProps = (SingleDeleteProps | BulkDeleteProps) & {
  isDeleting?: boolean;
};

export function DeleteConversationDialog(props: DeleteConversationDialogProps) {
  const { mode, isDeleting = false } = props;

  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = mode === "bulk" ? props.open : internalOpen;
  const setOpen = mode === "bulk" ? props.onOpenChange : setInternalOpen;

  const handleConfirm = () => {
    if (mode === "single") {
      props.onDelete(props.conversationId);
    } else {
      props.onConfirm();
    }
    setOpen(false);
  };

  const title = mode === "single" ? "Delete conversation" : "Delete conversations";
  const description =
    mode === "single"
      ? `Are you sure you want to delete "${props.conversationTitle}"? This action cannot be undone.`
      : `Are you sure you want to delete ${props.selectedCount} conversation${props.selectedCount === 1 ? "" : "s"}? This action cannot be undone.`;

  const dialogContent = (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleConfirm}
          disabled={isDeleting}
        >
          Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  if (mode === "single") {
    return (
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {props.trigger || (
            <Button variant="ghost" size="sm" className="text-destructive">
              Delete
            </Button>
          )}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {dialogContent}
    </Dialog>
  );
}
