"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { PermanentDisclaimer } from "../ui/PermanentDisclaimer";

interface PublicConfig {
  organisationName: string;
  contactEmail: string;
  governingLaw: string;
}

export function Footer() {
  const [config, setConfig] = useState<PublicConfig>({
    organisationName: "SkinSentry Health Support",
    contactEmail: "support@skinsentry.local",
    governingLaw: "India",
  });

  useEffect(() => {
    let mounted = true;
    apiClient<PublicConfig>("/config/public", { skipAuth: true })
      .then((data) => {
        if (mounted && data) {
          setConfig({
            organisationName: data.organisationName || "SkinSentry Health Support",
            contactEmail: data.contactEmail || "support@skinsentry.local",
            governingLaw: data.governingLaw || "India",
          });
        }
      })
      .catch(() => {
        // Fallback defaults in place
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <footer className="mt-auto border-t border-[#17252A]/15 bg-[#FEFFFF] text-[#17252A]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <PermanentDisclaimer />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#17252A]/10 pt-6 text-xs text-[#17252A]/70">
          <div>
            <p>
              &copy; 2026 {config.organisationName}. Governing law: {config.governingLaw}.
            </p>
            <p className="mt-0.5">
              Contact:{" "}
              <a href={`mailto:${config.contactEmail}`} className="text-[#2B7A78] underline">
                {config.contactEmail}
              </a>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <Link href="/privacy" className="hover:text-[#2B7A78] underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[#2B7A78] underline">
              Terms of Service
            </Link>
            <Link href="/performance" className="hover:text-[#2B7A78] underline">
              Model Performance
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
