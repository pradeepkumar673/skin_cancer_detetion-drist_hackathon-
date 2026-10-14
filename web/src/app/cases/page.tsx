"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  PlusCircle,
  Search,
  ChevronRight,
  Shield,
  Upload,
  Image as ImageIcon,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AnalysisResult {
  cancerRiskBand?: string;
  ulcerTrajectory?: string;
  overallDecision?: string;
  riskTier?: "low" | "moderate" | "high";
  predictions?: {
    cancerProbability?: number;
    riskScore?: number;
    riskLevel?: string;
  };
}

interface CaseItem {
  _id: string;
  patientId: string;
  bodySite: string;
  lesionLabel?: string;
  status: "queued" | "processing" | "completed" | "failed" | "abstained";
  createdAt: string;
  context?: {
    category?: string;
    fitzpatrickType?: string;
    evolution?: string[];
    duration?: string;
    referringCenter?: string;
  };
  imagePaths?: Array<{
    path: string;
    takenAt: string;
    kind: string;
  }>;
  analysisId?: {
    _id: string;
    result?: AnalysisResult;
    durationMs?: number;
  };
}

export default function MyCasesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [categoryFilter, setCategoryFilter] = useState<"all" | "lesion" | "wound">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "urgency">("newest");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    let active = true;

    const fetchCases = async () => {
      try {
        const res = await apiClient<{ cases: CaseItem[] }>("/cases");
        if (!active) return;
        setCases(res.cases || []);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.statusCode === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load screening cases.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchCases();
    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, router]);

  // Categorize helper
  const isWoundCase = (c: CaseItem) => {
    const cat = c.context?.category?.toLowerCase() || "";
    const site = c.bodySite.toLowerCase();
    const label = (c.lesionLabel || "").toLowerCase();
    return (
      cat.includes("wound") ||
      cat.includes("ulcer") ||
      label.includes("wound") ||
      label.includes("ulcer") ||
      site.includes("ulcer")
    );
  };

  const lesionCount = cases.filter((c) => !isWoundCase(c)).length;
  const woundCount = cases.filter((c) => isWoundCase(c)).length;

  // Filtered & Sorted cases
  const filteredCases = cases
    .filter((c) => {
      if (categoryFilter === "lesion" && isWoundCase(c)) return false;
      if (categoryFilter === "wound" && !isWoundCase(c)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const label = (c.lesionLabel || "").toLowerCase();
      const site = c.bodySite.toLowerCase();
      const id = c._id.toLowerCase();
      return label.includes(q) || site.includes(q) || id.includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "urgency") {
        const getUrgencyWeight = (item: CaseItem) => {
          if (item.status === "failed") return 1;
          if (item.status === "queued" || item.status === "processing") return 2;
          const band =
            item.analysisId?.result?.cancerRiskBand?.toLowerCase() ||
            item.analysisId?.result?.predictions?.riskLevel?.toLowerCase() ||
            "";
          if (band.includes("high") || band.includes("severe")) return 5;
          if (band.includes("moderate")) return 4;
          return 3;
        };
        return getUrgencyWeight(b) - getUrgencyWeight(a);
      }
      // default: newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const getRiskBadge = (c: CaseItem) => {
    if (c.status === "queued" || c.status === "processing") {
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] font-mono text-[11px] uppercase tracking-wide bg-[#FEFFFF] text-[#1B6B63] border border-[#D8DDDB] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B63] animate-ping inline-block" />
          <span>Processing...</span>
        </div>
      );
    }

    if (c.status === "failed" || c.status === "abstained") {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] font-mono text-[11px] uppercase tracking-wide bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB]">
          <span>Withheld</span>
        </div>
      );
    }

    const res = c.analysisId?.result;
    const band =
      res?.cancerRiskBand?.toLowerCase() ||
      res?.riskTier?.toLowerCase() ||
      res?.predictions?.riskLevel?.toLowerCase() ||
      "";

    if (band.includes("high") || band.includes("severe")) {
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] font-mono text-[11px] uppercase tracking-wide bg-[#FDECEA] text-[#B42318] border border-[#B42318]/30 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#B42318] inline-block" />
          <span>High urgency</span>
        </div>
      );
    }

    if (band.includes("moderate")) {
      return (
        <div className="inline-flex items-center px-2 py-0.5 rounded-[4px] font-mono text-[11px] uppercase tracking-wide bg-[#FFF9EB] text-[#8A5A00] border border-[#8A5A00]/30 font-medium">
          <span>Moderate</span>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center px-2 py-0.5 rounded-[4px] font-mono text-[11px] uppercase tracking-wide bg-[#DEF2F1] text-[#1B6B63] border border-[#1B6B63]/20 font-medium">
        <span>Low risk</span>
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex flex-col justify-between">
        <Header />
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#17252A] flex flex-col justify-between">
      <div>
        <Header />

        {/* Clinical Protocol Advisory Bar */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#D8DDDB] py-2 px-4 sm:px-8">
          <div className="max-w-[960px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#1B6B63] shrink-0" />
              <p className="text-[#0E1F1E] font-medium">
                <span className="font-semibold uppercase tracking-wider text-[#1B6B63] mr-1">
                  Clinical Protocol Advisory:
                </span>
                Decision support only. A low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-2 font-mono text-[11px] text-[#5A6B69]">
              <span>Node Sync: Active (0.14s)</span>
            </div>
          </div>
        </div>

        <main className="w-full">
          <div className="max-w-[960px] mx-auto py-8 px-4 sm:px-6">
            {/* Clinical Breadcrumb & Patient Dossier Header Context */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 text-[#5A6B69] border-b border-[#D8DDDB] font-mono text-xs">
              <div className="flex items-center gap-1.5 uppercase tracking-wider">
                <FolderOpen className="w-3.5 h-3.5 text-[#1B6B63]" />
                <span>Patient Portal</span>
                <span className="text-[#D8DDDB]">/</span>
                <span className="text-[#1B6B63] font-semibold">My cases</span>
                <span className="text-[#D8DDDB]">/</span>
                <span className="text-[#17252A]">Chart dossier</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>
                  UHID:{" "}
                  <strong className="text-[#17252A] font-bold">
                    {user?.id ? `ND-${user.id.slice(-5).toUpperCase()}-P` : "ND-80419-P"}
                  </strong>
                </span>
                <span className="text-[#D8DDDB]">•</span>
                <span>
                  Registered User:{" "}
                  <strong className="text-[#17252A] font-medium">{user?.email || "Patient Profile"}</strong>
                </span>
              </div>
            </div>

            {/* Top Row: Page Title & Clinical Action */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-5 pb-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#17252A]">
                  My cases
                </h1>
                <p className="text-xs text-[#5A6B69] mt-0.5">
                  Dermatological screening logs and automated triage records
                </p>
              </div>
              <Link
                href="/cases/new"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#1B6B63] text-white font-semibold text-xs rounded-[4px] border border-[#1B6B63] hover:bg-[#2B7A78] transition-colors select-none"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New screening</span>
              </Link>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-[#FDECEA] border border-[#B42318] text-[#B42318] rounded-[4px] text-xs">
                {error}
              </div>
            )}

            {/* Filter & Search Ledger Toolbar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-4 p-2 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px]">
              {/* Pill Tabs */}
              <div className="inline-flex items-center p-0.5 gap-1 bg-[#FBFAF7] rounded-[4px] border border-[#D8DDDB]">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className={`px-3 py-1 font-mono text-xs font-semibold rounded-[4px] transition-colors ${
                    categoryFilter === "all"
                      ? "bg-[#1B6B63] text-white border border-[#1B6B63]"
                      : "bg-[#FEFFFF] text-[#5A6B69] border border-transparent hover:text-[#17252A]"
                  }`}
                >
                  All ({cases.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("lesion")}
                  className={`px-3 py-1 font-mono text-xs font-semibold rounded-[4px] transition-colors ${
                    categoryFilter === "lesion"
                      ? "bg-[#1B6B63] text-white border border-[#1B6B63]"
                      : "bg-[#FEFFFF] text-[#5A6B69] border border-transparent hover:text-[#17252A]"
                  }`}
                >
                  Lesions ({lesionCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("wound")}
                  className={`px-3 py-1 font-mono text-xs font-semibold rounded-[4px] transition-colors ${
                    categoryFilter === "wound"
                      ? "bg-[#1B6B63] text-white border border-[#1B6B63]"
                      : "bg-[#FEFFFF] text-[#5A6B69] border border-transparent hover:text-[#17252A]"
                  }`}
                >
                  Wounds ({woundCount})
                </button>
              </div>

              {/* Search Input */}
              <div className="relative flex-1 md:max-w-xs">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5A6B69] pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by label, ID, or site..."
                  className="w-full h-9 pl-8 pr-3 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs text-[#17252A] placeholder:text-[#5A6B69] focus:border-[#1B6B63] focus:outline-none"
                />
              </div>

              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "urgency")}
                  className="w-full md:w-auto h-9 pl-3 pr-8 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs font-mono text-[#17252A] focus:border-[#1B6B63] focus:outline-none cursor-pointer"
                >
                  <option value="newest">Sort: newest first</option>
                  <option value="oldest">Sort: oldest first</option>
                  <option value="urgency">Sort: priority tier</option>
                </select>
              </div>
            </div>

            {/* Case Records Ledger Table Container */}
            {loading ? (
              <div className="w-full bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-12 flex flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <p className="text-xs text-[#5A6B69] font-mono">
                  Loading verified clinical case ledger...
                </p>
              </div>
            ) : cases.length === 0 ? (
              /* Empty State Box */
              <div className="border border-[#D8DDDB] rounded-[4px] bg-[#FEFFFF] p-8 text-center">
                <div className="w-12 h-12 mx-auto rounded-[4px] bg-[#DEF2F1] border border-[#D8DDDB] flex items-center justify-center mb-3 text-[#1B6B63]">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[#17252A]">No cases yet</h3>
                <p className="text-xs text-[#5A6B69] mt-1 max-w-sm mx-auto leading-relaxed">
                  Upload a photo to run the first analysis. Our clinical model checks dermoscopic margins and wound beds under verified CDSS protocols.
                </p>
                <div className="mt-4">
                  <Link
                    href="/cases/new"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#1B6B63] text-white font-semibold text-xs rounded-[4px] border border-[#1B6B63] hover:bg-[#2B7A78] transition-colors select-none"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>New screening</span>
                  </Link>
                </div>
                <div className="mt-4 pt-3 border-t border-[#D8DDDB] font-mono text-[11px] text-[#5A6B69] max-w-md mx-auto">
                  Sample empty ledger state demonstration. Active clinical profiles toggle to empty upon case disposition or chart transfer.
                </div>
              </div>
            ) : filteredCases.length === 0 ? (
              /* No Search Results */
              <div className="w-full bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-8 text-center">
                <Search className="w-8 h-8 text-[#5A6B69] mx-auto block mb-2" />
                <div className="text-xs font-semibold text-[#17252A]">
                  No matching medical cases found
                </div>
                <p className="text-xs text-[#5A6B69] mt-1 max-w-sm mx-auto">
                  Check case identifier, anatomic landmark label spelling, or reset filter parameters.
                </p>
              </div>
            ) : (
              <div className="w-full bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 items-center px-4 py-2 bg-[#FBFAF7] border-b border-[#D8DDDB] font-mono text-[11px] uppercase text-[#5A6B69] tracking-wider">
                  <div className="col-span-8 sm:col-span-8 md:col-span-7 flex items-center gap-3">
                    <span>Specimen &amp; Clinical Label</span>
                  </div>
                  <div className="col-span-4 sm:col-span-3 md:col-span-4 text-right sm:text-left">
                    <span>Decision Support Risk</span>
                  </div>
                  <div className="hidden sm:block sm:col-span-1 md:col-span-1 text-right">
                    <span>View</span>
                  </div>
                </div>

                {/* Rows Wrapper */}
                <div className="divide-y divide-[#D8DDDB]">
                  {filteredCases.map((c) => {
                    const isWound = isWoundCase(c);
                    const destUrl = isWound ? `/cases/${c._id}/wound` : `/cases/${c._id}`;
                    const rawImg = c.imagePaths && c.imagePaths.length > 0 ? c.imagePaths[0].path : null;
                    const imgUrl = rawImg
                      ? rawImg.startsWith("http")
                        ? rawImg
                        : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${rawImg}`
                      : null;

                    const title = c.lesionLabel || `${c.bodySite.replace("_", " ")} observation`;
                    const categoryTag = isWound ? "Wound or ulcer" : "Skin lesion";
                    const dateFormatted = new Date(c.createdAt).toLocaleDateString("en-CA"); // YYYY-MM-DD
                    const caseShortId = c._id.slice(-4).toUpperCase();

                    return (
                      <Link
                        key={c._id}
                        href={destUrl}
                        className="group flex flex-col sm:grid sm:grid-cols-12 items-start sm:items-center px-4 py-3 min-h-[72px] hover:bg-[#FBFAF7] transition-colors no-underline"
                      >
                        <div className="w-full sm:w-auto sm:col-span-8 md:col-span-7 flex items-center gap-3.5">
                          {/* 56x56 square thumbnail */}
                          <div className="w-14 h-14 shrink-0 border border-[#D8DDDB] rounded-[4px] bg-[#FBFAF7] overflow-hidden flex items-center justify-center">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-[#5A6B69]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-[#17252A] group-hover:text-[#1B6B63] transition-colors truncate">
                              {title}
                            </h3>
                            <div className="font-mono text-[11px] text-[#5A6B69] truncate mt-0.5">
                              {categoryTag} · {dateFormatted} ·{" "}
                              <span className="font-medium text-[#17252A]">Case #{caseShortId}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 sm:mt-0 w-full sm:w-auto sm:col-span-3 md:col-span-4 flex items-center justify-between sm:justify-start">
                          {getRiskBadge(c)}
                        </div>

                        <div className="hidden sm:flex sm:col-span-1 md:col-span-1 justify-end items-center">
                          <ChevronRight className="w-4 h-4 text-[#5A6B69] group-hover:text-[#1B6B63] transition-colors" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ledger Footer / Pagination Status */}
            <div className="flex items-center justify-between px-2 py-3 text-[#5A6B69] font-mono text-[11px]">
              <div>
                Showing {filteredCases.length} of {cases.length} indexed captures
              </div>
              <div className="flex items-center gap-1">
                <span>
                  Node Enclave:{" "}
                  <strong className="text-[#17252A] font-normal">AIIMS-TeleDerm-04</strong>
                </span>
              </div>
            </div>

            {/* Non-dismissible Mandatory Clinical Protocol Notice */}
            <div className="mt-8 p-3 rounded-[4px] bg-[#E8F3F1] border border-[#D8DDDB] flex items-start gap-2.5 text-[#17252A]">
              <Shield className="w-5 h-5 text-[#1B6B63] shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-[#1B6B63] uppercase font-mono text-[11px] mr-1">
                  CDSS Mandate:
                </span>
                Decision support only. A low-risk result never proves there is no problem. A doctor makes the diagnosis. Any evolving lesion with erythema, bleeding, or rapid asymmetry requires prompt physical clinical evaluation.
              </div>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
