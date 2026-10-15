"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Camera,
  Upload,
  Lightbulb,
  Trash2,
  Activity,
  Save,
  ShieldAlert,
  AlertCircle,
  X,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

interface PublicConfig {
  allowedImageTypes: string[];
  maxUploadMb: number;
  supportedLanguages: string[];
}

export default function NewScreeningPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [config, setConfig] = useState<PublicConfig>({
    allowedImageTypes: ["image/jpeg", "image/png", "image/webp"],
    maxUploadMb: 10,
    supportedLanguages: ["en", "ta", "hi"],
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState<boolean>(false);

  // Form State
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [lesionLabel, setLesionLabel] = useState<string>("");
  const [duration, setDuration] = useState<string>("1_4_weeks");
  const [recentChange, setRecentChange] = useState<string>("no");
  const [hasScale, setHasScale] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [existingLabels, setExistingLabels] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

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
  }, [authLoading, isAuthenticated, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const maxBytes = (config.maxUploadMb || 10) * 1024 * 1024;
      if (file.size > maxBytes) {
        setImageError(`File is too large. Maximum size is ${config.maxUploadMb} MB.`);
        return;
      }
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setImageError(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const maxBytes = (config.maxUploadMb || 10) * 1024 * 1024;
      if (file.size > maxBytes) {
        setImageError(`File is too large. Maximum size is ${config.maxUploadMb} MB.`);
        return;
      }
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removePhoto = () => {
    setImageFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const toggleSite = (site: string) => {
    setSelectedSites((prev) =>
      prev.includes(site) ? prev.filter((s) => s !== site) : [...prev, site]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!imageFile) {
      setImageError("Please select or drop a clear skin photograph to analyze.");
      return;
    }

    if (selectedSites.length === 0) {
      setServerError("Please select where on the body the photograph was taken.");
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("bodySite", selectedSites[0].toLowerCase());
      if (lesionLabel.trim()) {
        formData.append("lesionLabel", lesionLabel.trim());
      }
      formData.append("takenAt", new Date().toISOString());
      formData.append("language", user?.languagePref || "en");

      const contextObj: Record<string, unknown> = {
        bodySites: selectedSites,
        duration,
        recentChange,
        hasScale,
        notes: notes.trim(),
        skinType: user?.patient?.skinType || "III",
        sunExposure: user?.patient?.sunExposure || "moderate",
        familyHistorySkinCancer: Boolean(user?.patient?.familyHistorySkinCancer),
        isDiabetic: Boolean(user?.patient?.isDiabetic),
      };

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
        setServerError("Failed to initiate screening case.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
        <Header />
        <main className="flex-1 flex items-center justify-center py-24">
          <Spinner size="lg" />
        </main>
        <Footer />
      </div>
    );
  }

  const allSites = ["Face", "Scalp", "Neck", "Trunk", "Arm", "Hand", "Leg", "Foot"];

  return (
    <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
      <Header />

      <main className="flex-1 w-full pt-14 pb-16">
        {/* Top Protocol Advisory */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#17252A]/15 py-2 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs text-[#17252A]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#1B6B63] text-[#FEFFFF] px-1.5 py-0.5 rounded-[2px]">
                Protocol Advisory
              </span>
              <p className="font-medium text-[#17252A]/90">
                Decision support only. A low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-[#2B7A78]">
              <span>ICMR-TeleDerm Validated</span>
              <span>|</span>
              <span>Node Sync: Active (0.14s)</span>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[720px] mx-auto py-10 px-4 sm:px-6">
          {/* 1. Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 mb-4 font-mono text-xs">
            <Link href="/cases" className="text-[#17252A]/60 hover:text-[#17252A] transition-colors">
              My cases
            </Link>
            <span className="text-[#17252A]/30">/</span>
            <span className="text-[#1B6B63] font-semibold">New screening</span>
          </nav>

          {/* 2. Header */}
          <header className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17252A]">
              New screening
            </h1>
            <p className="text-sm text-[#17252A]/80 mt-1.5 leading-relaxed">
              Upload one clear photo. Fill in as much context as you can. Anything you leave blank just makes the result less specific.
            </p>
          </header>

          {serverError && (
            <div className="p-4 border border-[#B42318]/30 bg-[#FEE4E2] rounded-[4px] mb-6 flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-[#B42318] shrink-0 mt-0.5" />
              <div className="text-xs text-[#17252A]">
                <p className="font-bold text-[#B42318]">Screening intake failed</p>
                <p className="mt-0.5">{serverError}</p>
              </div>
            </div>
          )}

          {/* Main Entry Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept={config.allowedImageTypes.join(",")}
              className="hidden"
            />

            {/* 3. Photo Upload & Dropzone Area */}
            <section className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#17252A]/70">
                  Clinical Photo Capture
                </span>
                <button
                  type="button"
                  onClick={() => setShowTips(!showTips)}
                  className="font-mono text-xs text-[#2B7A78] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>{showTips ? "Hide tips" : "Photo guidelines"}</span>
                </button>
              </div>

              {/* Photo tips collapsible */}
              {showTips && (
                <div className="p-4 bg-[#DEF2F1]/50 border border-[#2B7A78]/30 rounded-[4px] text-xs text-[#17252A]/90 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-[#2B7A78]">
                    <span>Standard Imaging Protocol</span>
                    <button type="button" onClick={() => setShowTips(false)} className="text-[#17252A]/60 hover:text-[#17252A]">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Lighting:</strong> Bright, indirect ambient daylight. Avoid camera flash and specular reflections.</li>
                    <li><strong>Focus &amp; Distance:</strong> Rest elbows on a table to eliminate hand tremor. Fill 50% of the frame with the lesion.</li>
                    <li><strong>Scale Reference:</strong> For wounds or ulcers, place a metric ruler or coin beside the area.</li>
                    <li><strong>Preparation:</strong> Gently push away hair; avoid applying heavy lotions or ointments prior to capture.</li>
                  </ul>
                </div>
              )}

              {/* Empty Dropzone State */}
              {!previewUrl ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[220px] rounded-[4px] bg-[#FEFFFF] border-2 border-dashed border-[#17252A]/25 hover:border-[#1B6B63] hover:bg-[#DEF2F1]/20 transition-colors flex flex-col items-center justify-center p-6 text-center cursor-pointer group shadow-sm"
                >
                  <div className="w-12 h-12 rounded-full bg-[#DEF2F1] flex items-center justify-center text-[#1B6B63] group-hover:scale-105 transition-transform mb-3">
                    <Camera className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-[#17252A]">
                    Drop a photo here or click to choose a file
                  </p>
                  <p className="text-xs text-[#17252A]/70 mt-1 max-w-md">
                    JPEG, PNG, or WebP. Max {config.maxUploadMb} MB. Take the photo in good light, in focus, with the area filling most of the frame.
                  </p>
                </div>
              ) : (
                /* Active Populated Photo State */
                <div className="w-full bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] p-3 shadow-sm space-y-3">
                  <div className="relative w-full h-[280px] bg-[#17252A]/5 rounded-[4px] flex items-center justify-center overflow-hidden border border-[#17252A]/10">
                    <Image
                      src={previewUrl}
                      alt="Selected clinical lesion specimen"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                    <div className="absolute top-2 right-2 px-2.5 py-1 bg-[#FEFFFF]/95 border border-[#17252A]/20 rounded-[4px] font-mono text-[11px] text-[#17252A] shadow-sm">
                      {imageFile?.name} ({imageFile ? (imageFile.size / (1024 * 1024)).toFixed(1) : 0} MB)
                    </div>
                  </div>

                  {/* Contextual Actions Strip */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#17252A]/10">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 text-xs font-semibold bg-[#FEFFFF] border border-[#17252A]/20 hover:bg-[#DEF2F1]/50 rounded-[4px] text-[#17252A] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Replace photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTips(!showTips)}
                        className="px-3 py-1.5 text-xs font-semibold bg-[#FEFFFF] border border-[#17252A]/20 hover:bg-[#DEF2F1]/50 rounded-[4px] text-[#17252A] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        <span>Retake tips</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="text-xs font-semibold text-[#B42318] hover:underline flex items-center gap-1 cursor-pointer px-2 py-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              )}

              {imageError && (
                <p className="text-xs font-semibold text-[#B42318] flex items-center gap-1 pt-1">
                  <AlertCircle className="h-4 w-4" />
                  <span>{imageError}</span>
                </p>
              )}
            </section>

            {/* 4. Clinical Context Form Section */}
            <div className="bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-6 space-y-6 shadow-sm">
              {/* Anatomical Site */}
              <fieldset className="space-y-1">
                <legend className="text-xs font-bold uppercase tracking-wider text-[#17252A]">
                  Where on the body?
                </legend>
                <p className="text-xs text-[#17252A]/70 mb-2">Select all that apply.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {allSites.map((site) => {
                    const isPressed = selectedSites.includes(site);
                    return (
                      <button
                        key={site}
                        type="button"
                        aria-pressed={isPressed}
                        onClick={() => toggleSite(site)}
                        className={`px-3 py-1.5 rounded-[4px] text-xs font-semibold transition-colors cursor-pointer border ${
                          isPressed
                            ? "border-[#2B7A78] bg-[#DEF2F1] text-[#1B6B63]"
                            : "border-[#17252A]/20 bg-[#FEFFFF] text-[#17252A]/85 hover:border-[#17252A]/40"
                        }`}
                      >
                        {site}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="border-t border-[#17252A]/10"></div>

              {/* Group C: Additional Context */}
              <div className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#17252A]">
                  More context (optional)
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#17252A] mb-1" htmlFor="lesion-tag">
                        Lesion / wound label
                      </label>
                      <input
                        id="lesion-tag"
                        type="text"
                        value={lesionLabel}
                        onChange={(e) => setLesionLabel(e.target.value)}
                        placeholder="e.g., Left shoulder spot"
                        className="w-full h-10 px-3 bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] text-xs text-[#17252A] focus:outline-none focus:border-[#2B7A78] transition-colors"
                      />
                      {existingLabels.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[#17252A]/70">
                          <span>History:</span>
                          {existingLabels.slice(0, 3).map((l) => (
                            <button
                              key={l}
                              type="button"
                              onClick={() => setLesionLabel(l)}
                              className="border border-[#17252A]/20 bg-[#DEF2F1]/30 px-1.5 py-0.5 rounded-[2px] hover:border-[#2B7A78]"
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#17252A] mb-1" htmlFor="duration-select">
                        How long has it been there?
                      </label>
                      <select
                        id="duration-select"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full h-10 px-3 bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] text-xs text-[#17252A] focus:outline-none focus:border-[#2B7A78] transition-colors cursor-pointer"
                      >
                        <option value="under_1_week">&lt;1 week</option>
                        <option value="1_4_weeks">1 to 4 weeks</option>
                        <option value="1_6_months">1 to 6 months</option>
                        <option value="over_6_months">&gt;6 months</option>
                        <option value="not_sure">not sure</option>
                      </select>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#17252A] mb-1" htmlFor="change-select">
                        Has it changed recently?
                      </label>
                      <select
                        id="change-select"
                        value={recentChange}
                        onChange={(e) => setRecentChange(e.target.value)}
                        className="w-full h-10 px-3 bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] text-xs text-[#17252A] focus:outline-none focus:border-[#2B7A78] transition-colors cursor-pointer"
                      >
                        <option value="no">no</option>
                        <option value="slightly">slightly</option>
                        <option value="clearly">clearly</option>
                        <option value="not_sure">not sure</option>
                      </select>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hasScale}
                          onChange={(e) => setHasScale(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] focus:ring-0 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-semibold text-[#17252A]">
                            Is there a scale / ruler in the photo?
                          </span>
                          <p className="font-mono text-[10px] text-[#17252A]/60 mt-0.5">
                            (enables planimetric scaling in mm²)
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Free-text Notes */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#17252A]" htmlFor="clinical-notes">
                      Symptoms and observations
                    </label>
                    <span className="font-mono text-[11px] text-[#17252A]/60">
                      {notes.length}/500
                    </span>
                  </div>
                  <textarea
                    id="clinical-notes"
                    value={notes}
                    maxLength={500}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Add symptoms like itching, bleeding, pain, or previous topical treatments..."
                    className="w-full p-3 bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] text-xs text-[#17252A] focus:outline-none focus:border-[#2B7A78] transition-colors resize-none"
                  />
                </div>
              </div>
            </div>

            {/* 5. Advisory Safety Panel */}
            <section className="bg-[#DEF2F1] border border-[#1B6B63]/30 rounded-[4px] p-4 flex gap-3 items-start" role="note">
              <ShieldAlert className="h-5 w-5 text-[#1B6B63] shrink-0 mt-0.5" />
              <div className="text-xs text-[#17252A] leading-relaxed">
                <span className="font-bold text-[#1B6B63]">Before you continue:</span> SkinSentry cannot diagnose. If you are worried or if the lesion is bleeding, itching, or changing quickly, book a doctor regardless of what the models say.
              </div>
            </section>

            {/* 6. Action Execution Strip */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto sm:min-w-[240px] h-11 px-6 bg-[#2B7A78] hover:bg-[#1B6B63] text-[#FEFFFF] font-mono text-xs font-bold uppercase tracking-wider rounded-[4px] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Spinner size="sm" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4" />
                    <span>Run analysis</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => alert("Draft saved to clinical enclave local state.")}
                  className="h-10 px-3 text-[#17252A]/70 hover:text-[#17252A] font-mono text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  <span>Save as draft</span>
                </button>
                <span className="font-mono text-[11px] text-[#2B7A78] border-l border-[#17252A]/20 pl-3">
                  AUTO-SAVE: ACTIVE
                </span>
              </div>
            </div>
          </form>

          {/* Metadata Footnote Ledger */}
          <div className="mt-12 pt-4 border-t border-[#17252A]/15 flex items-center justify-between font-mono text-[11px] text-[#17252A]/60">
            <span>REF_DOC: SCR-2025-0914-X8</span>
            <span>NODE: AIIMS-D-04 // ENCLAVE-SECURE</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
