"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const icons = {
            info: <Info className="h-4 w-4 text-[#2B7A78] shrink-0" />,
            success: <CheckCircle2 className="h-4 w-4 text-[#1E6B3A] shrink-0" />,
            warning: <AlertTriangle className="h-4 w-4 text-[#8A5A00] shrink-0" />,
            error: <AlertCircle className="h-4 w-4 text-[#B42318] shrink-0" />,
          };

          const borders = {
            info: "border-[#2B7A78]/30",
            success: "border-[#1E6B3A]/30",
            warning: "border-[#8A5A00]/30",
            error: "border-[#B42318]/30",
          };

          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 p-3 rounded-[4px] border bg-[#FEFFFF] text-sm text-[#17252A] shadow-none",
                borders[toast.variant]
              )}
            >
              {icons[toast.variant]}
              <span className="flex-1 text-xs leading-relaxed">{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-[#17252A]/50 hover:text-[#17252A] focus:outline-none focus:ring-2 focus:ring-[#2B7A78] rounded-[2px]"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
