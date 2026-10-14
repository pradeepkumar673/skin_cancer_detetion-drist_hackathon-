import React from "react";
import { ShieldAlert } from "lucide-react";

interface PermanentDisclaimerProps {
  className?: string;
}

/**
 * Mandatory clinical decision-support banner.
 *
 * Rule 10: UI always shows: "Decision support only. A normal or low-risk result never
 * proves there is no problem. A doctor makes the diagnosis."
 */
export function PermanentDisclaimer({ className = "" }: PermanentDisclaimerProps) {
  return (
    <div
      role="note"
      aria-label="Clinical Decision Support Notice"
      className={`flex items-start gap-3 border border-[#2B7A78]/30 bg-[#DEF2F1] p-3 text-sm text-[#17252A] ${className}`}
      style={{ borderRadius: "4px" }}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#2B7A78]" aria-hidden="true" />
      <p className="leading-snug">
        <strong className="font-semibold">Decision support only:</strong> A normal or low-risk result
        never proves there is no problem. A doctor makes the diagnosis.
      </p>
    </div>
  );
}
