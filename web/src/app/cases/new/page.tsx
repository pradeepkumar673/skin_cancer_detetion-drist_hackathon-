"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormField } from "@/components/ui/FormField";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Camera, AlertCircle, ArrowLeft, Info } from "lucide-react";

interface PublicConfig {
  allowedImageTypes: string[];
  maxUploadMb: number;
  supportedLanguages: string[];
}

export default function NewCasePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [config, setConfig] = useState<PublicConfig>({
    allowedImageTypes: ["image/jpeg", "image/png", "image/webp"],
    maxUploadMb: 10,
    supportedLanguages: ["en", "ta", "hi"],
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [bodySite, setBodySite] = useState<string>("chest");
  const [lesionLabel, setLesionLabel] = useState<string>("");
  const [takenAt, setTakenAt] = useState<string>("2026-10-14");
  const [language, setLanguage] = useState<string>(() => user?.languagePref || "en");

  // Calibration scale
  const [hasScale, setHasScale] = useState<boolean>(false);
  const [pxPerCm, setPxPerCm] = useState<string>("");

  // Clinical context
  const [skinType, setSkinType] = useState<string>(() => user?.patient?.skinType || "III");
  const [sunExposure, setSunExposure] = useState<string>(() => user?.patient?.sunExposure || "moderate");
  const [familyHistorySkinCancer, setFamilyHistorySkinCancer] = useState<boolean>(() => Boolean(user?.patient?.familyHistorySkinCancer));
  const [isDiabetic, setIsDiabetic] = useState<boolean>(() => Boolean(user?.patient?.isDiabetic));

  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    // Fetch config and existing labels
    apiClient<PublicConfig>("/config/public")
      .then((cfg) => setConfig(cfg))
      .catch(() => {});

    apiClient<{ cases: Array<{ lesionLabel?: string }> }>("/cases")
      .then((res) => {
        const labels = Array.from(
          new Set(
            (res.cases || [])
              .map((c) => c.lesionLabel?.trim())
              .filter((l): l is string => Boolean(l && l.length > 0))
          )
        );
        setExistingLabels(labels);
      })
      .catch(() => {});
  }, [authLoading, isAuthenticated, user, router]);

  const handleFileSelect = (file: File | null) => {
    setImageFile(file);
    setImageError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!imageFile) {
      setImageError("Please select or capture a skin photograph to analyze.");
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("bodySite", bodySite);
      if (lesionLabel.trim()) {
        formData.append("lesionLabel", lesionLabel.trim());
      }
      formData.append("takenAt", new Date(takenAt).toISOString());
      formData.append("language", language);

      const contextObj: Record<string, unknown> = {
        skinType,
        sunExposure,
        familyHistorySkinCancer,
        isDiabetic,
      };

      if (hasScale && pxPerCm && Number(pxPerCm) > 0) {
        contextObj.pxPerCm = Number(pxPerCm);
      }

      formData.append("context", JSON.stringify(contextObj));

      const res = await apiClient<{ case: { _id: string } }>("/cases", {
        method: "POST",
        body: formData,
      });

      router.push(`/cases/${res.case._id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.push("/login");
        return;
      }
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to submit screening case.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
        <Header />
        <main className="flex-1 flex items-center justify-center py-20">
          <Spinner size="lg" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

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

        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <Link
              href="/cases"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2B7A78] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to My Cases</span>
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">New Skin Screening Check</CardTitle>
              <p className="text-xs text-[#17252A]/70">
                Upload a clear clinical photograph. Automated triage assesses lesion risk, wound area,
                and skin condition candidates.
              </p>
            </CardHeader>

            <CardContent>
              {serverError && (
                <Alert variant="error" className="mb-6">
                  {serverError}
                </Alert>
              )}

              {/* Photo Capture Tips Card */}
              <div className="mb-6 border border-[#2B7A78]/30 bg-[#DEF2F1]/40 p-4 rounded-[4px] text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-[#2B7A78]">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>Photograph Guidelines for Reliable Screening</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[#17252A]/85">
                  <li><strong>Lighting:</strong> Use clear, indirect natural daylight. Turn off flash to prevent glare.</li>
                  <li><strong>Focus:</strong> Rest hands on a table or steady surface to eliminate motion blur.</li>
                  <li><strong>Framing:</strong> Keep the spot centred in the frame, filling at least half the camera view.</li>
                  <li><strong>Scale:</strong> If you want size measured in centimetres, place a ruler or coin adjacent to the lesion.</li>
                </ul>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 1. File Upload Dropzone */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#17252A] mb-2 font-mono">
                    1. Skin Photograph
                  </div>
                  <FileDropzone
                    onFileSelect={handleFileSelect}
                    maxMb={config.maxUploadMb}
                    accept={config.allowedImageTypes.join(",")}
                  />
                  {imageError && (
                    <p className="mt-1.5 text-xs font-semibold text-[#B42318] flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{imageError}</span>
                    </p>
                  )}
                </div>

                {/* 2. Lesion Identification & Body Site */}
                <div className="space-y-4 pt-4 border-t border-[#17252A]/10">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#17252A] font-mono">
                    2. Location and Identification
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Anatomical Body Site"
                      htmlFor="bodySite"
                      required
                    >
                      <Select
                        id="bodySite"
                        value={bodySite}
                        onChange={(e) => setBodySite(e.target.value)}
                      >
                        <option value="face">Face</option>
                        <option value="scalp">Scalp</option>
                        <option value="neck">Neck</option>
                        <option value="chest">Chest</option>
                        <option value="abdomen">Abdomen</option>
                        <option value="back">Back</option>
                        <option value="upper_arm">Upper Arm</option>
                        <option value="lower_arm">Lower Arm / Forearm</option>
                        <option value="hand">Hand</option>
                        <option value="thigh">Thigh</option>
                        <option value="lower_leg">Lower Leg</option>
                        <option value="foot">Foot / Sole</option>
                        <option value="other">Other</option>
                      </Select>
                    </FormField>

                    <FormField
                      label="Photo Date"
                      htmlFor="takenAt"
                      required
                    >
                      <Input
                        id="takenAt"
                        type="date"
                        value={takenAt}
                        onChange={(e) => setTakenAt(e.target.value)}
                      />
                    </FormField>
                  </div>

                  <FormField
                    label="Lesion Label / Identifier"
                    htmlFor="lesionLabel"
                    hint="Use the same label each time you photograph this specific lesion so we can track its trajectory."
                  >
                    <Input
                      id="lesionLabel"
                      placeholder="e.g. Left Forearm Mole, Heel Ulcer #1"
                      value={lesionLabel}
                      onChange={(e) => setLesionLabel(e.target.value)}
                    />
                    {existingLabels.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#17252A]/70">
                        <span>Previous labels:</span>
                        {existingLabels.map((l) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setLesionLabel(l)}
                            className="border border-[#17252A]/20 bg-[#DEF2F1]/30 px-2 py-0.5 rounded-[4px] hover:border-[#2B7A78] text-[#17252A]"
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    )}
                  </FormField>
                </div>

                {/* 3. Measurement Scale Calibration */}
                <div className="space-y-3 pt-4 border-t border-[#17252A]/10">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#17252A] font-mono">
                      3. Scale Calibration (Optional)
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <input
                      id="hasScale"
                      type="checkbox"
                      checked={hasScale}
                      onChange={(e) => setHasScale(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded-[4px] border-[#17252A]/30 text-[#2B7A78] focus:ring-2 focus:ring-[#2B7A78]"
                    />
                    <label htmlFor="hasScale" className="text-xs text-[#17252A]/85 leading-relaxed cursor-pointer select-none">
                      This photo includes a ruler, centimetre tape, or standard coin next to the lesion.
                    </label>
                  </div>

                  {hasScale && (
                    <FormField
                      label="Scale (Pixels per Centimetre)"
                      htmlFor="pxPerCm"
                      hint="Estimated pixel count per 1 cm in the photo. Enables exact area calculations in cm² and diameter in mm."
                    >
                      <Input
                        id="pxPerCm"
                        type="number"
                        step="any"
                        placeholder="e.g. 120"
                        value={pxPerCm}
                        onChange={(e) => setPxPerCm(e.target.value)}
                      />
                    </FormField>
                  )}
                </div>

                {/* 4. Clinical Context */}
                <div className="space-y-4 pt-4 border-t border-[#17252A]/10">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#17252A] font-mono">
                    4. Patient Skin Context
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Fitzpatrick Skin Phototype" htmlFor="skinType">
                      <Select
                        id="skinType"
                        value={skinType}
                        onChange={(e) => setSkinType(e.target.value)}
                      >
                        <option value="I">Type I - Always burns, never tans</option>
                        <option value="II">Type II - Usually burns, tans minimally</option>
                        <option value="III">Type III - Sometimes mild burn, tans uniformly</option>
                        <option value="IV">Type IV - Burns minimally, always tans well</option>
                        <option value="V">Type V - Very rarely burns, tans easily</option>
                        <option value="VI">Type VI - Never burns, deeply pigmented</option>
                      </Select>
                    </FormField>

                    <FormField label="Sun Exposure Level" htmlFor="sunExposure">
                      <Select
                        id="sunExposure"
                        value={sunExposure}
                        onChange={(e) => setSunExposure(e.target.value)}
                      >
                        <option value="low">Low - Mostly indoors</option>
                        <option value="moderate">Moderate - Typical daily exposure</option>
                        <option value="high">High - Frequent outdoor work or recreation</option>
                      </Select>
                    </FormField>

                    <FormField label="Preferred Explanation Language" htmlFor="language">
                      <Select
                        id="language"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                      >
                        <option value="en">English</option>
                        <option value="ta">Tamil (தமிழ்)</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 pt-1">
                    <label className="flex items-center gap-2 border border-[#17252A]/15 p-2.5 rounded-[4px] cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={familyHistorySkinCancer}
                        onChange={(e) => setFamilyHistorySkinCancer(e.target.checked)}
                        className="h-4 w-4 rounded-[4px] text-[#2B7A78] focus:ring-2 focus:ring-[#2B7A78]"
                      />
                      <span>Family history of melanoma / skin cancer</span>
                    </label>

                    <label className="flex items-center gap-2 border border-[#17252A]/15 p-2.5 rounded-[4px] cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isDiabetic}
                        onChange={(e) => setIsDiabetic(e.target.checked)}
                        className="h-4 w-4 rounded-[4px] text-[#2B7A78] focus:ring-2 focus:ring-[#2B7A78]"
                      />
                      <span>Diagnosed with diabetes (relevant for ulcers)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#17252A]/10">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full flex items-center justify-center gap-2"
                    isLoading={submitting}
                  >
                    <Camera className="h-4 w-4" />
                    <span>Submit Photograph for Screening Analysis</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
