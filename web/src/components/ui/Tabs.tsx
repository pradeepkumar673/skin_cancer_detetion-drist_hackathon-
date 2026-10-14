"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, activeId, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex border-b border-[#17252A]/15 gap-2", className)}>
      {items.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{ borderRadius: "4px 4px 0 0" }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-[#2B7A78]",
              isActive
                ? "border-b-2 border-[#2B7A78] text-[#2B7A78] font-semibold bg-[#DEF2F1]/30"
                : "text-[#17252A]/60 hover:text-[#17252A] hover:bg-[#DEF2F1]/20"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
