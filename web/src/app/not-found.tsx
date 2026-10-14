import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center space-y-4">
          <p className="font-mono text-sm uppercase tracking-wider text-[#2B7A78] font-bold">
            404 Error
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Record Not Found</h1>
          <p className="text-xs text-[#17252A]/70 leading-relaxed">
            The requested page or clinical case does not exist or you do not have permission to access it.
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="primary" size="md">
                Return to Overview
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
