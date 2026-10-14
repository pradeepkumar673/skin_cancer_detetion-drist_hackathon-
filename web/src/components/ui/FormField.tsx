import React from "react";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5 text-left", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold tracking-wide text-[#17252A]"
      >
        {label}
        {required && <span className="ml-1 text-[#B42318]">*</span>}
      </label>

      {children}

      {hint && !error && (
        <p className="text-xs text-[#17252A]/60 leading-normal">{hint}</p>
      )}

      {error && (
        <p className="text-xs font-medium text-[#B42318] leading-normal" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
