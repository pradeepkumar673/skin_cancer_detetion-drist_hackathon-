"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  Trash2,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  FileText,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { FormField } from "@/components/ui/FormField";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";

interface CaseDetails {
  _id: string;
  patientId: string;
  createdBy: string;
  bodySite: string;
  lesionLabel?: string;
  status: "queued" | "processing" | "completed" | "failed" | "abstained";
  imagePaths: Array<{ path: string; kind: string; takenAt: string }>;
  context: {
    skinType?: string;
    sunExposure?: string;
    familyHistorySkinCancer?: boolean;
    isDiabetic?: boolean;
    pxPerCm?: number;
  };
  followUpAt?: string;
  createdAt: string;
  feedback?: Array<{
    doctorId?: string;
    decision: "accept" | "correct" | "reject";
    correctedLabel?: string;
    notes?: string;
    createdAt: string;
  }>;
}

interface AnalysisData {
  _id: string;
  safety?: {
    decision: "proceed" | "escalate" | "abstain";
    reasons: string[];
    coachTips?: string[];
    agreementScore?: number;
    oodNotice?: string;
  };
  seniorCancer?: {
    estimatedLikelihood: number;
    likelihoodRange: [number, number];
    riskBand: "low" | "moderate" | "high" | "severe";
    urgency: "Monitor" | "Routine visit" | "Urgent visit";
    likelyTypes: Array<{ type: string; probability: number }>;
    warningSigns: string[];
    reducedReliability?: boolean;
  };
  abcde?: {
    raw: {
      asymmetry: number;
      border: number;
      colour: number;
      diameterMm?: number;
      evolution?: number;
    };
    percentiles: {
      asymmetry: number;
      border: number;
      colour: number;
      diameter?: number;
      evolution?: number;
    };
  };
  juniorJuniorDisagreement?: {
    grid: number[][];
    summary: string;
    bothCount: number;
    modelACount: number;
    modelBCount: number;
    neitherCount: number;
  };
  seniorUlcer?: {
    trajectory: "healing" | "stalled" | "worsening" | "unknown";
    areaCm2?: number;
    areaPx: number;
    tissueFractions?: {
      granulation: number;
      slough: number;
      necrotic: number;
    };
    redFlags: string[];
  };
  seniorDisease?: {
    possibleConditions: Array<{ condition: string; probability: number }>;
    isSure: boolean;
  };
  result?: {
    maskFile?: string;
    heatmapFile?: string;
  };
  meta?: {
    modelVersions?: Record<string, string>;
    executedAt?: string;
  };
}

interface WoundHistoryPoint {
  takenAt: string;
  areaCm2: number | null;
  areaPx: number;
}

interface ReportExplanation {
  language: string;
  text: string;
  source: "llm" | "template";
  generatedAt: string;
}

function CaseDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const caseId = resolvedParams.id;

  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [caseDoc, setCaseDoc] = useState<CaseDetails | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [woundHistory, setWoundHistory] = useState<WoundHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overlay toggles
  const [showMask, setShowMask] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);

  // Multilingual explanation
  const [selectedLang, setSelectedLang] = useState<"en" | "ta" | "hi">("en");
  const [explanations, setExplanations] = useState<Record<string, ReportExplanation>>({});
  const [explLoading, setExplLoading] = useState(false);
  const [explError, setExplError] = useState<string | null>(null);

  // Follow-up reminder
  const [followUpDays, setFollowUpDays] = useState(14);
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Technical details accordion
  const [showTechDetails, setShowTechDetails] = useState(false);

  // Doctor review feedback form
  const [feedbackDecision, setFeedbackDecision] = useState<"accept" | "correct" | "reject">("accept");
  const [feedbackLabel, setFeedbackLabel] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Fetch case details
  const fetchCase = useCallback(() => {
    apiClient<{
      case: CaseDetails;
      analysis?: AnalysisData;
      woundHistory?: WoundHistoryPoint[];
    }>(`/cases/${caseId}`)
      .then((res) => {
        setCaseDoc(res.case);
        if (res.analysis) setAnalysis(res.analysis);
        if (res.woundHistory) setWoundHistory(res.woundHistory);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load case data.");
        setLoading(false);
      });
  }, [caseId]);

  // Initial load and WebSocket live updates
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
    if (isAuthenticated) {
      fetchCase();

      // Connect socket for real-time status transitions
      const socket = getSocket();
      const onCaseUpdate = (data: { caseId: string; status: string }) => {
        if (data.caseId === caseId) {
          fetchCase();
        }
      };

      socket.on("case:update", onCaseUpdate);

      // Fallback polling if case is in progress
      const interval = setInterval(() => {
        if (caseDoc && (caseDoc.status === "queued" || caseDoc.status === "processing")) {
          apiClient<{ status: string }>(`/cases/${caseId}/status`).then((s) => {
            if (s.status !== caseDoc.status) {
              fetchCase();
            }
          });
        }
      }, 3000);

      return () => {
        socket.off("case:update", onCaseUpdate);
        clearInterval(interval);
      };
    }
  }, [authLoading, isAuthenticated, fetchCase, caseId, caseDoc, router]);

  // Load explanation on language change or when analysis completes
  const requestExplanation = useCallback((lang: "en" | "ta" | "hi") => {
    apiClient<{ report: ReportExplanation }>(`/cases/${caseId}/explanation`, {
      method: "POST",
      body: JSON.stringify({ language: lang }),
    })
      .then((res) => {
        setExplanations((prev) => ({ ...prev, [lang]: res.report }));
      })
      .catch((err: unknown) => {
        setExplError(err instanceof Error ? err.message : "Failed to generate language explanation.");
      })
      .finally(() => {
        setExplLoading(false);
      });
  }, [caseId]);

  useEffect(() => {
    if (caseDoc?.status === "completed" && analysis && !explanations[selectedLang]) {
      requestExplanation(selectedLang);
    }
  }, [caseDoc?.status, analysis, selectedLang, explanations, requestExplanation]);

  const handleFollowUpSave = async () => {
    try {
      setFollowUpSaving(true);
      await apiClient(`/cases/${caseId}/followup`, {
        method: "PATCH",
        body: JSON.stringify({ days: Number(followUpDays) }),
      });
      setFollowUpSuccess(true);
      fetchCase();
      setTimeout(() => setFollowUpSuccess(false), 3000);
    } catch {
      // Ignored
    } finally {
      setFollowUpSaving(false);
    }
  };

  const handleDeleteCase = async () => {
    try {
      setDeleting(true);
      await apiClient(`/cases/${caseId}`, { method: "DELETE" });
      router.push("/cases");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);
    try {
      setFeedbackSubmitting(true);
      await apiClient(`/cases/${caseId}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          decision: feedbackDecision,
          correctedLabel: feedbackLabel.trim() || undefined,
          notes: feedbackNotes.trim() || undefined,
        }),
      });
      setFeedbackSuccess(true);
      fetchCase();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFeedbackError(err.message);
      } else {
        setFeedbackError("Failed to record doctor feedback.");
      }
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
          <Spinner size="lg" />
          <p className="text-xs text-[#17252A]/70 font-mono">Retrieving screening case records...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !caseDoc) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
        <Header />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
          <Alert variant="error" className="mb-4">
            {error || "Case record could not be found."}
          </Alert>
          <Link href="/cases">
            <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span>Return to My Cases</span>
            </Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const isDoctor = user?.role === "doctor" || user?.role === "admin";
  const currentPhoto = caseDoc.imagePaths.find((p) => p.kind === "current") || caseDoc.imagePaths[0];

  // ABCDE chart data
  const abcdeData = analysis?.abcde?.percentiles
    ? [
        { subject: "Asymmetry", A: analysis.abcde.percentiles.asymmetry, fullMark: 100 },
        { subject: "Border", A: analysis.abcde.percentiles.border, fullMark: 100 },
        { subject: "Colour", A: analysis.abcde.percentiles.colour, fullMark: 100 },
        { subject: "Diameter", A: analysis.abcde.percentiles.diameter || 0, fullMark: 100 },
        { subject: "Evolution", A: analysis.abcde.percentiles.evolution || 0, fullMark: 100 },
      ]
    : [];

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

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-8">
          {/* Header breadcrumb & live status */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#17252A]/10 pb-4">
            <div className="space-y-1">
              <Link
                href="/cases"
                className="inline-flex items-center gap-1 text-xs text-[#2B7A78] hover:underline mb-1 font-medium"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>All Cases</span>
              </Link>
              <h1 className="text-2xl font-bold tracking-tight text-[#17252A]">
                {caseDoc.lesionLabel || "Unlabeled Spot"} &bull;{" "}
                <span className="capitalize">{caseDoc.bodySite.replace("_", " ")}</span>
              </h1>
              <div className="flex items-center gap-3 text-xs text-[#17252A]/60 font-mono">
                <span>Case #{caseDoc._id.slice(-8)}</span>
                <span>Captured: {new Date(caseDoc.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={caseDoc.status} />

              {caseDoc.status === "completed" && (
                <Link href={`/cases/${caseDoc._id}/report`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex items-center gap-1.5 border-[#2B7A78] text-[#2B7A78] hover:bg-[#DEF2F1]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Download Report</span>
                  </Button>
                </Link>
              )}

              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </Button>
            </div>
          </div>

          {/* Real-time processing banner */}
          {(caseDoc.status === "queued" || caseDoc.status === "processing") && (
            <Card className="border-[#2B7A78] bg-[#DEF2F1]/30 p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <Spinner size="lg" />
                <div>
                  <h2 className="text-base font-bold text-[#17252A]">
                    {caseDoc.status === "queued"
                      ? "Screening Job Queued"
                      : "Computer Vision Models Running"}
                  </h2>
                  <p className="mt-1 text-xs text-[#17252A]/80 max-w-md leading-relaxed">
                    Analyzing photo quality, calculating calibrated asymmetry metrics, and running
                    senior cancer triage modules. Live updates stream automatically without page refresh.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Abstained / Quality failure banner */}
          {caseDoc.status === "abstained" && (
            <Alert variant="warning" title="Screening Abstained: Low Quality or Non-Skin Image">
              <div className="space-y-2 mt-2 text-xs">
                <p>
                  Our Nurse Gate determined that this photograph does not meet the minimum technical
                  quality standards required for reliable clinical assessment.
                </p>
                {analysis?.safety?.reasons && analysis.safety.reasons.length > 0 && (
                  <div>
                    <strong className="text-[#17252A]">Identified Issues:</strong>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {analysis.safety.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis?.safety?.coachTips && analysis.safety.coachTips.length > 0 && (
                  <div className="mt-2 border-t border-[#8A5A00]/20 pt-2">
                    <strong className="text-[#17252A]">How to Retake This Photo:</strong>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {analysis.safety.coachTips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-2">
                  <Link href="/cases/new">
                    <Button variant="primary" size="sm">
                      Retake Photo Now
                    </Button>
                  </Link>
                </div>
              </div>
            </Alert>
          )}

          {/* Failed pipeline banner */}
          {caseDoc.status === "failed" && (
            <Alert variant="error" title="Analysis Pipeline Error">
              <p className="text-xs mt-1">
                An internal processing timeout occurred. Please try resubmitting the photo or contact
                technical support if the issue persists.
              </p>
            </Alert>
          )}

          {/* Completed Results Display */}
          {caseDoc.status === "completed" && analysis && (
            <div className="grid gap-8 lg:grid-cols-12">
              {/* Left Column: Image & Overlays */}
              <div className="lg:col-span-5 space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Submitted Photograph</span>
                      <span className="text-xs font-mono font-normal text-[#17252A]/60">
                        {caseDoc.context.pxPerCm
                          ? `${caseDoc.context.pxPerCm} px/cm`
                          : "No scale reference"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Visual Container */}
                    <div className="relative overflow-hidden border border-[#17252A]/20 bg-[#17252A] rounded-[4px] aspect-square flex items-center justify-center">
                      {currentPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`http://localhost:5000/cases/${caseDoc._id}/image/0`}
                          alt="Submitted clinical lesion"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-[#FEFFFF]/60">No image available</div>
                      )}

                      {/* Overlay: Mask */}
                      {showMask && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`http://localhost:5000/cases/${caseDoc._id}/artifact/mask.png`}
                          alt="Lesion segmentation mask"
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-60 mix-blend-screen"
                        />
                      )}

                      {/* Overlay: Heatmap */}
                      {showHeatmap && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`http://localhost:5000/cases/${caseDoc._id}/artifact/heatmap.png`}
                          alt="Grad-CAM activation heatmap"
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-60 mix-blend-screen"
                        />
                      )}
                    </div>

                    {/* Overlay Toggle Controls */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-[#17252A]/10 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowMask(!showMask)}
                        className={`px-2.5 py-1 rounded-[4px] border transition-colors ${
                          showMask
                            ? "border-[#2B7A78] bg-[#2B7A78] text-[#FEFFFF]"
                            : "border-[#17252A]/20 hover:border-[#2B7A78]"
                        }`}
                      >
                        Mask Outline
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        className={`px-2.5 py-1 rounded-[4px] border transition-colors ${
                          showHeatmap
                            ? "border-[#2B7A78] bg-[#2B7A78] text-[#FEFFFF]"
                            : "border-[#17252A]/20 hover:border-[#2B7A78]"
                        }`}
                      >
                        Heatmap Overlay
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAgreement(!showAgreement)}
                        className={`px-2.5 py-1 rounded-[4px] border transition-colors ${
                          showAgreement
                            ? "border-[#2B7A78] bg-[#2B7A78] text-[#FEFFFF]"
                            : "border-[#17252A]/20 hover:border-[#2B7A78]"
                        }`}
                      >
                        Agreement Grid
                      </button>
                    </div>

                    {/* Agreement 8x8 Grid Details */}
                    {showAgreement && (
                      <div className="border border-[#17252A]/15 bg-[#DEF2F1]/20 p-3 rounded-[4px] space-y-2">
                        <div className="text-xs font-bold text-[#17252A]">
                          Junior Model Agreement Map (8x8 Grid)
                        </div>
                        {analysis.juniorJuniorDisagreement ? (
                          <div className="space-y-2">
                            <p className="text-xs text-[#17252A]/80">
                              {analysis.juniorJuniorDisagreement.summary}
                            </p>
                            <div className="grid grid-cols-8 gap-0.5 max-w-[160px] mx-auto border border-[#17252A]/30 p-1 bg-[#FEFFFF]">
                              {(analysis.juniorJuniorDisagreement.grid || []).flat().map((val, idx) => (
                                <div
                                  key={idx}
                                  className={`aspect-square border text-[8px] flex items-center justify-center ${
                                    val === 3
                                      ? "border-[#2B7A78] bg-[#2B7A78]/30 font-bold"
                                      : val === 1
                                      ? "border-[#8A5A00] bg-[#8A5A00]/20"
                                      : val === 2
                                      ? "border-[#B54708] bg-[#B54708]/20"
                                      : "border-transparent bg-transparent"
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="text-[10px] text-[#17252A]/70 flex flex-wrap gap-2 justify-center pt-1 font-mono">
                              <span>Both: {analysis.juniorJuniorDisagreement.bothCount}</span>
                              <span>Model A only: {analysis.juniorJuniorDisagreement.modelACount}</span>
                              <span>Model B only: {analysis.juniorJuniorDisagreement.modelBCount}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-[#17252A]/60 italic">
                            Not available: no earlier photo or comparison lesion available to construct agreement grid.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Follow-up & Quick Actions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Follow-up Monitoring</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    {caseDoc.followUpAt && (
                      <div className="flex items-center gap-2 text-[#2B7A78] font-semibold">
                        <Clock className="h-4 w-4" />
                        <span>
                          Next follow-up recommended: {new Date(caseDoc.followUpAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="365"
                        value={followUpDays}
                        onChange={(e) => setFollowUpDays(Number(e.target.value))}
                        className="w-24 text-xs"
                      />
                      <span className="text-[#17252A]/70">days from today</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleFollowUpSave}
                        isLoading={followUpSaving}
                      >
                        Set Reminder
                      </Button>
                    </div>
                    {followUpSuccess && (
                      <p className="text-xs text-[#1E6B3A] font-semibold">
                        Follow-up reminder recorded.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Specialist Findings & Safety */}
              <div className="lg:col-span-7 space-y-6">
                {/* 1. Senior Cancer Card */}
                {analysis.seniorCancer && (
                  <Card className="border-[#17252A]/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Skin Lesion Triage (Melanoma Check)</CardTitle>
                        <span
                          className={`px-2.5 py-0.5 rounded-[4px] text-xs font-bold uppercase tracking-wider ${
                            analysis.seniorCancer.riskBand === "low"
                              ? "bg-[#1E6B3A]/15 text-[#1E6B3A] border border-[#1E6B3A]/30"
                              : analysis.seniorCancer.riskBand === "moderate"
                              ? "bg-[#8A5A00]/15 text-[#8A5A00] border border-[#8A5A00]/30"
                              : "bg-[#B42318]/15 text-[#B42318] border border-[#B42318]/30"
                          }`}
                        >
                          {analysis.seniorCancer.riskBand} Risk Band
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Likelihood Range Bar */}
                      <div>
                        <div className="flex items-baseline justify-between text-xs mb-1">
                          <span className="text-[#17252A]/70">Estimated Concerning Likelihood:</span>
                          <span className="font-mono font-bold text-sm text-[#17252A]">
                            {(analysis.seniorCancer.estimatedLikelihood * 100).toFixed(1)}%{" "}
                            <span className="text-xs font-normal text-[#17252A]/60">
                              (range: {(analysis.seniorCancer.likelihoodRange[0] * 100).toFixed(1)}% -{" "}
                              {(analysis.seniorCancer.likelihoodRange[1] * 100).toFixed(1)}%)
                            </span>
                          </span>
                        </div>
                        {/* Horizontal Interval Bar */}
                        <div className="relative h-2 w-full bg-[#17252A]/10 rounded-[2px] overflow-hidden">
                          <div
                            className="absolute top-0 bottom-0 bg-[#2B7A78]"
                            style={{
                              left: `${Math.max(0, analysis.seniorCancer.likelihoodRange[0] * 100)}%`,
                              width: `${Math.min(
                                100,
                                (analysis.seniorCancer.likelihoodRange[1] -
                                  analysis.seniorCancer.likelihoodRange[0]) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Urgency Callout */}
                      <div className="border border-[#17252A]/15 p-3 rounded-[4px] bg-[#DEF2F1]/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-[#8A5A00]" />
                          <span className="text-xs text-[#17252A]">
                            Recommended Action: <strong>{analysis.seniorCancer.urgency}</strong>
                          </span>
                        </div>
                        <Link href="/doctors">
                          <Button variant="primary" size="sm" className="flex items-center gap-1.5">
                            <Stethoscope className="h-3.5 w-3.5" />
                            <span>Book Consultation</span>
                          </Button>
                        </Link>
                      </div>

                      {/* Warning signs & likely types */}
                      {analysis.seniorCancer.likelyTypes && analysis.seniorCancer.likelyTypes.length > 0 && (
                        <div className="space-y-1.5 text-xs">
                          <span className="font-bold text-[#17252A]">Dermoscopic Candidates:</span>
                          <div className="grid grid-cols-2 gap-2">
                            {analysis.seniorCancer.likelyTypes.map((t, i) => (
                              <div
                                key={i}
                                className="border border-[#17252A]/10 p-2 rounded-[4px] bg-[#FEFFFF] flex items-center justify-between"
                              >
                                <span className="capitalize">{t.type.replace(/_/g, " ")}</span>
                                <span className="font-mono text-[#2B7A78] font-semibold">
                                  {(t.probability * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.seniorCancer.reducedReliability && (
                        <p className="text-[11px] text-[#8A5A00] bg-[#8A5A00]/10 p-2 rounded-[4px] leading-relaxed">
                          <strong>Reliability Notice:</strong> This model was trained on clinical
                          epiluminescence dermoscopy images. Photos taken with a standard mobile camera
                          have reduced accuracy.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 2. ABCDE Radar Chart & Metrics Table */}
                {analysis.abcde && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">ABCDE Structural Metrics</CardTitle>
                      <p className="text-xs text-[#17252A]/70">
                        Calibrated percentile rank against dermoscopy lesion reference distributions.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-6 md:grid-cols-12 items-center">
                        {/* Radar Chart */}
                        <div className="md:col-span-6 h-52">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={abcdeData}>
                              <PolarGrid stroke="rgba(23,37,42,0.15)" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: "#17252A", fontSize: 11 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                              <Radar
                                name="Percentile"
                                dataKey="A"
                                stroke="#2B7A78"
                                fill="#2B7A78"
                                fillOpacity={0.2}
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Raw Metrics Table */}
                        <div className="md:col-span-6 text-xs">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-[#17252A]/15 text-left text-[11px] text-[#17252A]/70">
                                <th className="py-1">Feature</th>
                                <th className="py-1">Raw</th>
                                <th className="py-1 text-right">Percentile</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#17252A]/10">
                              <tr>
                                <td className="py-1.5 font-medium">Asymmetry</td>
                                <td className="py-1.5 font-mono">{analysis.abcde.raw.asymmetry.toFixed(2)}</td>
                                <td className="py-1.5 text-right font-mono font-semibold text-[#2B7A78]">
                                  {analysis.abcde.percentiles.asymmetry}th
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-medium">Border</td>
                                <td className="py-1.5 font-mono">{analysis.abcde.raw.border.toFixed(2)}</td>
                                <td className="py-1.5 text-right font-mono font-semibold text-[#2B7A78]">
                                  {analysis.abcde.percentiles.border}th
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-medium">Colour Variance</td>
                                <td className="py-1.5 font-mono">{analysis.abcde.raw.colour.toFixed(2)}</td>
                                <td className="py-1.5 text-right font-mono font-semibold text-[#2B7A78]">
                                  {analysis.abcde.percentiles.colour}th
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-medium">Diameter</td>
                                <td className="py-1.5 font-mono">
                                  {analysis.abcde.raw.diameterMm
                                    ? `${analysis.abcde.raw.diameterMm.toFixed(1)} mm`
                                    : "No scale"}
                                </td>
                                <td className="py-1.5 text-right font-mono">
                                  {analysis.abcde.percentiles.diameter
                                    ? `${analysis.abcde.percentiles.diameter}th`
                                    : "N/A"}
                                </td>
                              </tr>
                              <tr>
                                <td className="py-1.5 font-medium">Evolution</td>
                                <td className="py-1.5 font-mono">
                                  {analysis.abcde.raw.evolution !== undefined
                                    ? `${analysis.abcde.raw.evolution.toFixed(1)}%`
                                    : "Not available"}
                                </td>
                                <td className="py-1.5 text-right font-mono">
                                  {analysis.abcde.percentiles.evolution !== undefined
                                    ? `${analysis.abcde.percentiles.evolution}th`
                                    : "N/A"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 3. Senior Ulcer / Wound Card */}
                {analysis.seniorUlcer && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Wound & Ulcer Measurement</CardTitle>
                        <span className="font-mono text-xs capitalize font-bold text-[#2B7A78]">
                          {analysis.seniorUlcer.trajectory} Trajectory
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-4 border border-[#17252A]/15 p-3 rounded-[4px] bg-[#DEF2F1]/20">
                        <div>
                          <span className="text-[#17252A]/70">Wound Surface Area:</span>
                          <div className="font-mono font-bold text-sm text-[#17252A]">
                            {analysis.seniorUlcer.areaCm2
                              ? `${analysis.seniorUlcer.areaCm2.toFixed(2)} cm²`
                              : `${analysis.seniorUlcer.areaPx} px`}
                          </div>
                        </div>
                        <div>
                          <span className="text-[#17252A]/70">Healing Status:</span>
                          <div className="font-bold text-sm capitalize text-[#17252A]">
                            {analysis.seniorUlcer.trajectory}
                          </div>
                        </div>
                      </div>

                      {/* Longitudinal Line Chart */}
                      {woundHistory.length > 1 && (
                        <div className="space-y-1">
                          <span className="font-semibold text-[#17252A]">Area Over Time:</span>
                          <div className="h-36 w-full border border-[#17252A]/10 p-2 rounded-[4px] bg-[#FEFFFF]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={woundHistory}>
                                <XAxis
                                  dataKey="takenAt"
                                  tickFormatter={(v) => new Date(v).toLocaleDateString().slice(0, 5)}
                                  fontSize={10}
                                />
                                <YAxis fontSize={10} />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey={woundHistory[0].areaCm2 ? "areaCm2" : "areaPx"}
                                  stroke="#2B7A78"
                                  strokeWidth={2}
                                  dot={{ fill: "#2B7A78", r: 3 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Tissue Fractions */}
                      {analysis.seniorUlcer.tissueFractions && (
                        <div>
                          <div className="flex items-center justify-between mb-1 text-[11px] text-[#17252A]/70">
                            <span>Tissue Fractions (Colour-based estimate):</span>
                            <span>
                              Granulation: {(analysis.seniorUlcer.tissueFractions.granulation * 100).toFixed(0)}% |{" "}
                              Slough: {(analysis.seniorUlcer.tissueFractions.slough * 100).toFixed(0)}% |{" "}
                              Necrotic: {(analysis.seniorUlcer.tissueFractions.necrotic * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex h-3 w-full rounded-[2px] overflow-hidden border border-[#17252A]/15">
                            <div
                              style={{ width: `${analysis.seniorUlcer.tissueFractions.granulation * 100}%` }}
                              className="bg-[#B42318] h-full"
                              title="Granulation (Red)"
                            />
                            <div
                              style={{ width: `${analysis.seniorUlcer.tissueFractions.slough * 100}%` }}
                              className="bg-[#8A5A00] h-full"
                              title="Slough (Yellow)"
                            />
                            <div
                              style={{ width: `${analysis.seniorUlcer.tissueFractions.necrotic * 100}%` }}
                              className="bg-[#17252A] h-full"
                              title="Necrotic (Black)"
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 4. Skin Condition Candidates */}
                {analysis.seniorDisease && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Skin Conditions & Rashes</CardTitle>
                      <p className="text-xs text-[#17252A]/70">Possible conditions, not a diagnosis.</p>
                    </CardHeader>
                    <CardContent className="text-xs">
                      {analysis.seniorDisease.isSure ? (
                        <div className="space-y-2">
                          {analysis.seniorDisease.possibleConditions.map((c, i) => (
                            <div
                              key={i}
                              className="border border-[#17252A]/10 p-2.5 rounded-[4px] bg-[#FEFFFF] flex items-center justify-between"
                            >
                              <span className="font-semibold text-[#17252A]">{c.condition}</span>
                              <span className="font-mono text-[#2B7A78] font-bold">
                                {(c.probability * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#17252A]/70 italic bg-[#DEF2F1]/30 p-3 rounded-[4px]">
                          The system is not sure: candidate probabilities were below confident classification thresholds.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* 5. Multilingual Plain-Language Explanation */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Clinical Report & Explanation</CardTitle>
                      {/* Language Selector */}
                      <div className="flex border border-[#17252A]/15 rounded-[4px] overflow-hidden text-xs">
                        {(["en", "ta", "hi"] as const).map((lang) => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setSelectedLang(lang)}
                            className={`px-3 py-1 font-semibold transition-colors ${
                              selectedLang === lang
                                ? "bg-[#2B7A78] text-[#FEFFFF]"
                                : "text-[#17252A]/70 hover:text-[#17252A] bg-[#FEFFFF]"
                            }`}
                          >
                            {lang === "en" ? "English" : lang === "ta" ? "தமிழ்" : "हिन्दी"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {explLoading ? (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#17252A]/70">
                        <Spinner size="sm" />
                        <span>Synthesizing clinical summary in selected language...</span>
                      </div>
                    ) : explError ? (
                      <Alert variant="warning">{explError}</Alert>
                    ) : explanations[selectedLang] ? (
                      <div className="space-y-3">
                        <div className="border border-[#17252A]/15 bg-[#FEFFFF] p-4 rounded-[4px] text-xs leading-relaxed text-[#17252A]/90 whitespace-pre-line">
                          {explanations[selectedLang].text}
                        </div>
                        <div className="text-[11px] text-[#17252A]/60 flex items-center justify-between">
                          <span>
                            {explanations[selectedLang].source === "llm"
                              ? "Written by an explanation language model from the measured values and checked against them."
                              : "Generated from a deterministic verified template."}
                          </span>
                          <span className="font-mono">
                            {new Date(explanations[selectedLang].generatedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#17252A]/60">Explanation pending generation.</p>
                    )}

                    {/* Collapsible Technical Details */}
                    <div className="border-t border-[#17252A]/10 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowTechDetails(!showTechDetails)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#17252A]/70 hover:text-[#17252A]"
                      >
                        {showTechDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        <span>Technical Model Details</span>
                      </button>

                      {showTechDetails && (
                        <div className="mt-2 border border-[#17252A]/15 p-3 rounded-[4px] bg-[#DEF2F1]/20 font-mono text-[10px] space-y-1">
                          <div>Pipeline Decision: {analysis.safety?.decision || "completed"}</div>
                          <div>Agreement Score: {analysis.safety?.agreementScore ?? "N/A"}</div>
                          <div>Executed At: {analysis.meta?.executedAt || "N/A"}</div>
                          {analysis.meta?.modelVersions &&
                            Object.entries(analysis.meta.modelVersions).map(([k, v]) => (
                              <div key={k}>
                                {k}: {v}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* 6. Doctor Review Feedback (For Doctors with active consent) */}
                {isDoctor && (
                  <Card className="border-[#2B7A78]/40 bg-[#DEF2F1]/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-[#2B7A78]" />
                        <span>Doctor Clinical Review & Feedback</span>
                      </CardTitle>
                      <p className="text-xs text-[#17252A]/70">
                        Submit clinical concurrence, correction, or rejection of algorithmic screening findings.
                      </p>
                    </CardHeader>
                    <CardContent>
                      {feedbackSuccess && (
                        <Alert variant="info" className="mb-4">
                          Your clinical feedback was saved to the patient case and logged in the audit trail.
                        </Alert>
                      )}
                      {feedbackError && (
                        <Alert variant="error" className="mb-4">
                          {feedbackError}
                        </Alert>
                      )}

                      <form onSubmit={handleFeedbackSubmit} className="space-y-4 text-xs">
                        <FormField label="Clinical Determination" htmlFor="decision" required>
                          <Select
                            id="decision"
                            value={feedbackDecision}
                            onChange={(e) =>
                              setFeedbackDecision(e.target.value as "accept" | "correct" | "reject")
                            }
                          >
                            <option value="accept">Accept - Concur with automated measurements</option>
                            <option value="correct">Correct - Adjust lesion label / category</option>
                            <option value="reject">Reject - Disagree with algorithmic estimate</option>
                          </Select>
                        </FormField>

                        {feedbackDecision === "correct" && (
                          <FormField label="Corrected Diagnosis / Lesion Label" htmlFor="correctedLabel">
                            <Input
                              id="correctedLabel"
                              placeholder="e.g. Seborrheic Keratosis, Stasis Dermatitis"
                              value={feedbackLabel}
                              onChange={(e) => setFeedbackLabel(e.target.value)}
                            />
                          </FormField>
                        )}

                        <FormField label="Physician Notes" htmlFor="notes">
                          <Textarea
                            id="notes"
                            rows={3}
                            placeholder="Clinical impression, recommended next steps, biopsy considerations..."
                            value={feedbackNotes}
                            onChange={(e) => setFeedbackNotes(e.target.value)}
                          />
                        </FormField>

                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          isLoading={feedbackSubmitting}
                        >
                          Submit Clinical Feedback
                        </Button>
                      </form>

                      {/* Display existing feedback history */}
                      {caseDoc.feedback && caseDoc.feedback.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[#17252A]/10 space-y-2">
                          <span className="font-semibold text-xs text-[#17252A]">Previous Doctor Reviews:</span>
                          {caseDoc.feedback.map((fb, idx) => (
                            <div key={idx} className="border border-[#17252A]/15 p-2 rounded-[4px] bg-[#FEFFFF] text-xs space-y-1">
                              <div className="flex items-center justify-between font-bold">
                                <span className="uppercase text-[#2B7A78]">{fb.decision}</span>
                                <span className="text-[10px] text-[#17252A]/60 font-mono">
                                  {new Date(fb.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              {fb.correctedLabel && <div>Correction: {fb.correctedLabel}</div>}
                              {fb.notes && <p className="text-[#17252A]/80">{fb.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title="Delete Screening Case"
        >
          <div className="space-y-4 text-xs text-[#17252A]/85">
            <p>
              Are you sure you want to permanently delete this case? This action will permanently remove
              the submitted photograph, all segmentation masks, Grad-CAM heatmaps, and measured
              data from the server.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteCase}
                isLoading={deleting}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        </Dialog>
      </main>

      <Footer />
    </div>
  );
}

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FEFFFF] text-[#17252A] py-20">
          <Spinner size="lg" />
          <p className="text-xs text-[#17252A]/70 font-mono">Loading case records...</p>
        </div>
      }
    >
      <CaseDetailContent params={params} />
    </React.Suspense>
  );
}
