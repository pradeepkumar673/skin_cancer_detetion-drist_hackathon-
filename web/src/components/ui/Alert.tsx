import React from "react";
import { Info, AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "info" | "warning" | "error" | "disclaimer";
  title?: string;
}

export function Alert({ children, className, variant = "info", title, ...props }: AlertProps) {
  const configs = {
    info: {
      border: "border-[#2B7A78]/30",
      bg: "bg-[#DEF2F1]",
      text: "text-[#17252A]",
      icon: <Info className="h-4 w-4 shrink-0 text-[#2B7A78]" aria-hidden="true" />,
    },
    warning: {
      border: "border-[#8A5A00]",
      bg: "bg-[#8A5A00]/10",
      text: "text-[#17252A]",
      icon: <AlertTriangle className="h-4 w-4 shrink-0 text-[#8A5A00]" aria-hidden="true" />,
    },
    error: {
      border: "border-[#B42318]",
      bg: "bg-[#B42318]/10",
      text: "text-[#B42318]",
      icon: <AlertCircle className="h-4 w-4 shrink-0 text-[#B42318]" aria-hidden="true" />,
    },
    disclaimer: {
      border: "border-[#2B7A78]",
      bg: "bg-[#DEF2F1]",
      text: "text-[#17252A]",
      icon: <ShieldAlert className="h-4 w-4 shrink-0 text-[#2B7A78]" aria-hidden="true" />,
    },
  };

  const current = configs[variant];

  return (
    <div
      role="alert"
      style={{ borderRadius: "4px" }}
      className={cn("flex items-start gap-3 border p-4 text-sm leading-relaxed", current.border, current.bg, current.text, className)}
      {...props}
    >
      <div className="mt-0.5">{current.icon}</div>
      <div className="flex-1 space-y-1">
        {title && <h5 className="font-semibold">{title}</h5>}
        <div className="text-xs leading-normal opacity-90">{children}</div>
      </div>
    </div>
  );
}
