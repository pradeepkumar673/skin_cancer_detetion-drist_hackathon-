import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "low" | "moderate" | "high" | "severe" | "mist" | "outline";
}

export function Badge({ children, className, variant = "default", ...props }: BadgeProps) {
  const variantStyles = {
    default: "border-[#17252A]/20 bg-[#17252A]/10 text-[#17252A]",
    low: "border-[#1E6B3A] bg-[#1E6B3A]/12 text-[#1E6B3A]",
    moderate: "border-[#8A5A00] bg-[#8A5A00]/12 text-[#8A5A00]",
    high: "border-[#B54708] bg-[#B54708]/12 text-[#B54708]",
    severe: "border-[#B42318] bg-[#B42318]/12 text-[#B42318]",
    mist: "border-[#2B7A78]/30 bg-[#DEF2F1] text-[#17252A]",
    outline: "border-[#17252A]/30 bg-transparent text-[#17252A]",
  };

  return (
    <span
      style={{ borderRadius: "4px" }}
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium tracking-wide",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
