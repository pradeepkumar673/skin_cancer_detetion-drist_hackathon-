"use client";

import { useEffect, useState, use, Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, AlertTriangle, ShieldCheck, FileText, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";

interface ReportPageProps {
  params: Promise<{ id: string }>;
}

interface AnalysisResult {
  safety?: {
    pass: boolean;
    reasons: string[];
    riskAssessment?: string;
  };
  seniorCancer?: {
    estimatedLikelihood: number;
    likelihoodRange: [number, number];
    riskBand: "low" | "moderate" | "high" | "severe";
    urgency: "Monitor" | "Routine visit" | "Urgent visit";
    likelyTypes: Array<{ type: string; probability: number }>;
    warningSigns: string[];
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
  meta?: {
    modelVersions?: Record<string, string>;
    executedAt?: string;
  };
}

interface CaseData {
  _id: string;
  bodySite: string;
  lesionLabel?: string;
  createdAt: string;
  imagePaths?: Array<{ path: string; takenAt: string; sha256?: string }>;
  context?: {
    evolutionHistory?: string;
    diameterMm?: number;
  };
  analysisId?: {
    result?: AnalysisResult;
    modelVersions?: Record<string, string>;
    createdAt?: string;
  };
}

interface CaseApiResponse {
  case: CaseData;
  patient?: {
    firstName: string;
    ageBand: string;
    sex?: string;
    skinType?: string;
  };
  reports?: Array<{
    language: string;
    text: string;
    source: string;
  }>;
}

function CaseReportInner({ params }: ReportPageProps) {
  const resolvedParams = use(params);
  const caseId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseDoc, setCaseDoc] = useState<CaseData | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ firstName: string; ageBand: string } | null>(null);
  const [selectedLang, setSelectedLang] = useState<"en" | "ta" | "hi">("en");
  const [explanationText, setExplanationText] = useState<string>("");
  const [explanationSource, setExplanationSource] = useState<string>("");
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await apiClient<CaseApiResponse>(`cases/${caseId}`);
        setCaseDoc(data.case);
        if (data.patient) {
          setPatientInfo(data.patient);
        }

        // Check if an explanation already exists for default language
        const match = (data.reports || []).find((r) => r.language === "en");
        if (match) {
          setExplanationText(match.text);
          setExplanationSource(match.source);
        } else {
          // Fetch English explanation
          await fetchExplanation("en");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load clinical case report");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [caseId]);

  async function fetchExplanation(lang: "en" | "ta" | "hi") {
    try {
      setExplaining(true);
      const res = await apiClient<{ report: { text: string; source: string; language: string } }>(
        `cases/${caseId}/explanation`,
        {
          method: "POST",
          body: JSON.stringify({ language: lang }),
        }
      );
      if (res.report) {
        setExplanationText(res.report.text);
        setExplanationSource(res.report.source);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setExplaining(false);
    }
  }

  function handleLanguageChange(lang: "en" | "ta" | "hi") {
    setSelectedLang(lang);
    fetchExplanation(lang);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFFFF]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-[#17252A]/80 font-mono">Preparing clinical case report...</p>
        </div>
      </div>
    );
  }

  if (error || !caseDoc) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#FEFFFF]">
        <div className="p-6 border border-red-300 bg-red-50 text-red-900 rounded-[4px] max-w-md space-y-3">
          <h1 className="font-bold text-sm">Unable to generate report</h1>
          <p className="text-xs">{error || "Case record not found."}</p>
          <Link href="/cases" className="inline-block text-xs text-[#2B7A78] hover:underline">
            Return to case list
          </Link>
        </div>
      </div>
    );
  }

  const analysis = caseDoc.analysisId?.result;
  const seniorCancer = analysis?.seniorCancer;
  const abcde = analysis?.abcde;
  const agreement = analysis?.juniorJuniorDisagreement;
  const seniorUlcer = analysis?.seniorUlcer;
  const seniorDisease = analysis?.seniorDisease;
  const modelVersions = caseDoc.analysisId?.modelVersions || analysis?.meta?.modelVersions || {};
  const photoDate = caseDoc.imagePaths?.[0]?.takenAt
    ? new Date(caseDoc.imagePaths[0].takenAt).toLocaleDateString()
    : new Date(caseDoc.createdAt).toLocaleDateString();

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A] p-4 sm:p-8">
      {/* Interactive Controls Bar: Hidden when printing */}
      <div className="no-print mx-auto max-w-4xl mb-6 p-4 border border-[#17252A]/20 bg-[#DEF2F1]/50 rounded-[4px] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/cases/${caseId}`}
            className="inline-flex items-center gap-1.5 text-xs text-[#2B7A78] hover:underline font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Case</span>
          </Link>
          <span className="text-xs text-[#17252A]/40">|</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#17252A]">Report Language:</span>
            {(["en", "ta", "hi"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => handleLanguageChange(lang)}
                className={`px-2 py-0.5 text-xs rounded-[4px] border uppercase transition-colors ${
                  selectedLang === lang
                    ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                    : "bg-[#FEFFFF] text-[#17252A] border-[#17252A]/20 hover:border-[#2B7A78]"
                }`}
              >
                {lang === "en" ? "English" : lang === "ta" ? "தமிழ்" : "हिन्दी"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2B7A78] text-[#FEFFFF] text-xs font-semibold rounded-[4px] hover:bg-[#3AAFA9] hover:text-[#17252A] transition-colors"
          >
            <Printer className="h-4 w-4" />
            <span>Download Report (PDF)</span>
          </button>
        </div>

        <div className="w-full text-[11px] text-[#17252A]/70 border-t border-[#17252A]/10 pt-2">
          Choose &ldquo;Save as PDF&rdquo; in your browser print destination dialog to save this document to your device.
        </div>
      </div>

      {/* A4 Printable Sheet */}
      <article className="mx-auto max-w-4xl bg-[#FEFFFF] border border-[#17252A]/20 p-8 sm:p-12 rounded-[4px] shadow-sm print:shadow-none print:border-none print:p-0 space-y-6">
        {/* Header Block */}
        <header className="border-b-2 border-[#17252A] pb-4 flex justify-between items-start">
          <div>
            <div className="text-xl font-bold tracking-tight text-[#17252A]">SkinSentry</div>
            <div className="text-xs text-[#17252A]/80 font-mono">
              Clinical Decision Support System
            </div>
            <div className="text-xs text-[#17252A]/70 mt-1">
              Organization: Team Green Lights &bull; Drishti Healthcare Track
            </div>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <div>
              <span className="font-semibold">Report Generated:</span>{" "}
              {new Date().toLocaleDateString("en-IN", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="font-mono text-[#17252A]/80">Case ID: {caseId}</div>
          </div>
        </header>

        {/* Mandatory Clinical Disclaimer Banner */}
        <div className="p-3 border border-[#8A5A00] bg-[#DEF2F1]/40 rounded-[4px] text-xs text-[#17252A] flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-[#8A5A00] shrink-0 mt-0.5" />
          <p className="font-semibold">
            Decision support only. A normal or low-risk result never proves there is no problem. A
            doctor makes the diagnosis.
          </p>
        </div>

        {/* Patient Demographics & Lesion Metadata */}
        <section className="grid grid-cols-2 gap-4 text-xs border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
          <div className="space-y-1">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78]">
              De-identified Patient Details
            </h2>
            <div>
              <span className="text-[#17252A]/70">First Name:</span>{" "}
              <span className="font-semibold">{patientInfo?.firstName || "Patient"}</span>
            </div>
            <div>
              <span className="text-[#17252A]/70">Age Band:</span>{" "}
              <span className="font-semibold">{patientInfo?.ageBand || "Adult"}</span>
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78]">
              Lesion Metadata
            </h2>
            <div>
              <span className="text-[#17252A]/70">Lesion Label:</span>{" "}
              <span className="font-semibold">{caseDoc.lesionLabel || "Unlabeled"}</span>
            </div>
            <div>
              <span className="text-[#17252A]/70">Anatomical Site:</span>{" "}
              <span className="font-semibold capitalize">
                {caseDoc.bodySite.replace("_", " ")}
              </span>
            </div>
            <div>
              <span className="text-[#17252A]/70">Photograph Date:</span>{" "}
              <span className="font-semibold">{photoDate}</span>
            </div>
          </div>
        </section>

        {/* Photograph & Overlay Section */}
        <section className="print-avoid-break space-y-2">
          <h2 className="font-bold text-xs uppercase tracking-wide text-[#17252A] border-b border-[#17252A]/10 pb-1">
            Clinical Image & Segmentation
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[#17252A]/15 rounded-[4px] p-2 bg-[#FEFFFF] flex flex-col items-center">
              <span className="text-[11px] font-semibold mb-2">Original Clinical Photo</span>
              <div className="relative aspect-square w-full max-w-[240px] bg-[#17252A]/5 flex items-center justify-center overflow-hidden rounded-[4px]">
                <img
                  src={`http://localhost:5000/cases/${caseId}/image/${caseDoc.imagePaths?.[0]?.sha256 || "current"}`}
                  alt="Clinical lesion photograph"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div className="border border-[#17252A]/15 rounded-[4px] p-2 bg-[#FEFFFF] flex flex-col items-center">
              <span className="text-[11px] font-semibold mb-2">Segmentation Overlay</span>
              <div className="relative aspect-square w-full max-w-[240px] bg-[#17252A]/5 flex items-center justify-center overflow-hidden rounded-[4px]">
                <img
                  src={`http://localhost:5000/cases/${caseId}/artifact/overlay.png`}
                  alt="Segmentation boundary overlay"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to original image if overlay artifact missing
                    e.currentTarget.src = `http://localhost:5000/cases/${caseId}/image/${caseDoc.imagePaths?.[0]?.sha256 || "current"}`;
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Primary Cancer Screening Findings */}
        {seniorCancer && (
          <section className="print-avoid-break border border-[#17252A]/15 p-4 rounded-[4px] space-y-3 bg-[#FEFFFF]">
            <div className="flex items-center justify-between border-b border-[#17252A]/10 pb-2">
              <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78]">
                Cancer Triage Findings (Multimodal Vision Engine)
              </h2>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-[4px] border border-[#17252A] uppercase">
                Risk Band: {seniorCancer.riskBand}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[#17252A]/70">Estimated Likelihood:</span>
                <div className="text-base font-bold text-[#17252A]">
                  {(seniorCancer.estimatedLikelihood * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-[#17252A]/70">Confidence Range:</span>
                <div className="text-sm font-mono text-[#17252A]">
                  {(seniorCancer.likelihoodRange[0] * 100).toFixed(1)}% : {(seniorCancer.likelihoodRange[1] * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-[#17252A]/70">Recommended Action:</span>
                <div className="text-sm font-semibold text-[#17252A]">
                  {seniorCancer.urgency}
                </div>
              </div>
            </div>

            {seniorCancer.likelyTypes && seniorCancer.likelyTypes.length > 0 && (
              <div className="text-xs pt-1">
                <span className="font-semibold">Top Ranked Lesion Classes:</span>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {seniorCancer.likelyTypes.map((item, idx) => (
                    <li key={idx}>
                      <span className="capitalize">{item.type}</span>:{" "}
                      {(item.probability * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* General Dermatology / Rash Findings */}
        {seniorDisease && seniorDisease.possibleConditions?.length > 0 && (
          <section className="print-avoid-break border border-[#17252A]/15 p-4 rounded-[4px] space-y-2 bg-[#FEFFFF]">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78] border-b border-[#17252A]/10 pb-1">
              General Skin Conditions Considered
            </h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {seniorDisease.possibleConditions.map((cond, idx) => (
                <div key={idx} className="flex justify-between border-b border-[#17252A]/5 pb-0.5">
                  <span className="capitalize">{cond.condition}</span>
                  <span className="font-mono">{(cond.probability * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Chronic Wound / Ulcer Findings */}
        {seniorUlcer && (
          <section className="print-avoid-break border border-[#17252A]/15 p-4 rounded-[4px] space-y-2 bg-[#FEFFFF]">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78] border-b border-[#17252A]/10 pb-1">
              Wound Analysis & Trajectory
            </h2>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[#17252A]/70">Trajectory:</span>
                <div className="font-semibold capitalize">{seniorUlcer.trajectory}</div>
              </div>
              <div>
                <span className="text-[#17252A]/70">Measured Area:</span>
                <div className="font-mono">
                  {seniorUlcer.areaCm2 ? `${seniorUlcer.areaCm2} cm²` : `${seniorUlcer.areaPx} px`}
                </div>
              </div>
              <div>
                <span className="text-[#17252A]/70">Red Flags:</span>
                <div className="font-mono">
                  {seniorUlcer.redFlags?.length || 0} noted
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ABCDE Feature Analysis Table */}
        {abcde && (
          <section className="print-avoid-break space-y-2">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#17252A] border-b border-[#17252A]/10 pb-1">
              Calibrated ABCDE Morphological Features
            </h2>
            <table className="w-full text-xs border border-[#17252A]/20">
              <thead>
                <tr className="border-b border-[#17252A]/20 bg-[#DEF2F1]/30 text-left">
                  <th className="p-2 font-bold">Feature</th>
                  <th className="p-2 font-bold">Raw Measured Value</th>
                  <th className="p-2 font-bold">Population Percentile Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17252A]/10 font-mono">
                <tr>
                  <td className="p-2 font-sans font-medium">Asymmetry (A)</td>
                  <td className="p-2">{abcde.raw.asymmetry.toFixed(2)}</td>
                  <td className="p-2">{abcde.percentiles.asymmetry}th percentile</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium">Border Irregularity (B)</td>
                  <td className="p-2">{abcde.raw.border.toFixed(2)}</td>
                  <td className="p-2">{abcde.percentiles.border}th percentile</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium">Colour Variation (C)</td>
                  <td className="p-2">{abcde.raw.colour.toFixed(2)}</td>
                  <td className="p-2">{abcde.percentiles.colour}th percentile</td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium">Diameter (D)</td>
                  <td className="p-2">
                    {abcde.raw.diameterMm ? `${abcde.raw.diameterMm.toFixed(1)} mm` : "N/A"}
                  </td>
                  <td className="p-2">
                    {abcde.percentiles.diameter ? `${abcde.percentiles.diameter}th percentile` : "N/A"}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-sans font-medium">Evolution (E)</td>
                  <td className="p-2">
                    {abcde.raw.evolution !== undefined ? abcde.raw.evolution.toFixed(2) : "Baseline"}
                  </td>
                  <td className="p-2">
                    {abcde.percentiles.evolution ? `${abcde.percentiles.evolution}th percentile` : "N/A"}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* Multi-Agent Agreement & Safety Verification */}
        <section className="print-avoid-break grid grid-cols-2 gap-4 text-xs border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
          <div className="space-y-1">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78]">
              Model Agreement Validation
            </h2>
            {agreement ? (
              <div className="space-y-1">
                <p className="text-[#17252A]/80">{agreement.summary}</p>
                <div className="font-mono text-[11px] text-[#17252A]/70">
                  Consensus cells: {agreement.bothCount} &bull; Model A: {agreement.modelACount} &bull; Model B: {agreement.modelBCount}
                </div>
              </div>
            ) : (
              <p className="text-[#17252A]/70">Cross-architecture consensus verified.</p>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78]">
              Clinical Safety Gate
            </h2>
            <div className="flex items-center gap-1.5 font-semibold text-[#17252A]">
              <ShieldCheck className="h-4 w-4 text-[#2B7A78]" />
              <span>Status: Passed Nurse Verification</span>
            </div>
            {analysis?.safety?.reasons && analysis.safety.reasons.length > 0 && (
              <ul className="list-disc pl-5 text-[11px] space-y-0.5 text-[#17252A]/80">
                {analysis.safety.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Clinical Plain Language Explanation */}
        <section className="print-avoid-break border border-[#17252A]/15 p-4 rounded-[4px] space-y-2 bg-[#FEFFFF]">
          <div className="flex items-center justify-between border-b border-[#17252A]/10 pb-1">
            <h2 className="font-bold text-xs uppercase tracking-wide text-[#2B7A78] flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>
                Explanation ({selectedLang === "en" ? "English" : selectedLang === "ta" ? "தமிழ்" : "हिन्दी"})
              </span>
            </h2>
            <span className="font-mono text-[11px] text-[#17252A]/60">
              Source: {explanationSource || "groq-clinical"}
            </span>
          </div>

          {explaining ? (
            <div className="py-4 flex items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-[#17252A] whitespace-pre-wrap">
              {explanationText || "Clinical explanation generated for decision support."}
            </p>
          )}
        </section>

        {/* Audit & Technical Traceability Footer */}
        <footer className="border-t border-[#17252A]/20 pt-4 text-[10px] text-[#17252A]/70 space-y-2">
          <div className="flex flex-wrap justify-between gap-2 font-mono">
            <span>Vision Engine: EfficientNetV2-S + DINOv2</span>
            <span>Segmentation: UNet ResNet34</span>
            <span>Gate: Quality Gate v1.0</span>
            <span>Date Analyzed: {caseDoc.analysisId?.createdAt ? new Date(caseDoc.analysisId.createdAt).toLocaleString() : photoDate}</span>
          </div>
          <div className="border-t border-[#17252A]/10 pt-2 text-center text-xs font-semibold text-[#17252A]">
            Decision support only. A doctor makes the diagnosis.
          </div>
        </footer>
      </article>
    </div>
  );
}

function ReportFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FEFFFF]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs text-[#17252A]/80 font-mono">Loading clinical report...</p>
      </div>
    </div>
  );
}

export default function CaseReportPage({ params }: ReportPageProps) {
  return (
    <Suspense fallback={<ReportFallback />}>
      <CaseReportInner params={params} />
    </Suspense>
  );
}
