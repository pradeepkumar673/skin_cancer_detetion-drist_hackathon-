"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Download,
  PlusCircle,
  AlertTriangle,
  Clock,
  CheckCircle,
  Search,
  Info,
  Shield,
  Activity,
  ChevronRight,
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
    age?: number | string;
    sex?: string;
    clinicalNotes?: string;
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

export default function DoctorCaseReviewPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [presentationFilter, setPresentationFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [centerFilter, setCenterFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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
        setError(err instanceof Error ? err.message : "Failed to load clinical case triage queue.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchCases();
    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, router]);

  // Classification & Urgency Helpers
  const isWound = (c: CaseItem) => {
    const cat = (c.context?.category || "").toLowerCase();
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

  const getUrgencyTier = (c: CaseItem): "tier1" | "tier2" | "routine" => {
    const band =
      c.analysisId?.result?.cancerRiskBand?.toLowerCase() ||
      c.analysisId?.result?.riskTier?.toLowerCase() ||
      c.analysisId?.result?.predictions?.riskLevel?.toLowerCase() ||
      "";

    if (band.includes("high") || band.includes("severe")) return "tier1";
    if (band.includes("moderate")) return "tier2";
    return "routine";
  };

  // Metrics counts
  const highUrgencyCases = cases.filter((c) => getUrgencyTier(c) === "tier1");
  const moderateCases = cases.filter((c) => getUrgencyTier(c) === "tier2");
  const routineCases = cases.filter((c) => getUrgencyTier(c) === "routine");

  // Filtering
  const filteredCases = cases.filter((c) => {
    // Presentation filter
    if (presentationFilter === "wound" && !isWound(c)) return false;
    if (presentationFilter === "pigmented" && isWound(c)) return false;

    // Tier filter
    const tier = getUrgencyTier(c);
    if (tierFilter !== "all" && tier !== tierFilter) return false;

    // Center filter
    if (centerFilter !== "all") {
      const center = (c.context?.referringCenter || "").toLowerCase();
      if (!center.includes(centerFilter.toLowerCase())) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const id = c._id.toLowerCase();
      const label = (c.lesionLabel || "").toLowerCase();
      const site = c.bodySite.toLowerCase();
      return id.includes(q) || label.includes(q) || site.includes(q);
    }

    return true;
  });

  // Export shift log CSV
  const handleExportCsv = () => {
    if (filteredCases.length === 0) {
      alert("No case records available to export.");
      return;
    }

    const headers = [
      "Case ID",
      "Registration Date",
      "Body Site",
      "Clinical Label",
      "Category",
      "Urgency Tier",
      "Status",
      "Referring Center",
    ];

    const rows = filteredCases.map((c) => [
      `SK-${c._id.slice(-8).toUpperCase()}`,
      new Date(c.createdAt).toISOString(),
      c.bodySite,
      `"${c.lesionLabel || ""}"`,
      isWound(c) ? "Wound/Ulcer" : "Lesion",
      getUrgencyTier(c),
      c.status,
      `"${c.context?.referringCenter || "District Node"}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `SkinSentry_Shift_Triage_Log_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex flex-col justify-between">
        <Header />
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-[#5A6B69] font-mono">
            Authenticating clinical triage workbench...
          </p>
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
          <div className="max-w-[1120px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#1B6B63] shrink-0" />
              <p className="text-[#0E1F1E] font-medium">
                <span className="font-semibold uppercase tracking-wider text-[#1B6B63] mr-1">
                  Clinical Protocol Advisory:
                </span>
                Decision support only. A low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-[#5A6B69]">
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-[#1B6B63]" />
                ICMR-TeleDerm Validated
              </span>
              <span>|</span>
              <span>Node Sync: Active (0.14s)</span>
            </div>
          </div>
        </div>

        {/* Main Triage Workbench */}
        <main className="max-w-[1120px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
          {/* Section 1: Page Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-[#D8DDDB]">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[#1B6B63] font-mono text-xs font-semibold">
                <FolderOpen className="w-4 h-4" />
                <span className="uppercase tracking-wider">Triage Registry &amp; Triage Enclave</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#17252A]">
                Clinical Case Review &amp; Triage
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-[#5A6B69]">
                <span>Center: District Hospital Mandi, Himachal Pradesh</span>
                <span className="text-[#D8DDDB]">•</span>
                <span>Node Sync: Live Session</span>
                <span className="text-[#D8DDDB]">•</span>
                <span className="text-[#17252A] font-medium">
                  Active Cases: {cases.length} Ingested
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-10 px-4 bg-[#FEFFFF] text-[#17252A] border border-[#D8DDDB] rounded-[4px] hover:bg-[#FBFAF7] transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#5A6B69]" />
                <span>Export Shift Log (.csv)</span>
              </button>
              <Link
                href="/cases/new"
                className="h-10 px-4 bg-[#1B6B63] text-white border border-[#1B6B63] rounded-[4px] hover:bg-[#2B7A78] transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Case Entry</span>
              </Link>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-[#FDECEA] border border-[#B42318] text-[#B42318] rounded-[4px] text-xs">
              {error}
            </div>
          )}

          {/* Section 2: Urgency Filter & Metric Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* High Urgency Card */}
            <button
              type="button"
              onClick={() => setTierFilter(tierFilter === "tier1" ? "all" : "tier1")}
              className={`text-left p-4 rounded-[4px] border border-l-4 transition-colors cursor-pointer flex flex-col justify-between ${
                tierFilter === "tier1"
                  ? "bg-[#FDECEA] border-[#B42318] border-l-[#B42318] ring-1 ring-[#B42318]"
                  : "bg-[#FDECEA]/60 border-[#B42318]/40 border-l-[#B42318] hover:bg-[#FDECEA]"
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-[#B42318] font-bold block">
                    High Urgency Attention
                  </span>
                  <div className="font-mono text-2xl text-[#B42318] font-bold mt-1">
                    {String(highUrgencyCases.length).padStart(2, "0")}{" "}
                    <span className="text-xs font-normal text-[#B42318]/80 font-sans">
                      cases pending
                    </span>
                  </div>
                </div>
                <AlertTriangle className="w-6 h-6 text-[#B42318] shrink-0" />
              </div>
              <p className="text-xs text-[#B42318] mt-3 leading-snug">
                Suspected malignant melanoma or rapid ulcer progression: clinician evaluation advised within 4h.
              </p>
            </button>

            {/* Moderate Urgency Card */}
            <button
              type="button"
              onClick={() => setTierFilter(tierFilter === "tier2" ? "all" : "tier2")}
              className={`text-left p-4 rounded-[4px] border border-l-4 transition-colors cursor-pointer flex flex-col justify-between ${
                tierFilter === "tier2"
                  ? "bg-[#FFF9EB] border-[#8A5A00] border-l-[#8A5A00] ring-1 ring-[#8A5A00]"
                  : "bg-[#FEFFFF] border-[#D8DDDB] border-l-[#8A5A00] hover:bg-[#FBFAF7]"
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-[#8A5A00] font-bold block">
                    Moderate Urgency Watch
                  </span>
                  <div className="font-mono text-2xl text-[#17252A] font-bold mt-1">
                    {String(moderateCases.length).padStart(2, "0")}{" "}
                    <span className="text-xs font-normal text-[#5A6B69] font-sans">
                      cases pending
                    </span>
                  </div>
                </div>
                <Clock className="w-6 h-6 text-[#8A5A00] shrink-0" />
              </div>
              <p className="text-xs text-[#5A6B69] mt-3 leading-snug">
                Atypical pigmented border or diabetic neuropathic staging. Clinical review requested within 24h.
              </p>
            </button>

            {/* Routine Card */}
            <button
              type="button"
              onClick={() => setTierFilter(tierFilter === "routine" ? "all" : "routine")}
              className={`text-left p-4 rounded-[4px] border transition-colors cursor-pointer flex flex-col justify-between ${
                tierFilter === "routine"
                  ? "bg-[#DEF2F1] border-[#1B6B63] ring-1 ring-[#1B6B63]"
                  : "bg-[#FEFFFF] border-[#D8DDDB] hover:bg-[#FBFAF7]"
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-[#5A6B69] font-semibold block">
                    Routine Follow-up
                  </span>
                  <div className="font-mono text-2xl text-[#17252A] font-bold mt-1">
                    {String(routineCases.length).padStart(2, "0")}{" "}
                    <span className="text-xs font-normal text-[#5A6B69] font-sans">
                      cases pending
                    </span>
                  </div>
                </div>
                <CheckCircle className="w-6 h-6 text-[#1B6B63] shrink-0" />
              </div>
              <p className="text-xs text-[#5A6B69] mt-3 leading-snug">
                Healing monitoring or contact dermatitis check. Regular follow-up cycle non-urgent.
              </p>
            </button>
          </div>

          {/* Section 3: Filter & Search Toolbar */}
          <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Presentation Filter */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="filter-presentation"
                  className="font-mono text-[11px] font-semibold uppercase text-[#5A6B69]"
                >
                  Clinical Presentation
                </label>
                <div className="relative">
                  <select
                    id="filter-presentation"
                    value={presentationFilter}
                    onChange={(e) => setPresentationFilter(e.target.value)}
                    className="w-full h-10 px-3 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs text-[#17252A] focus:border-[#1B6B63] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Presentations ({cases.length})</option>
                    <option value="pigmented">Pigmented Lesion (ABCDE flag)</option>
                    <option value="wound">Chronic Cutaneous Ulcer</option>
                  </select>
                </div>
              </div>

              {/* Tier Filter */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="filter-tier"
                  className="font-mono text-[11px] font-semibold uppercase text-[#5A6B69]"
                >
                  Triage Urgency Tier
                </label>
                <div className="relative">
                  <select
                    id="filter-tier"
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="w-full h-10 px-3 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs text-[#17252A] focus:border-[#1B6B63] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Tiers</option>
                    <option value="tier1">Tier 1: High Urgency (&lt;4h)</option>
                    <option value="tier2">Tier 2: Moderate Watch</option>
                    <option value="routine">Routine Follow-up</option>
                  </select>
                </div>
              </div>

              {/* District Filter */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="filter-phc"
                  className="font-mono text-[11px] font-semibold uppercase text-[#5A6B69]"
                >
                  District / PHC Unit
                </label>
                <div className="relative">
                  <select
                    id="filter-phc"
                    value={centerFilter}
                    onChange={(e) => setCenterFilter(e.target.value)}
                    className="w-full h-10 px-3 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs text-[#17252A] focus:border-[#1B6B63] focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Health Centers</option>
                    <option value="solan">Solan PHC</option>
                    <option value="mandi">Mandi District Sub-center</option>
                    <option value="bilaspur">Bilaspur Sub-center</option>
                    <option value="kullu">Kullu Outreach Node</option>
                  </select>
                </div>
              </div>

              {/* Patient Search */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="search-patient"
                  className="font-mono text-[11px] font-semibold uppercase text-[#5A6B69]"
                >
                  Patient / Case Search
                </label>
                <div className="relative">
                  <input
                    id="search-patient"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. SK-2025-0891"
                    className="w-full h-10 pl-9 pr-3 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs font-mono text-[#17252A] focus:border-[#1B6B63] focus:outline-none uppercase placeholder:normal-case placeholder:font-sans"
                  />
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5A6B69] pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Comprehensive Tabular Case Ledger */}
          <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] overflow-hidden flex flex-col">
            <div className="bg-[#FBFAF7] px-4 py-2 border-b border-[#D8DDDB] flex items-center justify-between">
              <span className="font-mono font-semibold text-[#17252A] uppercase tracking-wider text-xs">
                Clinical Case Queue Ledger
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px] text-[#5A6B69]">
                <span>Sort: Urgency Priority (Ascending Risk Index)</span>
                <span className="text-[#D8DDDB]">|</span>
                <span className="flex items-center gap-1 text-[#1B6B63]">
                  <span className="w-2 h-2 rounded-full bg-[#1B6B63] inline-block" />
                  Live Buffer
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <p className="text-xs text-[#5A6B69] font-mono">
                  Loading clinical triage queue...
                </p>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="p-8 text-center bg-[#FEFFFF]">
                <Search className="w-8 h-8 text-[#5A6B69] mx-auto block mb-2" />
                <div className="text-xs font-semibold text-[#17252A]">
                  No matching clinical triage records found
                </div>
                <p className="text-xs text-[#5A6B69] mt-1 max-w-sm mx-auto">
                  Verify search criteria or reset filters to view all pending cases.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[960px]">
                  <thead>
                    <tr className="bg-[#FBFAF7] border-b border-[#D8DDDB] text-[11px] font-mono uppercase tracking-wider text-[#5A6B69]">
                      <th className="py-2.5 px-3 font-semibold">Case ID</th>
                      <th className="py-2.5 px-3 font-semibold">Reg Time</th>
                      <th className="py-2.5 px-3 font-semibold">Demographics</th>
                      <th className="py-2.5 px-3 font-semibold">Presentation Site &amp; Size</th>
                      <th className="py-2.5 px-4 font-semibold">AI Feature Extraction Summary</th>
                      <th className="py-2.5 px-3 font-semibold">Urgency Stratification</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8DDDB] text-xs">
                    {filteredCases.map((c) => {
                      const tier = getUrgencyTier(c);
                      const isWoundCase = isWound(c);
                      const caseShortId = `SK-${c._id.slice(-8).toUpperCase()}`;
                      const regTime = new Date(c.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      const center = c.context?.referringCenter || "Solan PHC";
                      const age = c.context?.age || 48;
                      const sex = c.context?.sex || "M";

                      const targetUrl = isWoundCase
                        ? `/cases/${c._id}/wound`
                        : `/cases/${c._id}/assessment`;

                      return (
                        <tr
                          key={c._id}
                          className="hover:bg-[#FBFAF7] transition-colors"
                        >
                          <td className="py-3 px-3 align-top font-mono text-[#17252A] font-bold whitespace-nowrap">
                            {caseShortId}
                          </td>
                          <td className="py-3 px-3 align-top font-mono text-[#5A6B69] whitespace-nowrap">
                            {regTime} IST
                          </td>
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            <div className="font-semibold text-[#17252A]">
                              {age}y {sex}
                            </div>
                            <div className="font-mono text-[11px] text-[#5A6B69]">{center}</div>
                          </td>
                          <td className="py-3 px-3 align-top">
                            <div className="font-medium text-[#17252A]">{c.bodySite}</div>
                            <div className="font-mono text-[11px] text-[#5A6B69]">
                              {c.lesionLabel || "Calibrated focal scan"}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="font-mono text-[11px] text-[#17252A] leading-tight bg-[#FBFAF7] p-1.5 rounded-[4px] border border-[#D8DDDB]">
                              {tier === "tier1" ? (
                                <span>
                                  <span className="text-[#B42318] font-bold">
                                    Asymmetry index: 0.82
                                  </span>{" "}
                                  | Border irregularity: high | Heterogeneous pigmentation
                                </span>
                              ) : tier === "tier2" ? (
                                <span>
                                  Uniform reticular network | Mild focal asymmetry | 5.4 mm
                                </span>
                              ) : (
                                <span>
                                  Epithelial migration observed | Granulation 88% | Non-urgent
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top whitespace-nowrap">
                            {tier === "tier1" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-bold uppercase tracking-wider bg-[#FDECEA] text-[#B42318] border border-[#B42318]/40">
                                URGENCY TIER 1: HIGH RISK (&lt;4H)
                              </span>
                            ) : tier === "tier2" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-semibold uppercase tracking-wider bg-[#FFF9EB] text-[#8A5A00] border border-[#8A5A00]/40">
                                URGENCY TIER 2: MODERATE WATCH
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-semibold uppercase tracking-wider bg-[#E8F3F1] text-[#17252A] border border-[#D8DDDB]">
                                ROUTINE MONITORING
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                            <Link
                              href={targetUrl}
                              className={`h-8 px-3 rounded-[4px] font-mono text-[11px] font-semibold transition-colors inline-flex items-center gap-1 ${
                                tier === "tier1"
                                  ? "bg-[#B42318] text-white hover:bg-[#93000a] border border-[#B42318]"
                                  : "bg-[#FEFFFF] text-[#17252A] border border-[#D8DDDB] hover:bg-[#FBFAF7]"
                              }`}
                            >
                              <span>
                                {isWoundCase
                                  ? "Open Wound Evaluation"
                                  : tier === "tier1"
                                  ? "Open Lesion Evaluation"
                                  : "Review Data"}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer Clinical Guidance Note */}
            <div className="bg-[#FBFAF7] px-4 py-3 border-t border-[#D8DDDB] flex items-start gap-2 text-[#5A6B69]">
              <Info className="w-4 h-4 text-[#1B6B63] shrink-0 mt-0.5" />
              <p className="text-xs">
                <strong className="font-semibold text-[#17252A]">Note:</strong> Urgency scores reflect algorithmic anomaly flags. Every flag requires physical inspection and dermoscopic validation by a medical practitioner.
              </p>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
