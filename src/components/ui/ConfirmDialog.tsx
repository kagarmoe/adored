"use client";

import React from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmDialog = React.forwardRef<HTMLDivElement, ConfirmDialogProps>(
  (
    {
      open,
      title,
      message,
      danger = false,
      confirmLabel = "Confirm",
      cancelLabel = "Cancel",
      onConfirm,
      onCancel,
      loading = false,
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = React.useState(false);

    const handleConfirm = async () => {
      setIsLoading(true);
      try {
        await onConfirm();
      } finally {
        setIsLoading(false);
      }
    };

    if (!open) return null;

    return (
      <div
        ref={ref}
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel}></div>

        {/* Dialog */}
        <div className="relative bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 p-6 z-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
          <p className="text-gray-600 mb-6">{message}</p>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onCancel} disabled={loading || isLoading}>
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={handleConfirm}
              disabled={loading || isLoading}
            >
              {isLoading || loading ? "..." : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }
);
ConfirmDialog.displayName = "ConfirmDialog";

export { ConfirmDialog };
export type { ConfirmDialogProps };
