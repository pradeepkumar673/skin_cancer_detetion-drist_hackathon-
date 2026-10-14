"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock background scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#17252A]/50"
    >
      <div
        ref={dialogRef}
        style={{ borderRadius: "4px" }}
        className={cn(
          "relative w-full max-w-lg border border-[#17252A]/20 bg-[#FEFFFF] p-6 text-[#17252A] shadow-none",
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#17252A]/10 pb-3">
          <div>
            <h2 id="dialog-title" className="text-base font-semibold leading-none">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs text-[#17252A]/60 leading-normal">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ borderRadius: "4px" }}
            className="p-1 text-[#17252A]/60 hover:bg-[#DEF2F1] hover:text-[#17252A] focus-visible:outline-[#2B7A78]"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close dialog</span>
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
