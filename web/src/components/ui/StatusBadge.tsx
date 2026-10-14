import React from "react";
import { Clock, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "./Badge";

export interface StatusBadgeProps {
  status: "queued" | "processing" | "completed" | "failed" | "abstained" | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  switch (status.toLowerCase()) {
    case "queued":
      return (
        <Badge variant="outline" className={className}>
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>Queued</span>
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="mist" className={className}>
          <Loader2 className="h-3 w-3 animate-spin text-[#2B7A78]" aria-hidden="true" />
          <span>Processing</span>
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="low" className={className}>
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          <span>Completed</span>
        </Badge>
      );
    case "abstained":
      return (
        <Badge variant="moderate" className={className}>
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          <span>Abstained</span>
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="severe" className={className}>
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          <span>Failed</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="default" className={className}>
          <span>{status}</span>
        </Badge>
      );
  }
}
