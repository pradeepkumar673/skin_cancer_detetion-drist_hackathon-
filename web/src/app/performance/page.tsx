"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Database,
  Info,
  Calendar,
  GitBranch,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

interface DatasetItem {
  name: string;
  source: string;
  license: string;
  size: string;
  split_strategy?: string;
  known_bias?: string;
}

interface LimitationItem {
  topic: string;
  description: string;
}

interface ModelReport {
  verdict?: string;
  leakage_warning?: string;
  model_name?: string;
  source?: string;
  evaluated_at?: string;
  test_metrics?: Record<string, number>;
  metrics?: Record<string, number>;
  malignant_premalignant_recall?: Record<string, number>;
  per_class?: Record<string, { recall?: number; precision?: number; f1?: number }>;
  classes?: string[];
  split_groups_hash?: string;
  [key: string]: unknown;
}

interface PerformanceSummary {
  generated_at: string;
  git_commit: string;
  datasets: DatasetItem[];
  models: Record<string, ModelReport>;
  limitations: LimitationItem[];
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    async function fetchMetrics() {
      try {
        setLoading(true);
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const res = await fetch(`${apiBase}/metrics/models`);
        if (!res.ok) {
          throw new Error(`Failed to load metrics (HTTP ${res.status})`);
        }
        const json = await res.json();
        if (mounted) {
          setData(json);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unable to reach metrics service");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchMetrics();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleModelRaw = (modelKey: string) => {
    setExpandedModels((prev) => ({
      ...prev,
      [modelKey]: !prev[modelKey],
    }));
  };

  const modelDisplayConfig: Record<
    string,
    { title: string; category: string; description: string }
  > = {
    cancer_classifier: {
      title: "Cancer Junior Classifier (7-Class HAM10000)",
      category: "Lesion Classification",
      description:
        "Extracts feature embeddings via DINOv2-small ViT backbone, classified with balanced logistic regression.",
    },
    cancer_senior: {
      title: "Cancer Senior Risk Estimator",
      category: "Multimodal Risk Scoring",
      description:
        "Synthesizes out-of-fold junior classifier predictions, ABCDE morphology, patient demographics, and longitudinal change signals.",
    },
    disease: {
      title: "Disease Junior Classifier",
      category: "Dermatological Conditions",
      description:
        "Identifies common non-cancerous skin conditions with calibrated confidence scoring and explicit abstention.",
    },
    ulcer_segmentation: {
      title: "Ulcer Segmentation and Tissue Estimator",
      category: "Chronic Wounds",
      description:
        "Segments wound margin and perimeter via U-Net on FUSeg clinical photographs. Area tracking only.",
    },
    nurses: {
      title: "Clinical Nurse Gatekeepers",
      category: "Modality Validation",
      description:
        "Determines image domain relevance (cancer, ulcer, disease) and flags out-of-distribution inputs via Mahalanobis distance.",
    },
    quality_gate: {
      title: "Image Quality Gate",
      category: "Pre-screening Rules",
      description:
        "Deterministic OpenCV checks evaluating blur, illumination, contrast, and resolution prior to clinical model inference.",
    },
    cancer_segmentation: {
      title: "Cancer Lesion Contour Segmenter",
      category: "Morphometry",
      description:
        "Extracts lesion borders and measures geometric asymmetry, border irregularity, color distribution, and diameter.",
    },
  };

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:px-6">
        <div className="mb-6">
          <PermanentDisclaimer />
        </div>

        {/* Page Header */}
        <div className="border-b border-[#17252A]/15 pb-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#17252A]">
                Model Performance and Clinical Limitations
              </h1>
              <p className="mt-1 text-sm text-[#17252A]/70 max-w-3xl">
                Real benchmark results evaluated on held-out test splits. Every number below is
                computed from authentic evaluation scripts without interpolation or synthetic
                results.
              </p>
            </div>
            {data && (
              <div className="flex items-center gap-4 text-xs font-mono text-[#17252A]/60 shrink-0">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-[#2B7A78]" />
                  {new Date(data.generated_at).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3.5 w-3.5 text-[#2B7A78]" />
                  {data.git_commit ? data.git_commit.slice(0, 7) : "HEAD"}
                </span>
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-[#17252A]/70">Loading evaluation benchmarks...</p>
          </div>
        )}

        {error && (
          <div className="p-4 border border-[#17252A]/20 bg-[#DEF2F1] rounded-[4px] mb-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17252A]">
              <AlertTriangle className="h-4 w-4 text-[#2B7A78]" />
              <span>Metrics temporarily unavailable</span>
            </div>
            <p className="mt-1 text-xs text-[#17252A]/70">{error}</p>
          </div>
        )}

        {data && (
          <div className="space-y-10">
            {/* Clinical Notice Callout */}
            <div className="p-4 border-l-4 border-[#2B7A78] bg-[#DEF2F1] rounded-[4px]">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-[#2B7A78] shrink-0 mt-0.5" />
                <div className="text-xs text-[#17252A] space-y-1 leading-relaxed">
                  <p className="font-semibold text-sm">Decision Support Notice</p>
                  <p>
                    SkinSentry is decision support software designed for preliminary screening. A
                    normal or low-risk assessment never proves the absence of disease. All findings
                    must be validated by a licensed physician before clinical action.
                  </p>
                </div>
              </div>
            </div>

            {/* Model Evaluations Section */}
            <section>
              <h2 className="text-lg font-bold tracking-tight text-[#17252A] mb-4">
                Model Benchmark Evaluations
              </h2>

              <div className="space-y-6">
                {Object.entries(modelDisplayConfig).map(([key, config]) => {
                  const modelData = data.models?.[key];
                  const hasData = Boolean(modelData && !modelData.error);
                  const verdict = modelData?.verdict;
                  const leakageWarning = modelData?.leakage_warning;
                  const isNotSafe = verdict?.startsWith("NOT SAFE");
                  const isExpanded = expandedModels[key] ?? false;

                  return (
                    <Card key={key} className="border border-[#17252A]/15 bg-[#FEFFFF]">
                      <CardHeader className="border-b border-[#17252A]/10 bg-[#FEFFFF] pb-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base font-semibold text-[#17252A]">
                                {config.title}
                              </CardTitle>
                              <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-[#17252A]/20 rounded-[4px] text-[#17252A]/70">
                                {config.category}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[#17252A]/70">
                              {config.description}
                            </p>
                          </div>

                          {!hasData && (
                            <span className="text-xs font-mono font-medium text-[#17252A]/50 bg-[#17252A]/5 px-2 py-1 rounded-[4px]">
                              Not evaluated
                            </span>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="pt-4 space-y-4">
                        {hasData && modelData && (
                          <>
                            {/* Leakage Warning Banner */}
                            {leakageWarning && (
                              <div className="p-3 border border-[#17252A]/20 bg-[#DEF2F1] rounded-[4px] text-xs">
                                <div className="flex items-center gap-2 font-semibold text-[#17252A]">
                                  <ShieldAlert className="h-4 w-4 text-[#2B7A78]" />
                                  <span>Split Independence Notice</span>
                                </div>
                                <p className="mt-1 text-[#17252A]/80 leading-relaxed font-mono">
                                  {leakageWarning}
                                </p>
                              </div>
                            )}

                            {/* Clinical Verdict Callout */}
                            {verdict && (
                              <div
                                className={`p-3 border rounded-[4px] text-xs leading-relaxed ${
                                  isNotSafe
                                    ? "border-[#17252A]/30 bg-[#DEF2F1] text-[#17252A]"
                                    : "border-[#2B7A78]/30 bg-[#DEF2F1] text-[#17252A]"
                                }`}
                              >
                                <div className="flex items-center gap-2 font-semibold">
                                  {isNotSafe ? (
                                    <AlertTriangle className="h-4 w-4 text-[#2B7A78] shrink-0" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 text-[#2B7A78] shrink-0" />
                                  )}
                                  <span className="text-xs uppercase tracking-wide font-mono">
                                    Clinical Verdict
                                  </span>
                                </div>
                                <p className="mt-1 font-medium">{verdict}</p>
                              </div>
                            )}

                            {/* Key Highlights Table */}
                            {modelData.test_metrics && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border border-[#17252A]/10">
                                  <thead className="bg-[#DEF2F1]/50 border-b border-[#17252A]/10 text-[#17252A] font-semibold">
                                    <tr>
                                      <th className="px-3 py-2">Metric</th>
                                      <th className="px-3 py-2">Value</th>
                                      <th className="px-3 py-2">Target / Standard</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                                    {Object.entries(modelData.test_metrics).map(([mKey, mVal]) => (
                                      <tr key={mKey} className="hover:bg-[#DEF2F1]/20">
                                        <td className="px-3 py-1.5 font-mono capitalize">
                                          {mKey.replace(/_/g, " ")}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono font-semibold">
                                          {typeof mVal === "number" ? mVal.toFixed(4) : String(mVal)}
                                        </td>
                                        <td className="px-3 py-1.5 text-[#17252A]/60">
                                          Held-out test set
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Malignant Recall Breakdown (Cancer Junior) */}
                            {modelData.malignant_premalignant_recall && (
                              <div className="space-y-1.5">
                                <h4 className="text-xs font-semibold text-[#17252A]">
                                  High-Risk Lesion Recall Breakdown
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {Object.entries(modelData.malignant_premalignant_recall).map(
                                    ([rKey, rVal]) => (
                                      <div
                                        key={rKey}
                                        className="p-2 border border-[#17252A]/10 bg-[#DEF2F1]/30 rounded-[4px]"
                                      >
                                        <div className="text-[10px] font-mono text-[#17252A]/70 uppercase">
                                          {rKey.replace(/_/g, " ").replace("recall", "").trim()}
                                        </div>
                                        <div className="text-sm font-bold font-mono text-[#17252A] mt-0.5">
                                          {(Number(rVal) * 100).toFixed(1)}%
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Raw Metrics Toggle */}
                            <div>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => toggleModelRaw(key)}
                                className="flex items-center gap-1.5 text-xs"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                    <span>Hide Raw Details</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                    <span>View Complete Benchmark Data</span>
                                  </>
                                )}
                              </Button>

                              {isExpanded && (
                                <div className="mt-3 p-3 bg-[#DEF2F1]/40 border border-[#17252A]/10 rounded-[4px]">
                                  <pre className="text-[11px] font-mono text-[#17252A] overflow-x-auto whitespace-pre-wrap max-h-60">
                                    {JSON.stringify(modelData, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {!hasData && (
                          <p className="text-xs text-[#17252A]/60 italic">
                            This model has not yet completed benchmark aggregation or evaluation
                            file is missing from models/metrics/.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            {/* Datasets and Provenance Section */}
            <section className="pt-6 border-t border-[#17252A]/15">
              <div className="flex items-center gap-2 mb-4">
                <Database className="h-5 w-5 text-[#2B7A78]" />
                <h2 className="text-lg font-bold tracking-tight text-[#17252A]">
                  Dataset Provenance and Licences
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-[#17252A]/10">
                  <thead className="bg-[#DEF2F1] border-b border-[#17252A]/10 text-[#17252A] font-semibold">
                    <tr>
                      <th className="px-3 py-2.5">Dataset</th>
                      <th className="px-3 py-2.5">Source & Citation</th>
                      <th className="px-3 py-2.5">Licence</th>
                      <th className="px-3 py-2.5">Size</th>
                      <th className="px-3 py-2.5">Split Strategy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                    {data.datasets.map((d) => (
                      <tr key={d.name} className="hover:bg-[#DEF2F1]/20">
                        <td className="px-3 py-2 font-semibold">{d.name}</td>
                        <td className="px-3 py-2 text-[#17252A]/80">{d.source}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{d.license}</td>
                        <td className="px-3 py-2">{d.size}</td>
                        <td className="px-3 py-2 text-[#17252A]/70">
                          {d.split_strategy || "Pre-training corpus"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Clinical Limitations Section */}
            <section className="pt-6 border-t border-[#17252A]/15">
              <h2 className="text-lg font-bold tracking-tight text-[#17252A] mb-4">
                Known Technical and Clinical Limitations
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.limitations.map((lim) => (
                  <div
                    key={lim.topic}
                    className="p-4 border border-[#17252A]/15 bg-[#FEFFFF] rounded-[4px]"
                  >
                    <h3 className="text-sm font-semibold text-[#17252A] flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-[#2B7A78] shrink-0" />
                      {lim.topic}
                    </h3>
                    <p className="mt-1.5 text-xs text-[#17252A]/75 leading-relaxed">
                      {lim.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Back link */}
            <div className="pt-4 text-center">
              <Link href="/">
                <Button variant="secondary" size="sm">
                  Return to Home
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
