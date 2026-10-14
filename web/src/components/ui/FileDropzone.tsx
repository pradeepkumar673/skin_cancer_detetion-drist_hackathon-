"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileDropzoneProps {
  onFileSelect: (file: File | null) => void;
  maxMb?: number;
  accept?: string;
  className?: string;
  disabled?: boolean;
}

export function FileDropzone({
  onFileSelect,
  maxMb = 10,
  accept = "image/jpeg,image/png,image/webp",
  className,
  disabled = false,
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);

    // Size check
    if (file.size > maxMb * 1024 * 1024) {
      setError(`File size exceeds maximum allowed size of ${maxMb}MB.`);
      return;
    }

    // Type check
    const allowed = accept.split(",").map((t) => t.trim().toLowerCase());
    if (!allowed.includes(file.type.toLowerCase())) {
      setError("Unsupported file format. Please upload a JPEG or PNG image.");
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    onFileSelect(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled && inputRef.current) {
            inputRef.current.click();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            inputRef.current?.click();
          }
        }}
        style={{ borderRadius: "4px" }}
        className={cn(
          "relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center border-2 border-dashed p-6 text-center transition-colors duration-150",
          dragOver ? "border-[#2B7A78] bg-[#DEF2F1]/50" : "border-[#17252A]/20 bg-[#FEFFFF]",
          disabled && "cursor-not-allowed opacity-50",
          error ? "border-[#B42318]" : "hover:border-[#2B7A78]"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        {selectedFile && previewUrl ? (
          <div className="relative flex flex-col items-center gap-2">
            <div className="relative h-28 w-28 overflow-hidden border border-[#17252A]/20 bg-[#DEF2F1]" style={{ borderRadius: "4px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Lesion preview" className="h-full w-full object-cover" />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#17252A]">
              <span className="max-w-[200px] truncate">{selectedFile.name}</span>
              <span className="font-mono text-[#17252A]/60">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="p-1 text-[#B42318] hover:bg-[#B42318]/10"
                style={{ borderRadius: "4px" }}
                title="Remove photo"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove photo</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className="h-8 w-8 text-[#2B7A78]" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#17252A]">
                Drag and drop clinical photo, or <span className="text-[#2B7A78] underline">browse</span>
              </p>
              <p className="text-xs text-[#17252A]/60">
                JPEG, PNG or WebP up to {maxMb}MB. Minimum resolution 64x64px.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs font-medium text-[#B42318]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
