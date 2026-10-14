import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError = false, disabled, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        disabled={disabled}
        style={{ borderRadius: "4px" }}
        className={cn(
          "w-full border bg-[#FEFFFF] px-3 py-2 text-sm text-[#17252A] transition-colors duration-150 placeholder:text-[#17252A]/40",
          "focus-visible:outline-2 focus-visible:outline-[#2B7A78] focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:bg-[#DEF2F1]/50 disabled:opacity-60",
          hasError
            ? "border-[#B42318] focus-visible:outline-[#B42318]"
            : "border-[#17252A]/20 hover:border-[#17252A]/40",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
