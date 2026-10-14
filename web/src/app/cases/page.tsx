"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PlusCircle, Calendar, Tag, MapPin, ArrowRight } from "lucide-react";

interface CaseItem {
  id: string;
  bodySite: string;
  lesionLabel?: string;
  status: "queued" | "processing" | "completed" | "failed" | "abstained";
  createdAt: string;
  followUpAt?: string;
  analysis?: {
    cancerRiskBand?: string;
    ulcerTrajectory?: string;
    overallDecision?: string;
  };
}

export default function CasesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(() => {
    apiClient<{ cases: CaseItem[] }>("/cases")
      .then((res) => {
        setCases(res.cases || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load your screening cases.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isAuthenticated) {
      loadCases();
    }
  }, [authLoading, isAuthenticated, router, loadCases]);

  // Group cases by lesionLabel (or "Unlabeled Spots")
  const groupedCases = cases.reduce<Record<string, CaseItem[]>>((acc, item) => {
    const label = item.lesionLabel?.trim() || "Unlabeled Lesions";
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex-1">
        {/* Top Disclaimer */}
        <div className="border-b border-[#17252A]/10 bg-[#DEF2F1]/60 py-2.5">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PermanentDisclaimer />
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {/* Header Action Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#17252A]/10 pb-6 mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#17252A]">
                My Screening Cases
              </h1>
              <p className="mt-1 text-xs text-[#17252A]/70">
                Track skin lesions, wounds, and longitudinal monitoring over time.
              </p>
            </div>

            <Link href="/cases/new">
              <Button variant="primary" size="sm" className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                <span>New Screening Check</span>
              </Button>
            </Link>
          </div>

          {error && (
            <Alert variant="error" className="mb-6">
              {error}
            </Alert>
          )}

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-xs text-[#17252A]/70 font-mono">Loading cases from clinical records...</p>
            </div>
          ) : cases.length === 0 ? (
            /* Empty State */
            <Card className="border-dashed border-[#17252A]/20 bg-[#DEF2F1]/10 p-12 text-center">
              <div className="mx-auto max-w-md space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[4px] border border-[#2B7A78]/30 bg-[#DEF2F1] text-[#2B7A78]">
                  <Tag className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-[#17252A]">No Screening Cases Yet</h2>
                <p className="text-xs text-[#17252A]/80 leading-relaxed">
                  You have not submitted any skin photos for analysis. Start by uploading a clear
                  photo of a mole, wound, or rash. Using consistent labels (such as &ldquo;Left Shoulder Mole&rdquo;)
                  enables automated comparison over time.
                </p>
                <div className="pt-2">
                  <Link href="/cases/new">
                    <Button variant="primary" size="sm" className="inline-flex items-center gap-2">
                      <PlusCircle className="h-4 w-4" />
                      <span>Start Your First Check</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            /* Cases Grouped by Lesion Label */
            <div className="space-y-8">
              {Object.entries(groupedCases).map(([label, groupItems]) => (
                <div key={label} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[#17252A]/10 pb-2">
                    <Tag className="h-4 w-4 text-[#2B7A78]" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#17252A]">
                      {label}
                    </h2>
                    <span className="text-xs font-mono text-[#17252A]/60">
                      ({groupItems.length} {groupItems.length === 1 ? "entry" : "entries"})
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groupItems.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cases/${c.id}`}
                        className="block transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-[#2B7A78] rounded-[4px]"
                      >
                        <Card className="h-full hover:border-[#2B7A78] transition-colors duration-150">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs text-[#17252A]/70">
                                <MapPin className="h-3.5 w-3.5 text-[#2B7A78]" />
                                <span className="capitalize">{c.bodySite.replace("_", " ")}</span>
                              </div>
                              <StatusBadge status={c.status} />
                            </div>
                            <CardTitle className="text-sm mt-2 flex items-center justify-between">
                              <span>Case #{c.id.slice(-6)}</span>
                              <ArrowRight className="h-4 w-4 text-[#2B7A78]" />
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-xs space-y-2 pt-0">
                            <div className="flex items-center gap-1 text-[#17252A]/60">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                            </div>

                            {c.analysis?.cancerRiskBand && (
                              <div className="mt-2 border-t border-[#17252A]/10 pt-2 flex items-center justify-between">
                                <span className="text-[#17252A]/70">Cancer Risk:</span>
                                <span className="font-semibold uppercase text-xs">
                                  {c.analysis.cancerRiskBand}
                                </span>
                              </div>
                            )}

                            {c.analysis?.ulcerTrajectory && (
                              <div className="border-t border-[#17252A]/10 pt-1 flex items-center justify-between">
                                <span className="text-[#17252A]/70">Trajectory:</span>
                                <span className="font-semibold capitalize text-xs">
                                  {c.analysis.ulcerTrajectory}
                                </span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
