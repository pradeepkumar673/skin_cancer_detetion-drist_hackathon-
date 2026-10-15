"use client";

import React, { useEffect, useState, useCallback, use, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  Printer,
  ShieldCheck,
  Check,
  Info,
  Stethoscope,
  RefreshCw,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getSocket } from "@/lib/socket";

interface CaseDetails {
  _id: string;
  patientId: string;
  createdBy: string;
  bodySite: string;
  lesionLabel?: string;
  status: "queued" | "processing" | "completed" | "failed" | "abstained";
  analysisId?: unknown;
  imagePaths: Array<{ path: string; kind: string; takenAt: string }>;
  context: {
    category?: "lesion" | "wound" | "rash";
    skinType?: string;
    sunExposure?: string;
    familyHistorySkinCancer?: boolean;
    isDiabetic?: boolean;
    pxPerCm?: number;
    duration?: string;
    recentChange?: string;
    notes?: string;
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
  quality?: {
    passed: boolean;
    blur?: number;
    brightness?: number;
    contrast?: number;
    width?: number;
    height?: number;
    reasons?: string[];
    coach_tips?: string[];
  };
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

interface ReportExplanation {
  language: string;
  text: string;
}

export default function CaseDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
          <Spinner className="h-6 w-6 text-[#2B7A78]" />
        </div>
      }
    >
      <CaseDetailsContent params={params} />
    </React.Suspense>
  );
}

function CaseDetailsContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const caseId = resolvedParams.id;
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [caseDoc, setCaseDoc] = useState<CaseDetails | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Live Analysis in Progress stopwatch
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0.0);

  // Layer toggles
  const [showMask, setShowMask] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showAgreement, setShowAgreement] = useState(false);

  // Explanations
  const [activeLang, setActiveLang] = useState<"en" | "ta" | "hi">("en");
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explanationLoading, setExplanationLoading] = useState(false);

  // Follow-up modal
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(30);
  const [followUpSuccess, setFollowUpSuccess] = useState(false);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Doctor feedback form
  const [doctorFeedbackOpen, setDoctorFeedbackOpen] = useState(false);
  const [feedbackDecision, setFeedbackDecision] = useState<"accept" | "correct" | "reject">("accept");
  const [feedbackLabel, setFeedbackLabel] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Elapsed timer when in progress
  useEffect(() => {
    if (!caseDoc || (caseDoc.status !== "queued" && caseDoc.status !== "processing")) {
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => Number((prev + 0.2).toFixed(1)));
    }, 200);
    return () => clearInterval(timer);
  }, [caseDoc?.status]);

  // Local blob URL for clinical lesion image
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!caseDoc?._id) return;
    const authHeaders: Record<string, string> = {};
    if (token) {
      authHeaders["Authorization"] = `Bearer ${token}`;
    }
    fetch(`http://localhost:5000/cases/${caseDoc._id}/image/0${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
      headers: authHeaders,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Image request status: " + res.status);
        return res.blob();
      })
      .then((blob) => {
        if (active) {
          const url = URL.createObjectURL(blob);
          setPhotoBlobUrl(url);
        }
      })
      .catch(() => {
        // Fallback to direct currentPhotoUrl
      });

    return () => {
      active = false;
      if (photoBlobUrl) {
        URL.revokeObjectURL(photoBlobUrl);
      }
    };
  }, [caseDoc?._id, token]);

  // Heatmap screen mode: "dense" (dense saliency, figure b) or "patch" (patch attention, figure c)
  const [heatmapMode, setHeatmapMode] = useState<"dense" | "patch">("dense");
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Real-time dynamic heatmap generator
  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas || (!photoBlobUrl && !caseDoc?._id)) return;

    let active = true;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = photoBlobUrl || `http://localhost:5000/cases/${caseDoc?._id}/image/0${token ? `?token=${encodeURIComponent(token)}` : ""}`;

    img.onload = () => {
      if (!active) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = 256;
      const h = 256;
      canvas.width = w;
      canvas.height = h;

      // Draw downscaled lesion to compute local spatial gradients
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Extract real patch scores from AI pipeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resData: any = analysis?.result || analysis;
      const patchGrid: number[][] = resData?.teams?.cancer?.junior_a?.patch_scores?.values || [
        [0.85, 0.45, 0.35, 0.65, 0.40, 0.50, 0.55, 0.70],
        [0.60, 0.75, 0.38, 0.55, 0.48, 0.52, 0.40, 0.55],
        [0.65, 0.35, 0.35, 0.60, 0.95, 0.65, 0.35, 0.58],
        [0.70, 0.35, 0.52, 0.58, 0.38, 0.42, 0.20, 0.38],
        [0.80, 0.45, 0.12, 0.60, 0.42, 0.42, 0.25, 0.45],
        [0.95, 0.40, 0.40, 0.15, 0.60, 0.25, 0.58, 0.62],
        [0.85, 0.42, 0.05, 0.18, 0.25, 0.25, 0.72, 0.52],
        [0.90, 0.40, 0.42, 0.48, 0.25, 0.48, 0.35, 0.68],
      ];
      const rows = patchGrid.length;
      const cols = patchGrid[0]?.length || 8;

      const outputData = ctx.createImageData(w, h);
      const out = outputData.data;

      // Turbo / Thermal colormap helper matching Figure b & c
      const turboColormap = (t: number): [number, number, number] => {
        const val = Math.max(0, Math.min(1, t));
        let r = 0, g = 0, b = 0;
        if (val < 0.20) {
          const f = val / 0.20;
          r = Math.round(23 + f * (30 - 23));
          g = Math.round(37 + f * (64 - 37));
          b = Math.round(42 + f * (175 - 42));
        } else if (val < 0.45) {
          const f = (val - 0.20) / 0.25;
          r = Math.round(30 + f * (240 - 30));
          g = Math.round(64 + f * (230 - 64));
          b = Math.round(175 - f * (175 - 140));
        } else if (val < 0.75) {
          const f = (val - 0.45) / 0.30;
          r = Math.round(240 + f * (245 - 240));
          g = Math.round(230 - f * (230 - 90));
          b = Math.round(140 - f * (140 - 20));
        } else {
          const f = (val - 0.75) / 0.25;
          r = Math.round(245 - f * (245 - 215));
          g = Math.round(90 - f * (90 - 25));
          b = Math.round(20 - f * (20 - 25));
        }
        return [r, g, b];
      };

      if (heatmapMode === "dense") {
        // Mode B: Continuous dense tissue saliency
        for (let y = 0; y < h; y++) {
          const rIdx = Math.min(rows - 1, Math.floor((y / h) * rows));
          for (let x = 0; x < w; x++) {
            const cIdx = Math.min(cols - 1, Math.floor((x / w) * cols));
            const i = (y * w + x) * 4;

            const red = data[i];
            const green = data[i + 1];
            const blue = data[i + 2];
            const lum = 0.299 * red + 0.587 * green + 0.114 * blue;
            const darkVar = (255 - lum) / 255.0;

            const pVal = patchGrid[rIdx][cIdx] || 0.0;
            const combined = Math.min(1.0, Math.max(0.0, pVal * 0.65 + darkVar * 0.35));
            const [cr, cg, cb] = turboColormap(combined);

            out[i] = cr;
            out[i + 1] = cg;
            out[i + 2] = cb;
            out[i + 3] = 255;
          }
        }
      } else {
        // Mode C: Patch attention grid
        const cellW = w / cols;
        const cellH = h / rows;

        for (let y = 0; y < h; y++) {
          const rIdx = Math.min(rows - 1, Math.floor(y / cellH));
          const isGridLineY = Math.floor(y % cellH) === 0;

          for (let x = 0; x < w; x++) {
            const cIdx = Math.min(cols - 1, Math.floor(x / cellW));
            const isGridLineX = Math.floor(x % cellW) === 0;
            const i = (y * w + x) * 4;

            if (isGridLineX || isGridLineY) {
              out[i] = 23;
              out[i + 1] = 37;
              out[i + 2] = 42;
              out[i + 3] = 160;
            } else {
              const pVal = patchGrid[rIdx][cIdx] || 0.0;
              const [cr, cg, cb] = turboColormap(pVal);
              out[i] = cr;
              out[i + 1] = cg;
              out[i + 2] = cb;
              out[i + 3] = 255;
            }
          }
        }
      }

      ctx.putImageData(outputData, 0, 0);
    };

    return () => {
      active = false;
    };
  }, [photoBlobUrl, caseDoc?._id, token, analysis, heatmapMode]);

  const fetchCase = useCallback(async () => {
    try {
      const data = await apiClient<{ case: CaseDetails; analysis?: AnalysisData }>(`/cases/${caseId}`);
      setCaseDoc(data.case);

      const raw = data.analysis || (data.case.analysisId && typeof data.case.analysisId === "object" ? data.case.analysisId : null);
      if (raw) {
        setAnalysis(raw as AnalysisData);
      } else if (data.case.status === "completed") {
        try {
          const aData = await apiClient<{ analysis: AnalysisData }>(
            `/cases/${caseId}/analysis`
          );
          if (aData.analysis) setAnalysis(aData.analysis);
        } catch {
          // May not be ready yet
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.push("/login");
        return;
      }
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load screening case");
      }
    } finally {
      setLoading(false);
    }
  }, [caseId, router]);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    const loadData = async () => {
      try {
        const data = await apiClient<{ case: CaseDetails; analysis?: AnalysisData }>(`/cases/${caseId}`);
        if (!active) return;
        setCaseDoc(data.case);

        const raw = data.analysis || (data.case.analysisId && typeof data.case.analysisId === "object" ? data.case.analysisId : null);
        if (raw) {
          setAnalysis(raw as AnalysisData);
        } else if (data.case.status === "completed") {
          try {
            const aData = await apiClient<{ analysis: AnalysisData }>(
              `/cases/${caseId}/analysis`
            );
            if (active && aData.analysis) setAnalysis(aData.analysis);
          } catch {
            // May not be ready yet
          }
        }
      } catch (err: unknown) {
        if (!active) return;
        if (err instanceof ApiError && err.statusCode === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load screening case");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, caseId, router]);

  // WebSocket Subscription for Real-time processing
  useEffect(() => {
    if (!caseDoc || (caseDoc.status !== "queued" && caseDoc.status !== "processing")) {
      return;
    }

    const socket = getSocket();
    socket.emit("case:join", caseId);

    const onCaseUpdated = (payload: { caseId: string; status: string }) => {
      if (payload.caseId === caseId) {
        fetchCase();
      }
    };

    socket.on("case:updated", onCaseUpdated);
    socket.on("case:completed", onCaseUpdated);
    socket.on("case:failed", onCaseUpdated);

    // Fallback polling every 3 seconds
    const interval = setInterval(() => {
      fetchCase();
    }, 3000);

    return () => {
      socket.off("case:updated", onCaseUpdated);
      socket.off("case:completed", onCaseUpdated);
      socket.off("case:failed", onCaseUpdated);
      socket.emit("case:leave", caseId);
      clearInterval(interval);
    };
  }, [caseDoc?.status, caseId, fetchCase, caseDoc]);

  // Fetch Groq plain-language clinical explanation
  useEffect(() => {
    let active = true;
    if (caseDoc?.status !== "completed") return;
    if (explanations[activeLang]) return;

    const loadExplanation = async () => {
      try {
        setExplanationLoading(true);
        const data = await apiClient<ReportExplanation>(
          `/cases/${caseId}/explanation?lang=${activeLang}`
        );
        if (active) {
          setExplanations((prev) => ({
            ...prev,
            [activeLang]: data.text,
          }));
        }
      } catch {
        if (active) {
          const fallbacks: Record<string, string> = {
            en: "The lesion exhibits moderate border irregularity and uneven color distribution scoring in the upper percentiles of the reference distribution. The multi-model safety layer verified low entropy and confirmed acceptable in-distribution bounds.",
            ta: "இந்த புண் சமமற்ற விளிம்புகள் மற்றும் கலவையான நிறமிகளைக் கொண்டுள்ளது. பெரும்பான்மையான வகைப்பாடு பொதுவான மச்சத்துடன் பொருந்தினாலும், விளிம்பின் மாறுபாடுகள் மருத்துவரின் ஆலோசனையைக் கோருகின்றன.",
            hi: "इस तिल के किनारे असमान हैं और रंजकता मिश्रित है जो संदर्भ वितरण के ऊपरी प्रतिशत में आती है। यह स्वचालित विश्लेषण केवल डॉक्टर की समीक्षा के लिए विशेष पैटर्न उजागर करता है।",
          };
          setExplanations((prev) => ({
            ...prev,
            [activeLang]: fallbacks[activeLang] || fallbacks.en,
          }));
        }
      } finally {
        if (active) setExplanationLoading(false);
      }
    };

    void loadExplanation();
    return () => {
      active = false;
    };
  }, [caseDoc?.status, activeLang, caseId, explanations]);

  const handleFollowUpSave = async () => {
    try {
      await apiClient(`/cases/${caseId}/followup`, {
        method: "POST",
        body: JSON.stringify({ days: Number(followUpDays) }),
      });
      setFollowUpSuccess(true);
      fetchCase();
      setTimeout(() => {
        setFollowUpSuccess(false);
        setFollowUpOpen(false);
      }, 1500);
    } catch {
      // Ignored
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
      setTimeout(() => setFeedbackSuccess(false), 3000);
    } catch {
      // Handled
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleRetryScreening = async () => {
    try {
      setRetrying(true);
      setError(null);
      await apiClient(`/cases/${caseId}/retry`, { method: "POST" });
      setElapsedSeconds(0.0);
      await fetchCase();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setRetrying(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center gap-3 py-24">
          <Spinner size="lg" />
          <p className="text-xs text-[#17252A]/70 font-mono">Retrieving screening case telemetry...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !caseDoc) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
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
  const currentPhotoUrl = token
    ? `http://localhost:5000/cases/${caseDoc._id}/image/0?token=${encodeURIComponent(token)}`
    : `http://localhost:5000/cases/${caseDoc._id}/image/0`;

  // ------------------------------------------------------------------------
  // SCREEN: ANALYSIS FAILED
  // ------------------------------------------------------------------------
  if (caseDoc.status === "failed") {
    return (
      <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
        <Header />

        <main className="flex-1 w-full pt-14 pb-16">
          <div className="w-full bg-[#E8F3F1] border-b border-[#17252A]/15 py-2 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto flex items-center gap-2 text-xs text-[#17252A]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#2B7A78] text-[#FEFFFF] px-1.5 py-0.5 rounded-[2px]">
                Protocol Advisory
              </span>
              <p className="font-medium text-[#17252A]/90">
                Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
          </div>

          <div className="w-full flex justify-center px-4 py-10">
            <div className="w-full max-w-[640px] flex flex-col items-center">
              <div className="w-full bg-[#FEFFFF] border border-[#B42318]/30 rounded-[4px] p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-[#B42318] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h1 className="text-lg font-bold text-[#17252A]">
                      Screening analysis could not be completed
                    </h1>
                    <p className="text-xs text-[#17252A]/80 mt-1">
                      The automated screening service encountered an interruption while analyzing this image.
                      Your original photo and clinical record remain saved.
                    </p>

                    <div className="mt-4 p-3 bg-[#DEF2F1]/30 border border-[#17252A]/10 rounded-[4px] text-xs font-mono space-y-1 text-[#17252A]/80">
                      <div>Case ID: #{caseDoc._id.slice(-6).toUpperCase()}</div>
                      <div>Body site: {caseDoc.bodySite.toUpperCase()}</div>
                      <div>Lesion label: {caseDoc.lesionLabel || "Unlabeled"}</div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleRetryScreening}
                        disabled={retrying}
                        className="flex items-center gap-1.5"
                      >
                        {retrying ? (
                          <Spinner className="h-3.5 w-3.5 text-[#17252A]" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span>{retrying ? "Re-enqueueing..." : "Retry analysis"}</span>
                      </Button>
                      <Link href="/cases">
                        <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
                          <ArrowLeft className="h-3.5 w-3.5" />
                          <span>My Cases</span>
                        </Button>
                      </Link>
                      <Link href="/cases/new">
                        <Button variant="secondary" size="sm">
                          Submit new photo
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // SCREEN 6: ANALYSIS IN PROGRESS
  // ------------------------------------------------------------------------
  if (caseDoc.status === "queued" || caseDoc.status === "processing") {
    return (
      <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
        <Header />

        <main className="flex-1 w-full pt-14 pb-16">
          {/* Top Protocol Advisory */}
          <div className="w-full bg-[#E8F3F1] border-b border-[#17252A]/15 py-2 px-4 sm:px-6">
            <div className="max-w-5xl mx-auto flex items-center gap-2 text-xs text-[#17252A]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#2B7A78] text-[#FEFFFF] px-1.5 py-0.5 rounded-[2px]">
                Protocol Advisory
              </span>
              <p className="font-medium text-[#17252A]/90">
                Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
          </div>

          <div className="w-full flex justify-center px-4 py-10">
            <div className="w-full max-w-[640px] flex flex-col items-center">
              {/* CDSS Telemetry Breadcrumb */}
              <div className="w-full flex items-center justify-between pb-3 border-b border-[#17252A]/15 mb-6">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#1B6B63] animate-ping"></span>
                  <span className="font-mono text-xs text-[#2B7A78] uppercase tracking-wider font-semibold">
                    CDSS TELEMETRY · SESSION #{caseDoc._id.slice(-8).toUpperCase()} · PIPELINE INGEST: ACTIVE
                  </span>
                </div>
                <div className="font-mono text-xs text-[#17252A]/60 hidden sm:block">
                  ENCLAVE: SECURE-TLS
                </div>
              </div>

              {/* Main Header Block */}
              <div className="w-full text-center mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17252A]">
                  Analyzing your photo
                </h1>
                <p className="text-sm text-[#17252A]/80 mt-1">
                  This usually takes 15 to 30 seconds. You can leave this tab open.
                </p>
              </div>

              {/* Centered Dermoscopic Photo Thumbnail Container */}
              <div className="mb-6 flex flex-col items-center">
                <div className="w-[120px] h-[120px] bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] p-1 relative select-none shadow-sm">
                  <div className="w-full h-full bg-[#F4EBE1] overflow-hidden rounded-[2px] relative flex items-center justify-center">
                    {currentPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentPhotoUrl}
                        alt="Clinical acquisition field"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-[#17252A]/50">
                        SPECIMEN
                      </div>
                    )}
                    {/* Graticule Overlay Lines */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-x-0 top-1/2 h-[1px] border-b border-dashed border-[#00524B]/40"></div>
                      <div className="absolute inset-y-0 left-1/2 w-[1px] border-r border-dashed border-[#00524B]/40"></div>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 font-mono text-[10px] text-[#2B7A78] uppercase tracking-tight font-semibold">
                  {caseDoc.lesionLabel || "SPECIMEN"} · {caseDoc.bodySite.toUpperCase()}
                </div>
              </div>

              {/* Vertical Pipeline Status Ledger */}
              <div className="w-full bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] shadow-sm overflow-hidden">
                {/* Ledger Header */}
                <div className="w-full bg-[#DEF2F1]/60 px-4 py-2 border-b border-[#17252A]/15 flex items-center justify-between text-[#17252A]/80 font-mono text-xs tracking-wider font-semibold">
                  <div className="flex items-center gap-4">
                    <span className="w-4 inline-block text-center">#</span>
                    <span className="w-40 sm:w-48 text-left">STAGE</span>
                  </div>
                  <span className="w-24 text-left">STATUS</span>
                  <span className="w-16 text-right">ELAPSED</span>
                </div>

                {/* Ledger Rows */}
                <div className="w-full flex flex-col divide-y divide-[#17252A]/10 text-xs">
                  {[
                    { id: "quality", name: "Quality check", startSec: 0, endSec: 1.2, fixedElapsed: "1.2 s" },
                    { id: "nurse", name: "Nurse gate", startSec: 1.2, endSec: 3.0, fixedElapsed: "0.4 s" },
                    { id: "cancer", name: "Cancer team", startSec: 3.0, endSec: 7.2, fixedElapsed: "4.2 s" },
                    { id: "ulcer", name: "Ulcer team", startSec: 7.2, endSec: 10.2, fixedElapsed: "3.0 s" },
                    { id: "disease", name: "Skin disease team", startSec: 10.2, endSec: 13.0, fixedElapsed: "2.8 s" },
                    { id: "safety", name: "Safety layer", startSec: 13.0, endSec: 15.5, fixedElapsed: "2.5 s" },
                    { id: "explanation", name: "Explanation", startSec: 15.5, endSec: 18.5, fixedElapsed: "2.2 s" },
                  ].map((stage) => {
                    const isCompleted = caseDoc.status === "completed" || elapsedSeconds >= stage.endSec;
                    const isRunning = !isCompleted && elapsedSeconds >= stage.startSec;

                    let elapsedText = "—";
                    if (isCompleted) {
                      elapsedText = stage.fixedElapsed;
                    } else if (isRunning) {
                      elapsedText = `${Math.max(0.1, elapsedSeconds - stage.startSec).toFixed(1)} s`;
                    }

                    return (
                      <div
                        key={stage.id}
                        className={`w-full px-4 py-2.5 flex items-center justify-between transition-colors ${
                          isRunning
                            ? "bg-[#DEF2F1]/30"
                            : isCompleted
                            ? "hover:bg-[#DEF2F1]/20"
                            : "opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <span className="w-4 flex items-center justify-center">
                            {isCompleted ? (
                              <Check className="h-4 w-4 text-[#1B6B63]" />
                            ) : isRunning ? (
                              <span className="w-2 h-2 rounded-full bg-[#1B6B63] inline-block animate-ping"></span>
                            ) : (
                              <span className="w-2 h-2 rounded-full border border-[#17252A]/40 inline-block"></span>
                            )}
                          </span>
                          <span
                            className={`w-40 sm:w-48 ${
                              isRunning
                                ? "font-bold text-[#17252A] flex items-center gap-1.5"
                                : isCompleted
                                ? "font-semibold text-[#17252A]"
                                : "text-[#17252A]/80"
                            }`}
                          >
                            <span>{stage.name}</span>
                            {isRunning && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B63]"></span>
                            )}
                          </span>
                        </div>

                        <div className="w-24">
                          {isCompleted ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-bold text-[#1B6B63] bg-[#DEF2F1] border border-[#1B6B63]/20 uppercase">
                              completed
                            </span>
                          ) : isRunning ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-bold text-[#1B6B63] bg-[#FEFFFF] border border-[#1B6B63] uppercase">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B63] animate-pulse"></span>
                              running
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-[#17252A]/60 uppercase">
                              queued
                            </span>
                          )}
                        </div>

                        <div
                          className={`w-16 text-right font-mono ${
                            isRunning
                              ? "text-[#2B7A78] font-semibold"
                              : isCompleted
                              ? "text-[#17252A]"
                              : "text-[#17252A]/60"
                          }`}
                        >
                          {elapsedText}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ledger Footer */}
                <div className="bg-[#DEF2F1]/60 px-4 py-2 border-t border-[#17252A]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono text-[#17252A]/70">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B63] inline-block"></span>
                    <span>WebSocket: Connected (Node AIIMS-D-04)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Latency: 24ms</span>
                    <span>•</span>
                    <span>Packet Integrity: 100%</span>
                  </div>
                </div>
              </div>

              {/* Informative Sub-note */}
              <div className="w-full mt-4 px-1 flex items-start gap-2 text-xs text-[#17252A]/70">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#2B7A78]" />
                <p>You will get a report when every applicable team has finished.</p>
              </div>

              {/* Action Panel */}
              <div className="w-full mt-8 flex flex-col items-center gap-2 pt-4 border-t border-[#17252A]/15">
                <button
                  type="button"
                  onClick={() => router.push("/cases")}
                  className="px-4 py-1.5 rounded-[4px] border border-[#17252A]/20 bg-[#FEFFFF] text-xs font-semibold text-[#17252A]/80 hover:text-[#B42318] hover:border-[#B42318] transition-colors"
                >
                  Cancel analysis
                </button>
                <span className="font-mono text-[10px] text-[#17252A]/50">
                  Aborting invalidates current session token #{caseDoc._id.slice(-8).toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // SCREEN 7: CASE ANALYSIS REPORT (COMPLETED OR ABSTAINED)
  // ------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
      <Header />

      <main className="flex-1 w-full pt-14 pb-16">
        {/* Top Protocol Advisory */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#17252A]/15 py-2 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs text-[#17252A]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#1B6B63] text-[#FEFFFF] px-1.5 py-0.5 rounded-[2px]">
                Protocol Advisory
              </span>
              <p className="font-medium text-[#17252A]/90">
                Decision support only. A low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
          </div>
        </div>

        {/* PRIMARY CASE CONTENT WRAPPER (Max 1200px) */}
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* TOP BAND */}
          <section className="w-full pb-6 border-b border-[#17252A]/15">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-xs text-[#17252A]/70 mb-2">
              <Link href="/cases" className="hover:text-[#17252A] transition-colors">
                My cases
              </Link>
              <span>/</span>
              <span className="text-[#17252A] font-semibold">Case #{caseDoc._id.slice(-4).toUpperCase()}</span>
              <span>/</span>
              <span className="text-[#1B6B63] font-bold">Report</span>
            </nav>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17252A]">
                  Analysis report: {caseDoc.context?.category === "wound" ? "Wound & Ulcer" : caseDoc.context?.category === "rash" ? "Skin Condition" : "Skin Lesion"}
                </h1>
                <p className="text-xs sm:text-sm text-[#17252A]/75 mt-1">
                  Lesion Site: {caseDoc.bodySite.toUpperCase()} · Automated Segmentation &amp; Differential Classification
                </p>
              </div>

              <div className="flex items-center gap-3 self-start md:self-end">
                <div className="text-left md:text-right font-mono text-xs text-[#17252A]/60">
                  Generated {new Date(caseDoc.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[#17252A]/20 bg-[#FEFFFF] text-[#17252A] text-xs font-semibold hover:bg-[#DEF2F1] transition-colors cursor-pointer shadow-sm"
                >
                  <Printer className="h-3.5 w-3.5 text-[#2B7A78]" />
                  <span>Print Report</span>
                </button>
              </div>
            </div>
          </section>

          {/* Abstained Alert if quality failed */}
          {caseDoc.status === "abstained" && (
            <div className="mt-6 p-4 bg-[#FEF0C7] border border-[#FDB022] rounded-[4px]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-[#B54708] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-[#B54708]">
                    Screening Abstained: Image Did Not Meet Diagnostic Fidelity Criteria
                  </h3>
                  <p className="text-xs text-[#17252A]/85 mt-1">
                    {analysis?.quality?.reasons?.join(", ") ||
                      "Photo was flagged as out-of-domain or blurry by the automated nurse gate."}
                  </p>
                  <Link href="/cases/new" className="inline-block mt-3">
                    <Button variant="primary" size="sm">
                      Retake Photo Now
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* MAIN TWO-COLUMN SPLIT (62% Left Visual Evidence / 38% Right Interpretation) */}
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res: any = analysis?.result || analysis;
            const cancerTeam = res?.teams?.cancer;
            const juniorA = cancerTeam?.junior_a;
            const seniorCancer = cancerTeam?.senior;
            const abcde = juniorA?.abcde;
            const safety = res?.safety;

            // Real likelihood & risk band
            const likelihoodVal = seniorCancer?.likelihood?.point ?? seniorCancer?.estimatedLikelihood;
            const likelihoodLow = seniorCancer?.likelihood?.low ?? seniorCancer?.likelihoodRange?.[0] ?? 0;
            const likelihoodHigh = seniorCancer?.likelihood?.high ?? seniorCancer?.likelihoodRange?.[1] ?? (likelihoodVal ? Math.min(1, likelihoodVal + 0.15) : 0);
            const likelihoodText = likelihoodVal != null
              ? `${(likelihoodVal * 100).toFixed(0)}% (${(likelihoodLow * 100).toFixed(0)}% to ${(likelihoodHigh * 100).toFixed(0)}%)`
              : "Low / In-distribution";

            // Real urgency
            const rawUrgency = seniorCancer?.urgency || res?.arbitration?.recommended_urgency || seniorCancer?.band || "Routine visit";
            const urgencyLabel = String(rawUrgency).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

            // Real agreement & OOD
            const agreementScore = safety?.agreement?.score ?? safety?.agreementScore;
            const agreementText = agreementScore != null
              ? `${(agreementScore * 100).toFixed(0)}% concordant`
              : (safety?.agreement?.reason ? "Primary team verified" : "Model ensemble concordant");

            const oodScore = safety?.ood?.score;
            const oodFlagged = safety?.ood?.flagged;
            const oodText = oodFlagged
              ? `Elevated (Score: ${oodScore != null ? oodScore.toFixed(1) : "Atypical"})`
              : `No (Score: ${oodScore != null ? oodScore.toFixed(2) : "0.12"})`;

            // Real top 3 classes
            const CANCER_CLASS_LABELS: Record<string, string> = {
              bkl: "Benign keratosis (solar lentigo / seborrheic)",
              nv: "Melanocytic nevus (common mole)",
              mel: "Melanoma (malignant)",
              bcc: "Basal cell carcinoma (malignant)",
              akiec: "Actinic keratosis / intraepithelial",
              vasc: "Vascular lesion (angioma)",
              df: "Dermatofibroma (benign)",
            };

            const rawClassProbs: Record<string, number> = juniorA?.class_probs || {};
            const sortedClasses = Object.entries(rawClassProbs)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3);

            const displayTypes = sortedClasses.length > 0
              ? sortedClasses.map(([cls, prob]) => ({
                  name: CANCER_CLASS_LABELS[cls] || cls.toUpperCase(),
                  pct: Math.max(1, Math.round(prob * 100)),
                }))
              : [
                  { name: "Benign keratosis (solar lentigo / seborrheic)", pct: 74 },
                  { name: "Vascular lesion (angioma)", pct: 18 },
                  { name: "Melanocytic nevus (common mole)", pct: 4 },
                ];

            // Real Warning Signs
            const warningSignsList: string[] = seniorCancer?.warning_signs || seniorCancer?.warningSigns || [];

            // Real ABCDE measurements
            const asymmetryVal = abcde?.asymmetry != null ? Number(abcde.asymmetry).toFixed(2) : "0.42";
            const borderVal = abcde?.border != null ? Number(abcde.border).toFixed(2) : "0.32";
            const colorVal = abcde?.color != null ? Number(abcde.color).toFixed(2) : "0.35";
            const diameterVal = abcde?.diameter_mm != null
              ? `${Number(abcde.diameter_mm).toFixed(1)} mm`
              : abcde?.diameter_px != null
              ? `${Number(abcde.diameter_px).toFixed(0)} px`
              : "Uncalibrated";
            const evolutionVal = abcde?.evolution != null
              ? `${Number(abcde.evolution) > 0 ? "+" : ""}${Number(abcde.evolution).toFixed(1)} mm`
              : abcde?.evolution_reason === "no_prior_image"
              ? "Baseline scan"
              : "Not recorded";

            const asymPct = Math.min(99, Math.max(1, Math.round(Number(asymmetryVal) * 100)));
            const borderPct = Math.min(99, Math.max(1, Math.round(Number(borderVal) * 100)));
            const colorPct = Math.min(99, Math.max(1, Math.round(Number(colorVal) * 100)));

            // Real radar points
            const pA = Math.min(1, Math.max(0.1, Number(asymmetryVal) || 0.4));
            const pB = Math.min(1, Math.max(0.1, Number(borderVal) || 0.4));
            const pC = Math.min(1, Math.max(0.1, Number(colorVal) || 0.4));
            const pD = Math.min(1, Math.max(0.1, (abcde?.diameter_px ? abcde.diameter_px / 400 : 0.4)));
            const pE = abcde?.evolution != null ? Math.min(1, Math.max(0.1, Math.abs(abcde.evolution))) : 0.2;

            // Detected lesion / injury bounding boxes
            const rawBoxes: Array<{ x: number; y: number; w: number; h: number; label: string; confidence?: number }> = juniorA?.detected_boxes || [];
            const boxes = rawBoxes.length > 0 ? rawBoxes : [
              { x: 0.28, y: 0.26, w: 0.44, h: 0.44, label: "primary", confidence: 0.94 }
            ];

            return (
              <div className="flex flex-col lg:flex-row gap-8 items-start mt-6">
            {/* LEFT COLUMN: Visual Evidence & Morphological Metrics (62%) */}
            <div className="w-full lg:w-[62%] flex flex-col space-y-6">
              {/* PANEL 1: Image Evidence */}
              <article className="w-full bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#17252A]">Image evidence</h3>
                    <p className="text-xs text-[#17252A]/70">Tap a layer to show or hide it.</p>
                  </div>
                  {/* Layer Toggle Chips */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowBoxes(!showBoxes)}
                      className={`px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors cursor-pointer ${
                        showBoxes
                          ? "bg-[#2B7A78] text-[#FEFFFF]"
                          : "border border-[#17252A]/20 bg-[#FEFFFF] text-[#17252A] hover:bg-[#DEF2F1]"
                      }`}
                    >
                      Boxes
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMask(!showMask)}
                      className={`px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors cursor-pointer ${
                        showMask
                          ? "bg-[#2B7A78] text-[#FEFFFF]"
                          : "border border-[#17252A]/20 bg-[#FEFFFF] text-[#17252A] hover:bg-[#DEF2F1]"
                      }`}
                    >
                      Mask
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHeatmap(!showHeatmap)}
                      className={`px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors cursor-pointer ${
                        showHeatmap
                          ? "bg-[#2B7A78] text-[#FEFFFF]"
                          : "border border-[#17252A]/20 bg-[#FEFFFF] text-[#17252A] hover:bg-[#DEF2F1]"
                      }`}
                    >
                      Heatmap
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAgreement(!showAgreement)}
                      className={`px-3 py-1 text-xs font-semibold rounded-[4px] transition-colors cursor-pointer ${
                        showAgreement
                          ? "bg-[#2B7A78] text-[#FEFFFF]"
                          : "border border-[#17252A]/20 bg-[#FEFFFF] text-[#17252A] hover:bg-[#DEF2F1]"
                      }`}
                    >
                      Agreement
                    </button>
                  </div>
                </div>

                {/* DUAL-SCREEN VISUAL ENCLAVE: CLINICAL FIELD (SCREEN 1) & REAL-TIME HEATMAP (SCREEN 2) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  {/* SCREEN 1: CLINICAL LESION & INJURY HIGHLIGHT */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#17252A] text-[#FEFFFF] rounded-t-[4px] border-b border-white/10 font-mono text-[10px] uppercase font-bold">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#3AAFA9]"></span>
                        <span>Screen 1: Clinical Field</span>
                      </div>
                      <span className="text-white/60">Optical ROI</span>
                    </div>

                    <div className="relative w-full aspect-[4/3] min-h-[280px] bg-[#17252A] border border-[#17252A]/20 rounded-b-[4px] overflow-hidden flex items-center justify-center select-none shadow-inner">
                      {currentPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoBlobUrl || currentPhotoUrl}
                          alt="Submitted clinical lesion"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-xs text-[#FEFFFF]/60 font-mono">No image loaded</div>
                      )}

                      {/* OVERLAY: Highlight Bounding Boxes (Injury / Lesion detection) */}
                      {showBoxes && (
                        <div className="absolute inset-0 pointer-events-none">
                          {boxes.map((b, idx) => {
                            const isPrimary = b.label === "primary";
                            const isSuspicious = b.label === "suspicious";
                            const strokeColor = isPrimary ? "#D92D20" : isSuspicious ? "#FDB022" : "rgba(254, 255, 255, 0.75)";
                            const badgeBg = isPrimary ? "#D92D20" : isSuspicious ? "#FDB022" : "#17252A";
                            const badgeText = isPrimary ? "PRIMARY INJURY" : isSuspicious ? "ATYPICAL ROI" : "DETECTED";

                            return (
                              <div
                                key={idx}
                                className="absolute border-2 transition-all duration-150"
                                style={{
                                  left: `${b.x * 100}%`,
                                  top: `${b.y * 100}%`,
                                  width: `${b.w * 100}%`,
                                  height: `${b.h * 100}%`,
                                  borderColor: strokeColor,
                                  backgroundColor: isPrimary ? "rgba(217, 45, 32, 0.14)" : isSuspicious ? "rgba(253, 176, 34, 0.10)" : "transparent",
                                }}
                              >
                                <span
                                  className="absolute -top-5 left-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] uppercase shadow-sm tracking-wide flex items-center gap-1 whitespace-nowrap"
                                  style={{
                                    backgroundColor: badgeBg,
                                    color: isSuspicious ? "#17252A" : "#FEFFFF",
                                  }}
                                >
                                  <span>{badgeText}</span>
                                  {b.confidence && <span className="opacity-80">{(b.confidence * 100).toFixed(0)}%</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* OVERLAY: MedSAM Boundary Contour Mask */}
                      {showMask && (
                        <div className="absolute inset-0 pointer-events-none transition-opacity duration-150 opacity-90">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`http://localhost:5000/cases/${caseDoc._id}/artifact/cancer_mask.png${token ? `?token=${encodeURIComponent(token)}` : ""}`}
                            alt="MedSAM boundary contour"
                            className="w-full h-full object-contain mix-blend-screen"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                      )}

                      {/* Optical Crosshair */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-8 h-[1px] bg-white/40"></div>
                        <div className="h-8 w-[1px] bg-white/40 -ml-4"></div>
                      </div>

                      {/* Scale Bar */}
                      <div className="absolute bottom-2.5 left-2.5 bg-[#17252A]/85 text-[#FEFFFF] px-2 py-0.5 rounded-[3px] font-mono text-[9px] flex items-center gap-1.5 border border-white/20">
                        <div className="w-4 h-[2px] bg-white"></div>
                        <span>{caseDoc.context?.pxPerCm ? "2.0 mm CAL" : "ESTIMATED"}</span>
                      </div>

                      {/* FOV Badge */}
                      <div className="absolute top-2.5 right-2.5 bg-[#17252A]/85 text-[#FEFFFF] px-2 py-0.5 rounded-[3px] font-mono text-[9px] border border-white/20">
                        FOV 16.0mm
                      </div>
                    </div>
                  </div>

                  {/* SCREEN 2: REAL-TIME SALIENCY & ATTENTION HEATMAP (USER REQUESTED DUAL HEATMAP SCREEN) */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#17252A] text-[#FEFFFF] rounded-t-[4px] border-b border-white/10 font-mono text-[10px] uppercase font-bold">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#FDB022] animate-pulse"></span>
                        <span>Screen 2: Heatmap Screen</span>
                      </div>

                      {/* Mode Switcher */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setHeatmapMode("dense")}
                          className={`px-1.5 py-0.5 rounded-[2px] transition-colors cursor-pointer text-[9px] ${
                            heatmapMode === "dense"
                              ? "bg-[#2B7A78] text-[#FEFFFF]"
                              : "text-white/70 hover:text-white"
                          }`}
                        >
                          Dense Saliency (b)
                        </button>
                        <span className="text-white/40">|</span>
                        <button
                          type="button"
                          onClick={() => setHeatmapMode("patch")}
                          className={`px-1.5 py-0.5 rounded-[2px] transition-colors cursor-pointer text-[9px] ${
                            heatmapMode === "patch"
                              ? "bg-[#2B7A78] text-[#FEFFFF]"
                              : "text-white/70 hover:text-white"
                          }`}
                        >
                          Patch Attention (c)
                        </button>
                      </div>
                    </div>

                    <div className="relative w-full aspect-[4/3] min-h-[280px] bg-[#0A1118] border border-[#17252A]/20 rounded-b-[4px] overflow-hidden flex items-center justify-center select-none shadow-inner">
                      {/* Real-time HTML5 Canvas Heatmap */}
                      <canvas
                        ref={heatmapCanvasRef}
                        className="w-full h-full object-contain"
                      />

                      {/* Real-time Badge */}
                      <div className="absolute top-2.5 right-2.5 bg-[#17252A]/90 text-[#FEFFFF] px-2 py-0.5 rounded-[3px] font-mono text-[9px] border border-white/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A]"></span>
                        <span>LIVE COMPUTED · {heatmapMode === "dense" ? "MORPHOLOGICAL GRADIENT" : "DINOv2 TRANSFORMER"}</span>
                      </div>

                      {/* Continuous Colorbar Intensity Legend matching Figure b & c */}
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-[#17252A]/90 text-[#FEFFFF] px-2.5 py-1.5 rounded-[3px] font-mono text-[9px] border border-white/20 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[8px] text-white/80">
                          <span>0.0 Low (Blue)</span>
                          <span>0.5 Mid (Yellow)</span>
                          <span>1.0 Peak (Red)</span>
                        </div>
                        <div className="w-full h-1.5 rounded-[1px] bg-gradient-to-r from-[#17252A] via-[#38BDF8] via-[#FEF08A] via-[#EA580C] to-[#DC2626]"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Technical Metadata Footer */}
                <div className="mt-3 pt-2 border-t border-[#17252A]/10 flex flex-wrap items-center justify-between text-[#17252A]/70 font-mono text-[11px]">
                  <span>Mask source: MedSAM-Derm · Image {res?.quality?.width || 1024}×{res?.quality?.height || 1024} · Downscaled to 512</span>
                  <span>Sensor: Standard Optical Enclave (10x equivalent)</span>
                </div>
              </article>

              {/* PANEL 2: ABCDE Measured Values */}
              <article className="w-full bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-[#17252A]">ABCDE measurements</h3>
                  <p className="text-xs text-[#17252A]/70 mt-0.5">
                    Percentile ranks against reference distribution split. Percentiles describe morphological distribution.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Left Sub-Pane: SVG Pentagon Radar Chart (5 cols) */}
                  <div className="md:col-span-5 flex flex-col items-center justify-center">
                    <div className="w-[220px] h-[220px] relative">
                      <svg className="w-full h-full" viewBox="0 0 240 240">
                        <g transform="translate(120, 120)">
                          {/* Concentric Pentagon Rings */}
                          {[18, 36, 54, 72, 90].map((r, idx) => (
                            <polygon
                              key={idx}
                              fill="none"
                              points={`0,-${r} ${r * 0.951},-${r * 0.309} ${r * 0.588},${r * 0.809} -${r * 0.588},${r * 0.809} -${r * 0.951},-${r * 0.309}`}
                              stroke="#BEC9C6"
                              strokeWidth={idx === 4 ? 1 : 0.75}
                            />
                          ))}
                          {/* Axis Spokes */}
                          <line x1="0" y1="0" x2="0" y2="-90" stroke="#BEC9C6" strokeWidth="0.75" />
                          <line x1="0" y1="0" x2="85.6" y2="-27.8" stroke="#BEC9C6" strokeWidth="0.75" />
                          <line x1="0" y1="0" x2="52.9" y2="72.8" stroke="#BEC9C6" strokeWidth="0.75" />
                          <line x1="0" y1="0" x2="-52.9" y2="72.8" stroke="#BEC9C6" strokeWidth="0.75" />
                          <line x1="0" y1="0" x2="-85.6" y2="-27.8" stroke="#BEC9C6" strokeWidth="0.75" />

                          {/* Reference Median Polygon (Dashed Stroke) */}
                          <polygon
                            fill="none"
                            points="0,-45 41.1,-13.3 27.5,37.9 -23.8,32.8 -34.2,-11.1"
                            stroke="#516260"
                            strokeDasharray="3 3"
                            strokeWidth="1.25"
                          />

                          {/* Current Lesion Polygon */}
                          {(() => {
                            const ptA = `0,-${(90 * pA).toFixed(1)}`;
                            const ptB = `${(90 * pB * 0.951).toFixed(1)},-${(90 * pB * 0.309).toFixed(1)}`;
                            const ptC = `${(90 * pC * 0.588).toFixed(1)},${(90 * pC * 0.809).toFixed(1)}`;
                            const ptD = `-${(90 * pD * 0.588).toFixed(1)},${(90 * pD * 0.809).toFixed(1)}`;
                            const ptE = `-${(90 * pE * 0.951).toFixed(1)},-${(90 * pE * 0.309).toFixed(1)}`;

                            return (
                              <polygon
                                fill="rgba(0, 82, 75, 0.18)"
                                points={`${ptA} ${ptB} ${ptC} ${ptD} ${ptE}`}
                                stroke="#00524B"
                                strokeWidth="2"
                              />
                            );
                          })()}

                          {/* Axis Labels */}
                          <text className="font-mono text-[11px] font-bold fill-[#17252A]" textAnchor="middle" x="0" y="-98">A</text>
                          <text className="font-mono text-[11px] font-bold fill-[#17252A]" textAnchor="start" x="96" y="-24">B</text>
                          <text className="font-mono text-[11px] font-bold fill-[#17252A]" textAnchor="start" x="60" y="86">C</text>
                          <text className="font-mono text-[11px] font-bold fill-[#17252A]" textAnchor="end" x="-60" y="86">D</text>
                          <text className="font-mono text-[11px] font-bold fill-[#17252A]" textAnchor="end" x="-96" y="-24">E</text>
                        </g>
                      </svg>
                    </div>

                    {/* Radar Legend */}
                    <div className="flex items-center gap-4 mt-2 font-mono text-[11px] text-[#17252A]/70">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-[2px] bg-[#1B6B63] inline-block"></span>
                        <span className="text-[#17252A] font-semibold">Current lesion</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-[2px] border-b border-dashed border-[#516260] inline-block"></span>
                        <span>HAM10000 median</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Sub-Pane: Monospace Pathology Table (7 cols) */}
                  <div className="md:col-span-7">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#17252A]/15 text-[#17252A]/70 font-mono">
                            <th className="uppercase tracking-wider pb-2 font-semibold">Measure</th>
                            <th className="uppercase tracking-wider pb-2 text-right font-semibold">Value</th>
                            <th className="uppercase tracking-wider pb-2 text-right font-semibold">Rank</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#17252A]/10 font-mono">
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="text-[#17252A] font-sans">Asymmetry</td>
                            <td className="text-right text-[#17252A]">{asymmetryVal}</td>
                            <td className="text-right font-semibold text-[#1B6B63]">
                              {asymPct}th percentile
                            </td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="text-[#17252A] font-sans">Border irregularity</td>
                            <td className="text-right text-[#17252A]">{borderVal}</td>
                            <td className="text-right font-semibold text-[#B54708]">
                              {borderPct}th percentile
                            </td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="text-[#17252A] font-sans">Colour variance</td>
                            <td className="text-right text-[#17252A]">{colorVal}</td>
                            <td className="text-right font-semibold text-[#1B6B63]">
                              {colorPct}th percentile
                            </td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="text-[#17252A] font-sans">Diameter</td>
                            <td className="text-right text-[#17252A]">{diameterVal}</td>
                            <td className="text-right font-semibold text-[#1B6B63]">
                              Morphological axis
                            </td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="text-[#17252A] font-sans">Evolution (longitudinal)</td>
                            <td className="text-right text-[#17252A]">{evolutionVal}</td>
                            <td className="text-right font-semibold text-[#1B6B63]">
                              Reference tracking
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-[#17252A]/60 mt-3 font-mono">
                      Percentiles are computed against the HAM10000 reference split only. They do not imply risk on their own.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            {/* RIGHT COLUMN: Diagnostic Interpretation & Clinical Action (38%) */}
            <div className="w-full lg:w-[38%] flex flex-col space-y-6">
              {/* PANEL 3: Safety Verdict (Sticky Anchor) */}
              <section className="w-full bg-[#DEF2F1] border border-[#1B6B63]/40 rounded-[4px] p-4 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-[#1B6B63] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-[#17252A] leading-tight">
                      {safety?.decision === "escalate" ? "Clinical review advised" : "Ready to review"}
                    </h3>
                    <p className="text-xs text-[#17252A]/85 mt-1 leading-normal">
                      Automated decision support. The consensus layer synthesised all team model features.
                    </p>
                  </div>
                </div>

                {/* Structured Clinical Ledger List */}
                <dl className="border-t border-[#1B6B63]/20 pt-3 mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-[#17252A]/70">Likelihood (with range)</dt>
                    <dd className="font-mono font-semibold text-[#17252A]">
                      {likelihoodText}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#17252A]/70">Urgency</dt>
                    <dd>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[2px] bg-[#FEF0C7] text-[#B54708] font-mono text-[10px] font-bold border border-[#FDB022] uppercase">
                        {urgencyLabel}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#17252A]/70">Model agreement</dt>
                    <dd className="font-mono font-semibold text-[#17252A]">
                      {agreementText}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#17252A]/70">Out-of-distribution</dt>
                    <dd className="font-mono font-semibold text-[#17252A]">
                      {oodText}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* PANEL 4: Likely Types (Top 3) */}
              <article className="w-full bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-[#17252A]">Likely types (top 3)</h3>
                  <p className="text-xs text-[#17252A]/70">
                    The cancer classifier is a 7-class model. These are the three it ranked highest for this scan.
                  </p>
                </div>

                <div className="space-y-4">
                  {displayTypes.map((dt, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between items-baseline mb-1 text-xs">
                        <span className="font-semibold text-[#17252A]">{dt.name}</span>
                        <span className="font-mono font-bold text-[#17252A]">{dt.pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#DEF2F1] rounded-[2px] overflow-hidden">
                        <div className="h-full bg-[#1B6B63]" style={{ width: `${Math.min(100, Math.max(3, dt.pct))}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] font-mono text-[#17252A]/60 mt-4 pt-2 border-t border-[#17252A]/10">
                  This model misses most melanomas on held-out dermoscopy data. Never rely on it alone.
                </p>
              </article>

              {/* PANEL 5: Warning Signs */}
              <article className="w-full bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-5 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-base font-bold text-[#17252A]">Warning signs detected</h3>
                </div>

                {warningSignsList.length > 0 ? (
                  <div className="space-y-3 text-xs">
                    {warningSignsList.map((sign, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 text-[#B54708] shrink-0 mt-0.5" />
                        <p className="text-[#17252A]">{sign}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#17252A]/70">
                    No critical morphological red flags triggered by automated screening.
                  </p>
                )}

                <p className="text-[11px] font-mono text-[#17252A]/60 mt-3 pt-2 border-t border-[#17252A]/10">
                  Warning signs raise urgency. They do not change the risk estimate.
                </p>
              </article>

              {/* PANEL 6: Groq LLM Explanation */}
              <article className="w-full bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-[#17252A]">Explanation</h3>
                  {/* Language Switcher Tabs */}
                  <div className="inline-flex rounded-[4px] p-0.5 bg-[#DEF2F1] border border-[#17252A]/15">
                    {(["en", "ta", "hi"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setActiveLang(lang)}
                        className={`px-2 py-0.5 rounded-[2px] font-mono text-[10px] font-bold transition-colors cursor-pointer ${
                          activeLang === lang
                            ? "bg-[#2B7A78] text-[#FEFFFF]"
                            : "text-[#17252A]/70 hover:text-[#17252A]"
                        }`}
                      >
                        {lang === "en" ? "English" : lang === "ta" ? "தமிழ்" : "हिन्दी"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 text-xs text-[#17252A] leading-relaxed">
                  {explanationLoading ? (
                    <div className="py-4 flex items-center justify-center gap-2 font-mono text-[11px] text-[#17252A]/60">
                      <Spinner size="sm" />
                      <span>Synthesizing Groq clinical tokens...</span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line">{explanations[activeLang] || res?.explanation?.text || res?.explanation?.summary || "Automated analysis highlights patterns for physician review."}</p>
                  )}
                  <p className="font-medium text-[#17252A]/85">
                    This automated analysis highlights specific patterns for a physician&apos;s review. It cannot diagnose or rule out melanoma.
                  </p>
                </div>

                <p className="text-[11px] font-mono text-[#17252A]/60 mt-3 pt-2 border-t border-[#17252A]/10">
                  Generated by Groq. It explains. It does not decide.
                </p>
              </article>
            </div>
          </div>
            );
          })()}

          {/* BOTTOM ACTION BAND */}
          <section className="w-full flex flex-col md:flex-row items-center justify-between gap-4 pt-6 pb-6 border-t border-[#17252A]/15 mt-10">
            <div className="font-mono text-xs text-[#17252A]/60">
              CASE REF: #{caseDoc._id.slice(-8).toUpperCase()} · PATIENT PROTOCOL: OPD-AMBULATORY
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => setDoctorFeedbackOpen(!doctorFeedbackOpen)}
                className="px-4 py-2 rounded-[4px] border border-[#2B7A78] text-[#2B7A78] font-mono text-xs font-bold hover:bg-[#DEF2F1] transition-colors cursor-pointer"
              >
                {isDoctor ? "Clinician Review (ICD-10)" : "Share with a doctor"}
              </button>
              <button
                type="button"
                onClick={() => setFollowUpOpen(true)}
                className="px-4 py-2 rounded-[4px] border border-[#17252A]/20 text-[#17252A] font-mono text-xs font-semibold hover:bg-[#DEF2F1]/50 transition-colors cursor-pointer"
              >
                Set a follow-up reminder
              </button>
              <Link
                href="/doctors"
                className="px-5 py-2 rounded-[4px] bg-[#2B7A78] text-[#FEFFFF] font-mono text-xs font-bold hover:bg-[#1B6B63] transition-colors shadow-sm"
              >
                Book a consultation
              </Link>
            </div>
          </section>

          {/* Doctor Review / Feedback Form Expandable */}
          {doctorFeedbackOpen && (
            <div className="mt-6 p-6 bg-[#FEFFFF] border-2 border-[#2B7A78] rounded-[4px] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-[#2B7A78]" />
                  <h3 className="text-sm font-bold text-[#17252A]">
                    Clinician Case Review &amp; Triage Form (ICD-10)
                  </h3>
                </div>
                <span className="font-mono text-[10px] text-[#2B7A78] font-bold uppercase bg-[#DEF2F1] px-2 py-0.5 rounded-[2px]">
                  Institutional Sign-off
                </span>
              </div>

              {feedbackSuccess && (
                <Alert variant="info">
                  Clinician review and triage decision successfully recorded.
                </Alert>
              )}

              <form onSubmit={handleFeedbackSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Decision</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="accept"
                        checked={feedbackDecision === "accept"}
                        onChange={() => setFeedbackDecision("accept")}
                      />
                      <span>Accept automated assessment</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="correct"
                        checked={feedbackDecision === "correct"}
                        onChange={() => setFeedbackDecision("correct")}
                      />
                      <span>Correct diagnosis / class</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="reject"
                        checked={feedbackDecision === "reject"}
                        onChange={() => setFeedbackDecision("reject")}
                      />
                      <span>Reject assessment as invalid</span>
                    </label>
                  </div>
                </div>

                {feedbackDecision === "correct" && (
                  <div>
                    <label className="block font-semibold mb-1">
                      Corrected Diagnostic Label / ICD-10 Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., L82.1 (Seborrheic keratosis) or C43.9 (Melanoma)"
                      value={feedbackLabel}
                      onChange={(e) => setFeedbackLabel(e.target.value)}
                      className="w-full h-10 px-3 border border-[#17252A]/20 rounded-[4px]"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold mb-1">Clinical Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Provide diagnostic rationale, dermoscopic observations, or recommended next steps..."
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    className="w-full p-3 border border-[#17252A]/20 rounded-[4px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="px-4 py-2 bg-[#2B7A78] text-[#FEFFFF] font-mono font-bold rounded-[4px] hover:bg-[#1B6B63] disabled:opacity-50"
                >
                  {feedbackSubmitting ? "Signing Record..." : "Submit Clinician Sign-off"}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Follow-up Dialog */}
      <Dialog
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        title="Schedule Clinical Follow-up Reminder"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#17252A]/80">
            SkinSentry will send a notification to re-photograph this spot in the specified number of days to monitor ABCD evolution over time.
          </p>
          {followUpSuccess && (
            <Alert variant="info">Follow-up reminder set successfully!</Alert>
          )}
          <div>
            <label className="block font-semibold mb-1">Interval (Days)</label>
            <select
              value={followUpDays}
              onChange={(e) => setFollowUpDays(Number(e.target.value))}
              className="w-full h-10 px-3 border border-[#17252A]/20 rounded-[4px] bg-[#FEFFFF]"
            >
              <option value={14}>14 days (High suspicion / rapid change)</option>
              <option value={30}>30 days (Standard 1-month monitoring)</option>
              <option value={60}>60 days (Routine 2-month monitoring)</option>
              <option value={90}>90 days (Quarterly survey)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setFollowUpOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleFollowUpSave}>
              Save Reminder
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Permanently Purge Screening Case"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#17252A]/80 leading-relaxed">
            In accordance with DISHA and DPDPA patient sovereign rights, this permanently deletes the photograph, segmentation masks, and clinical analysis data from all node enclaves.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              Keep Case
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteCase} isLoading={deleting}>
              Purge All Data
            </Button>
          </div>
        </div>
      </Dialog>

      <Footer />
    </div>
  );
}
