"use client";

import React, { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error cleanly
    console.error("SkinSentry UI Runtime Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center space-y-4">
          <p className="font-mono text-sm uppercase tracking-wider text-[#B42318] font-bold">
            System Error
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Application Exception</h1>
          <p className="text-xs text-[#17252A]/70 leading-relaxed">
            An unexpected error occurred while rendering the clinical interface.
          </p>
          <div className="pt-2">
            <Button variant="primary" size="md" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
