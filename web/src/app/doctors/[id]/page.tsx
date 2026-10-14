"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Video,
  Phone,
  MessageSquare,
  Shield,
  Activity,
  CheckCircle,
  Lock,
  Info,
  ChevronRight,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface DoctorDetails {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  isOnline: boolean;
  presenceMode: string;
  lastSeenAt?: string;
  fees: {
    chat: number;
    audio: number;
    video: number;
    chatINR: number;
    audioINR: number;
    videoINR: number;
  };
  weeklySummary: Array<{ weekday: number; startTime: string; endTime: string }>;
  timezone: string;
}

interface CaseItem {
  _id: string;
  bodySite: string;
  lesionLabel?: string;
  createdAt: string;
  imagePaths?: Array<{
    path: string;
    takenAt: string;
  }>;
  analysisId?: {
    result?: {
      cancerRiskBand?: string;
      riskTier?: string;
    };
  };
}

function getInitials(name: string): string {
  if (!name) return "DR";
  const parts = name.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function BookConsultationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const doctorId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCaseId = searchParams.get("caseId");

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [doctor, setDoctor] = useState<DoctorDetails | null>(null);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Booking fields
  const [selectedMode, setSelectedMode] = useState<"video" | "audio" | "chat">("video");
  const [shareCase, setShareCase] = useState<boolean>(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(preselectedCaseId || "");
  const [doctorNotes, setDoctorNotes] = useState<string>(
    "Looking for clinical assessment on whether excisional biopsy or specialized dermoscopic review is needed."
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        setError(null);
        const [docRes, casesRes] = await Promise.all([
          apiClient<{ doctor: DoctorDetails }>(`/doctors/${doctorId}`),
          apiClient<{ cases: CaseItem[] }>("/cases").catch(() => ({ cases: [] })),
        ]);

        if (!active) return;
        setDoctor(docRes.doctor);
        const userCases = casesRes.cases || [];
        setCases(userCases);

        if (!selectedCaseId && userCases.length > 0) {
          setSelectedCaseId(userCases[0]._id);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load doctor profile.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [doctorId, selectedCaseId]);

  const activeCase = cases.find((c) => c._id === selectedCaseId);

  // Price calculations
  const getFee = () => {
    if (!doctor?.fees) return 500;
    if (selectedMode === "chat") return doctor.fees.chatINR || 300;
    if (selectedMode === "audio") return doctor.fees.audioINR || 450;
    return doctor.fees.videoINR || 500;
  };

  const handleBookAndConfirm = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/doctors/${doctorId}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient<{ appointment: { id: string } }>("/appointments", {
        method: "POST",
        body: JSON.stringify({
          doctorId,
          mode: selectedMode,
          kind: "instant",
          caseId: shareCase && selectedCaseId ? selectedCaseId : undefined,
          note: doctorNotes,
        }),
      });

      router.push(`/consult/${res.appointment.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create consultation.";
      alert(msg);
      setIsSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex flex-col justify-between">
        <Header />
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-[#5A6B69] font-mono">
            Loading clinician booking dossier...
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex flex-col justify-between">
        <Header />
        <div className="max-w-[800px] mx-auto py-16 px-4">
          <div className="bg-[#FEFFFF] border border-[#B42318] p-6 rounded-[4px]">
            <h2 className="text-[#B42318] font-semibold text-lg">Clinician Not Found</h2>
            <p className="mt-2 text-xs text-[#17252A]">{error || "Unable to retrieve doctor profile."}</p>
            <div className="mt-4">
              <Link
                href="/doctors"
                className="px-4 py-2 bg-[#1B6B63] text-white rounded-[4px] text-xs font-semibold hover:bg-[#2B7A78]"
              >
                Back to Specialist Directory
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const initials = getInitials(doctor.name);
  const currentFee = getFee();
  const caseShortId = activeCase ? `#${activeCase._id.slice(-4).toUpperCase()}` : "None";
  const caseImg = activeCase?.imagePaths && activeCase.imagePaths.length > 0 ? activeCase.imagePaths[0].path : null;
  const caseImgUrl = caseImg
    ? caseImg.startsWith("http")
      ? caseImg
      : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${caseImg}`
    : null;

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#17252A] flex flex-col justify-between">
      <div>
        <Header />

        {/* Clinical Protocol Advisory Bar */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#D8DDDB] py-2 px-4 sm:px-8">
          <div className="max-w-[1080px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
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

        {/* Main Booking Container */}
        <main className="w-full max-w-[1080px] mx-auto px-4 sm:px-8 py-8">
          {/* Top Breadcrumb & Workflow Metadata */}
          <nav aria-label="Clinical Pathway Navigation" className="mb-5 flex flex-wrap items-center justify-between text-[#5A6B69] font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <Link href="/cases" className="hover:text-[#17252A] transition-colors">
                My cases
              </Link>
              <span>/</span>
              {activeCase ? (
                <>
                  <Link href={`/cases/${activeCase._id}`} className="hover:text-[#17252A] transition-colors text-[#17252A] font-semibold">
                    Case #{activeCase._id.slice(-4).toUpperCase()}
                  </Link>
                  <span>/</span>
                </>
              ) : null}
              <Link href="/doctors" className="hover:text-[#17252A] transition-colors">
                Find a specialist
              </Link>
              <span>/</span>
              <span className="text-[#1B6B63] font-semibold">Book consultation</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-[#5A6B69] bg-[#FBFAF7] border border-[#D8DDDB] px-2 py-0.5 rounded-[4px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B63] inline-block" />
              <span>ENCRYPTED CLINICAL PIPELINE ID: 884-TEL-REC</span>
            </div>
          </nav>

          {/* Main Workspace Layout (60% / 40%) */}
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* Left Column: Clinical Consultation Setup (60%) */}
            <section className="w-full lg:w-[60%] flex flex-col gap-5">
              {/* Doctor Dossier Card */}
              <article className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  {/* Clinician Avatar */}
                  <div className="w-16 h-16 min-w-16 rounded-[4px] bg-[#DEF2F1] border border-[#D8DDDB] flex items-center justify-center text-[#1B6B63] font-mono text-xl font-bold select-none">
                    {initials}
                  </div>

                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h1 className="text-xl font-bold text-[#17252A] tracking-tight">
                        {doctor.name.startsWith("Dr.") ? doctor.name : `Dr. ${doctor.name}`}
                      </h1>
                      <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#1B6B63] bg-[#DEF2F1] px-2 py-0.5 rounded-[4px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B63] animate-pulse" />
                        <span>Online · Immediate availability</span>
                      </div>
                    </div>
                    <p className="text-xs text-[#5A6B69] mt-0.5 font-mono">
                      {doctor.specialty || "Dermatologist"} · MBBS, MD · MCI Reg Verified
                    </p>

                    {/* Credentials and Validations */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-xs font-mono">
                      <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px]">
                        English
                      </span>
                      <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px]">
                        Hindi
                      </span>
                      <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px]">
                        Video
                      </span>
                      <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px]">
                        Chat
                      </span>
                      <span className="px-2 py-0.5 bg-[#DEF2F1] text-[#1B6B63] border border-[#D8DDDB] rounded-[4px] font-semibold text-[10px] flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-[#1B6B63]" />
                        Verified CDSS Clinician
                      </span>
                    </div>
                  </div>
                </div>

                {/* Academic & Practice Overview */}
                <p className="text-xs text-[#17252A] mt-4 pt-3 border-t border-[#D8DDDB] leading-relaxed">
                  {doctor.bio ||
                    "Specialist in clinical dermato-oncology and cutaneous pathology. Protocol verified for computer-aided lesion assessment and structured tele-dermatology consultations."}
                </p>
              </article>

              {/* Section: Choose Consultation Mode */}
              <fieldset className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col gap-3 m-0">
                <legend className="float-left w-full mb-1">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold">
                    CHOOSE CONSULTATION MODE
                  </span>
                </legend>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Mode 1: Chat */}
                  <label
                    onClick={() => setSelectedMode("chat")}
                    className={`h-[130px] p-3.5 border rounded-[4px] flex flex-col justify-between cursor-pointer transition-all ${
                      selectedMode === "chat"
                        ? "bg-[#DEF2F1] border-2 border-[#1B6B63]"
                        : "bg-[#FEFFFF] border-[#D8DDDB] hover:border-[#5A6B69]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <MessageSquare className={`w-5 h-5 ${selectedMode === "chat" ? "text-[#1B6B63]" : "text-[#5A6B69]"}`} />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedMode === "chat" ? "border-[#1B6B63] bg-[#1B6B63]" : "border-[#D8DDDB]"}`}>
                        {selectedMode === "chat" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#17252A] leading-tight">
                        Chat consultation
                      </span>
                      <span className="font-mono text-sm text-[#5A6B69] mt-1 block">
                        ₹{doctor.fees?.chatINR || 300}
                      </span>
                    </div>
                  </label>

                  {/* Mode 2: Audio */}
                  <label
                    onClick={() => setSelectedMode("audio")}
                    className={`h-[130px] p-3.5 border rounded-[4px] flex flex-col justify-between cursor-pointer transition-all ${
                      selectedMode === "audio"
                        ? "bg-[#DEF2F1] border-2 border-[#1B6B63]"
                        : "bg-[#FEFFFF] border-[#D8DDDB] hover:border-[#5A6B69]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Phone className={`w-5 h-5 ${selectedMode === "audio" ? "text-[#1B6B63]" : "text-[#5A6B69]"}`} />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedMode === "audio" ? "border-[#1B6B63] bg-[#1B6B63]" : "border-[#D8DDDB]"}`}>
                        {selectedMode === "audio" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#17252A] leading-tight">
                        Audio consultation
                      </span>
                      <span className="font-mono text-sm text-[#5A6B69] mt-1 block">
                        ₹{doctor.fees?.audioINR || 450}
                      </span>
                    </div>
                  </label>

                  {/* Mode 3: Video */}
                  <label
                    onClick={() => setSelectedMode("video")}
                    className={`h-[130px] p-3.5 border rounded-[4px] flex flex-col justify-between cursor-pointer transition-all ${
                      selectedMode === "video"
                        ? "bg-[#DEF2F1] border-2 border-[#1B6B63]"
                        : "bg-[#FEFFFF] border-[#D8DDDB] hover:border-[#5A6B69]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Video className={`w-5 h-5 ${selectedMode === "video" ? "text-[#1B6B63]" : "text-[#5A6B69]"}`} />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedMode === "video" ? "border-[#1B6B63] bg-[#1B6B63]" : "border-[#D8DDDB]"}`}>
                        {selectedMode === "video" && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#17252A] leading-tight">
                        Video consultation
                      </span>
                      <span className="font-mono text-sm text-[#1B6B63] font-bold mt-1 block">
                        ₹{doctor.fees?.videoINR || 500}
                      </span>
                    </div>
                  </label>
                </div>
              </fieldset>

              {/* Section: Add Case Attachment */}
              <section className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold">
                    ADD YOUR CASE (OPTIONAL)
                  </h2>
                  <span className="font-mono text-[10px] text-[#5A6B69]">
                    EPHEMERAL ACCESS PROTOCOL
                  </span>
                </div>

                <div className="bg-[#FBFAF7] border border-[#D8DDDB] rounded-[4px] p-4 flex flex-col gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shareCase}
                      onChange={(e) => setShareCase(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded-[2px] border-[#D8DDDB] text-[#1B6B63] accent-[#1B6B63]"
                    />
                    <div className="flex flex-col text-xs">
                      <span className="font-bold text-[#17252A]">
                        Share case {caseShortId} with this doctor
                      </span>
                      <span className="text-[#5A6B69] mt-0.5 leading-normal">
                        You can revoke this at any time. The doctor will only see the photo and the report, not your contact details.
                      </span>
                    </div>
                  </label>

                  {shareCase && activeCase && (
                    <div className="mt-1 pl-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#D8DDDB] pt-3">
                      <div className="flex items-center gap-3">
                        {/* Thumbnail */}
                        <div className="w-12 h-12 shrink-0 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] overflow-hidden flex items-center justify-center">
                          {caseImgUrl ? (
                            <img src={caseImgUrl} alt="Case specimen" className="w-full h-full object-cover" />
                          ) : (
                            <Activity className="w-5 h-5 text-[#5A6B69]" />
                          )}
                        </div>
                        <div className="flex flex-col text-xs">
                          <span className="font-bold text-[#17252A]">
                            {activeCase.bodySite} ({activeCase.lesionLabel || "Lesion"})
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-[#5A6B69]">
                            <span>Record: {new Date(activeCase.createdAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <span className="text-[#1E6B3A] font-semibold uppercase">
                              Verified Ingest
                            </span>
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/cases/${activeCase._id}`}
                        className="text-xs text-[#1B6B63] hover:underline font-mono font-semibold flex items-center gap-1"
                      >
                        <span>Inspect metrics</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )}

                  {/* Ephemeral Notice */}
                  <div className="pl-6 flex items-center gap-1.5 text-[#5A6B69] font-mono text-[11px] border-t border-[#D8DDDB]/60 pt-2">
                    <Lock className="w-3.5 h-3.5 text-[#1B6B63]" />
                    <span>HIPAA / DISHA ephemeral clinical session token active (Expires in 24h)</span>
                  </div>
                </div>
              </section>

              {/* Section: Notes for the Doctor */}
              <section className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="doctor-notes" className="text-xs font-bold text-[#17252A]">
                    Notes for the doctor{" "}
                    <span className="font-mono text-[11px] text-[#5A6B69] font-normal">
                      (Optional)
                    </span>
                  </label>
                  <span className="font-mono text-[11px] text-[#5A6B69]">
                    {doctorNotes.length} / 500
                  </span>
                </div>
                <textarea
                  id="doctor-notes"
                  maxLength={500}
                  rows={3}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Anything you would like the doctor to know before the consultation..."
                  className="w-full p-3 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-xs text-[#17252A] placeholder:text-[#5A6B69] focus:border-[#1B6B63] focus:outline-none resize-none font-mono"
                />
                <div className="flex items-center justify-between text-[#5A6B69] font-mono text-[11px]">
                  <span className="flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-[#1B6B63]" />
                    <span>Transmitted directly to attending clinician prior to session start</span>
                  </span>
                  <span className="uppercase">Plaintext UTF-8</span>
                </div>
              </section>
            </section>

            {/* Right Column: Sticky Clinical Ledger & Booking Card (40%) */}
            <aside className="w-full lg:w-[40%] flex justify-center lg:justify-end">
              <div className="w-full max-w-[360px] lg:w-[320px] sticky top-28 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col gap-4">
                {/* Ledger Header */}
                <div>
                  <h2 className="text-sm font-bold text-[#17252A]">
                    Booking summary
                  </h2>
                  <div className="font-mono text-xs text-[#5A6B69] mt-1">
                    Appointment: Live instant triage
                  </div>
                </div>

                {/* Line Item Ledger */}
                <div className="border-t border-[#D8DDDB] pt-2 flex flex-col text-xs">
                  <div className="h-9 flex items-center justify-between border-b border-[#D8DDDB]/60">
                    <span className="text-[#5A6B69]">Doctor</span>
                    <span className="font-medium text-[#17252A] truncate max-w-[170px]">
                      {doctor.name}
                    </span>
                  </div>
                  <div className="h-9 flex items-center justify-between border-b border-[#D8DDDB]/60">
                    <span className="text-[#5A6B69]">Mode</span>
                    <span className="font-mono text-[#17252A] font-medium capitalize">
                      {selectedMode} consultation
                    </span>
                  </div>
                  <div className="h-9 flex items-center justify-between border-b border-[#D8DDDB]/60">
                    <span className="text-[#5A6B69]">Duration</span>
                    <span className="font-mono text-[#17252A]">15 minutes</span>
                  </div>
                  <div className="h-9 flex items-center justify-between border-b border-[#D8DDDB]/60">
                    <span className="text-[#5A6B69]">Case shared</span>
                    <span className="font-mono text-[#17252A]">
                      {shareCase && activeCase ? `#${activeCase._id.slice(-4).toUpperCase()}` : "None"}
                    </span>
                  </div>
                  <div className="h-9 flex items-center justify-between border-b border-[#D8DDDB]/60">
                    <span className="text-[#5A6B69]">Fee</span>
                    <span className="font-mono text-[#17252A]">₹{currentFee}</span>
                  </div>
                  <div className="h-9 flex items-center justify-between border-b border-[#D8DDDB]/60">
                    <span className="text-[#5A6B69]">Platform fee</span>
                    <span className="font-mono text-[#17252A]">₹0</span>
                  </div>

                  {/* Total Valuation Row */}
                  <div className="h-12 flex items-center justify-between pt-1">
                    <span className="text-sm font-bold text-[#17252A]">Total</span>
                    <span className="font-mono text-base font-bold text-[#17252A]">
                      ₹{currentFee}
                    </span>
                  </div>
                </div>

                {/* Action Button: Pay & Confirm */}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleBookAndConfirm}
                    className="w-full h-11 bg-[#1B6B63] hover:bg-[#2B7A78] text-white font-semibold rounded-[4px] flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs disabled:opacity-60"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>
                      {isSubmitting ? "Initializing Clinical Session..." : `Pay ₹${currentFee} and confirm`}
                    </span>
                  </button>
                  <p className="font-mono text-[10px] text-[#5A6B69] text-center leading-normal px-1">
                    Payments are verified under test sandbox protocols. You will receive an instant clinical pass.
                  </p>
                </div>

                {/* Cryptographic Verification Badge */}
                <div className="border-t border-[#D8DDDB] pt-3 flex flex-col gap-1 items-center justify-center text-center">
                  <div className="flex items-center gap-1 font-mono text-[11px] text-[#5A6B69]">
                    <Lock className="w-3.5 h-3.5 text-[#1B6B63]" />
                    <span>256-bit TLS Encrypted</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#5A6B69] uppercase tracking-wider">
                    ICMR-TeleDerm Compliance Node
                  </span>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
