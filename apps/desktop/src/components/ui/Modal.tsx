import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@oos/ag-ui-ext";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Modal wrapper around `@oos/ag-ui-ext` Dialog for backward compatibility
 *
 * Maps legacy Modal API (isOpen, onClose) to Dialog API (open, onOpenChange)
 */
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-w-2xl", className)}>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
