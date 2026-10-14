"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Radio,
  CircleOff,
  Calendar,
  Clock,
  MessageSquare,
  Phone,
  Video,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FormField } from "@/components/ui/FormField";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
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

interface PatientCaseOption {
  id: string;
  lesionLabel?: string;
  bodySite?: string;
  createdAt: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SPECIALTY_LABELS: Record<string, string> = {
  dermatologist: "Dermatologist",
  wound_care: "Wound Care Specialist",
  diabetologist: "Diabetologist",
  general: "General Physician",
};

function getInitials(name: string): string {
  if (!name) return "DR";
  const parts = name.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DoctorDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const doctorId = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [doctor, setDoctor] = useState<DoctorDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected booking parameters
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<"chat" | "audio" | "video">("chat");

  // Case attachment & consent
  const [patientCases, setPatientCases] = useState<PatientCaseOption[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [caseConsentAccepted, setCaseConsentAccepted] = useState<boolean>(false);
  const [bookingNote, setBookingNote] = useState<string>("");

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  // Load doctor details
  useEffect(() => {
    let mounted = true;

    async function loadDoctor() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await apiClient<{ doctor: DoctorDetails }>(`/doctors/${doctorId}`);
        if (mounted) {
          setDoctor(data.doctor);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Doctor not found");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadDoctor();

    return () => {
      mounted = false;
    };
  }, [doctorId]);

  // Load patient's cases for case attachment dropdown
  useEffect(() => {
    if (user?.role === "patient") {
      apiClient<{ cases: PatientCaseOption[] }>("/cases?limit=20")
        .then((res) => setPatientCases(res.cases || []))
        .catch(() => setPatientCases([]));
    }
  }, [user]);

  // Load slots whenever selected date changes
  useEffect(() => {
    let mounted = true;

    async function loadSlots() {
      if (!selectedDate || !doctorId) return;
      try {
        setSlotsLoading(true);
        setSelectedSlot(null);
        const data = await apiClient<{ slots: string[] }>(
          `/doctors/${doctorId}/slots?date=${selectedDate}`
        );
        if (mounted) {
          setSlots(data.slots || []);
        }
      } catch {
        if (mounted) {
          setSlots([]);
        }
      } finally {
        if (mounted) {
          setSlotsLoading(false);
        }
      }
    }

    loadSlots();

    return () => {
      mounted = false;
    };
  }, [doctorId, selectedDate]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor) return;

    if (selectedCaseId && !caseConsentAccepted) {
      alert("Please acknowledge consent to share your selected case with the physician.");
      return;
    }

    try {
      setSubmitting(true);

      // Create consent if case is attached
      if (selectedCaseId) {
        try {
          await apiClient("/consents", {
            method: "POST",
            body: JSON.stringify({ doctorId: doctor.id, caseId: selectedCaseId }),
          });
        } catch {
          // Continue if already exists or consent table updated
        }
      }

      // Compute scheduledAt ISO timestamp if slot is selected
      let scheduledAt: string | undefined = undefined;
      if (selectedSlot) {
        scheduledAt = new Date(`${selectedDate}T${selectedSlot}:00Z`).toISOString();
      }

      // Check if talk now instant consultation
      const isTalkNow = doctor.isOnline && !selectedSlot;

      const payload = {
        doctorId: doctor.id,
        mode: selectedMode,
        caseId: selectedCaseId || undefined,
        note: bookingNote.trim() || undefined,
        scheduledAt,
        kind: isTalkNow ? "instant" : "scheduled",
      };

      await apiClient("/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setBookingSuccess("Consultation request successfully submitted.");
      setTimeout(() => {
        router.push("/appointments");
      }, 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create appointment");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] p-6 max-w-4xl mx-auto">
        <Alert variant="error" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <span>{error || "Doctor not found"}</span>
        </Alert>
        <Link href="/doctors">
          <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Doctors Directory</span>
          </Button>
        </Link>
      </div>
    );
  }

  const selectedFeeINR =
    selectedMode === "chat"
      ? doctor.fees.chatINR
      : selectedMode === "audio"
      ? doctor.fees.audioINR
      : doctor.fees.videoINR;

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
      <PermanentDisclaimer />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Link
            href="/doctors"
            className="inline-flex items-center gap-1.5 text-xs text-[#2B7A78] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Doctors Directory</span>
          </Link>
        </div>

        {/* Doctor Header Profile */}
        <div className="border border-[#17252A]/15 rounded-[4px] p-6 bg-[#FEFFFF] mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-[4px] border border-[#2B7A78]/30 bg-[#DEF2F1] text-[#17252A] flex items-center justify-center font-bold text-xl tracking-wider shrink-0">
                {getInitials(doctor.name)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#17252A]">{doctor.name}</h1>
                <span className="text-xs font-semibold text-[#2B7A78] uppercase tracking-wider">
                  {SPECIALTY_LABELS[doctor.specialty] || doctor.specialty}
                </span>
                <div className="text-[11px] text-[#17252A]/60 font-mono mt-1">
                  Timezone: {doctor.timezone}
                </div>
              </div>
            </div>

            {/* Live Presence Badge */}
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[4px] text-xs font-semibold select-none border ${
                doctor.isOnline
                  ? "bg-[#DEF2F1] text-[#2B7A78] border-[#2B7A78]/40"
                  : "bg-[#17252A]/5 text-[#17252A]/60 border-[#17252A]/15"
              }`}
            >
              {doctor.isOnline ? (
                <>
                  <Radio className="h-4 w-4 text-[#2B7A78]" />
                  <span>Online Now</span>
                </>
              ) : (
                <>
                  <CircleOff className="h-4 w-4 text-[#17252A]/50" />
                  <span>Currently Offline</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#17252A]/10 text-xs text-[#17252A]/80 leading-relaxed">
            <h2 className="font-bold text-[#17252A] mb-1">Clinical Biography:</h2>
            <p>{doctor.bio || "No professional biography provided."}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Weekly Schedule & Consultation Rates */}
          <div className="space-y-6">
            <Card className="border border-[#17252A]/15">
              <CardHeader className="pb-3 border-b border-[#17252A]/10">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#2B7A78]" />
                  <span>Consultation Rates</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between p-2 rounded-[4px] bg-[#DEF2F1]/20 border border-[#17252A]/10">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-[#2B7A78]" />
                    <span className="font-medium">Text Chat</span>
                  </div>
                  <span className="font-bold">₹{doctor.fees.chatINR}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-[4px] bg-[#DEF2F1]/20 border border-[#17252A]/10">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#2B7A78]" />
                    <span className="font-medium">Voice Audio</span>
                  </div>
                  <span className="font-bold">₹{doctor.fees.audioINR}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-[4px] bg-[#DEF2F1]/20 border border-[#17252A]/10">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-[#2B7A78]" />
                    <span className="font-medium">Video Consultation</span>
                  </div>
                  <span className="font-bold">₹{doctor.fees.videoINR}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-[#17252A]/15">
              <CardHeader className="pb-3 border-b border-[#17252A]/10">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#2B7A78]" />
                  <span>Weekly Practice Hours</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                {doctor.weeklySummary.length === 0 ? (
                  <span className="text-[#17252A]/60 italic">No recurring schedule listed.</span>
                ) : (
                  doctor.weeklySummary.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1 border-b border-[#17252A]/5 last:border-none">
                      <span className="font-semibold text-[#17252A]">
                        {WEEKDAY_NAMES[item.weekday]}
                      </span>
                      <span className="font-mono text-[#17252A]/70">
                        {item.startTime} - {item.endTime}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Appointment Booking Panel */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-[#17252A]/15">
              <CardHeader className="pb-3 border-b border-[#17252A]/10">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-[#2B7A78]" />
                  <span>Book Consultation</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {bookingSuccess && (
                  <Alert variant="info" className="mb-4">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{bookingSuccess}</span>
                  </Alert>
                )}

                <form onSubmit={handleBookingSubmit} className="space-y-5 text-xs">
                  {/* Mode selector */}
                  <FormField label="Consultation Mode" htmlFor="booking-mode" required>
                    <div className="grid grid-cols-3 gap-3">
                      {(["chat", "audio", "video"] as const).map((m) => {
                        const fee =
                          m === "chat"
                            ? doctor.fees.chatINR
                            : m === "audio"
                            ? doctor.fees.audioINR
                            : doctor.fees.videoINR;
                        const isSelected = selectedMode === m;
                        return (
                          <button
                            type="button"
                            key={m}
                            onClick={() => setSelectedMode(m)}
                            className={`p-3 text-left border rounded-[4px] transition-colors duration-150 ${
                              isSelected
                                ? "border-[#2B7A78] bg-[#DEF2F1]/30 font-semibold"
                                : "border-[#17252A]/15 bg-[#FEFFFF] hover:border-[#2B7A78]/40"
                            }`}
                          >
                            <span className="block capitalize font-bold text-[#17252A]">{m}</span>
                            <span className="text-[11px] text-[#2B7A78]">₹{fee}</span>
                          </button>
                        );
                      })}
                    </div>
                  </FormField>

                  {/* Date picker */}
                  <FormField label="Select Date for Consultation" htmlFor="booking-date" required>
                    <Input
                      id="booking-date"
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </FormField>

                  {/* Real Slots Grid */}
                  <div>
                    <label className="block font-semibold text-[#17252A] mb-2">
                      Available Time Slots on {selectedDate}:
                    </label>
                    {slotsLoading ? (
                      <div className="py-6 flex justify-center text-xs text-[#17252A]/70 gap-2 items-center">
                        <Spinner size="sm" />
                        <span>Checking physician schedule...</span>
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="p-3 border border-[#17252A]/10 bg-[#DEF2F1]/20 rounded-[4px] text-xs text-[#17252A]/70">
                        No bookable slots on this date according to physician availability. You may send an offline request to propose a custom time.
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {slots.map((s) => {
                          const isSelected = selectedSlot === s;
                          return (
                            <button
                              type="button"
                              key={s}
                              onClick={() => setSelectedSlot(isSelected ? null : s)}
                              className={`py-2 px-1 text-center font-mono text-xs rounded-[4px] border transition-colors duration-150 ${
                                isSelected
                                  ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78] font-bold"
                                  : "border-[#17252A]/20 bg-[#FEFFFF] hover:border-[#2B7A78] text-[#17252A]"
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Case Attachment dropdown */}
                  <FormField
                    label="Attach Screening Case (Optional)"
                    htmlFor="attach-case"
                    hint="Share measured lesion attributes and photographs directly with the physician."
                  >
                    <Select
                      id="attach-case"
                      value={selectedCaseId}
                      onChange={(e) => setSelectedCaseId(e.target.value)}
                    >
                      <option value="">No case attached</option>
                      {patientCases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.lesionLabel || "Screening Case"} ({c.bodySite || "Unspecified"}) - {new Date(c.createdAt).toLocaleDateString()}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  {/* Consent statement if case attached */}
                  {selectedCaseId && (
                    <div className="p-3 border border-[#2B7A78]/30 bg-[#DEF2F1]/30 rounded-[4px] space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer text-xs select-none">
                        <input
                          type="checkbox"
                          checked={caseConsentAccepted}
                          onChange={(e) => setCaseConsentAccepted(e.target.checked)}
                          className="mt-0.5 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] focus:ring-[#2B7A78]"
                          required
                        />
                        <span className="text-[#17252A]/90">
                          <strong className="text-[#17252A]">Consent to Share Health Record:</strong> I consent to share the selected screening case, photographs, and algorithmic measurements with {doctor.name} for the purpose of clinical decision support.
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Note */}
                  <FormField label="Consultation Note (Optional)" htmlFor="booking-note">
                    <Textarea
                      id="booking-note"
                      rows={2}
                      placeholder="Symptoms, duration, prior treatments, or clinical questions..."
                      value={bookingNote}
                      onChange={(e) => setBookingNote(e.target.value)}
                    />
                  </FormField>

                  {/* Plain text explanation of flow */}
                  <div className="p-3 bg-[#DEF2F1]/20 border border-[#17252A]/10 rounded-[4px] text-[11px] text-[#17252A]/80 leading-relaxed">
                    <ShieldCheck className="h-4 w-4 text-[#2B7A78] inline mr-1 -mt-0.5" />
                    <strong>Booking Protocol:</strong>{" "}
                    {doctor.isOnline && !selectedSlot
                      ? "The physician is currently online. Selecting Talk Now initiates an instant session awaiting payment."
                      : "For scheduled slots or offline physicians, a consultation request is registered. The physician confirms the session time, after which a payment window is provided."}
                  </div>

                  {/* Submit button */}
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-full"
                    isLoading={submitting}
                  >
                    {doctor.isOnline && !selectedSlot
                      ? `Talk Now (Instant ${selectedMode.toUpperCase()} - ₹${selectedFeeINR})`
                      : selectedSlot
                      ? `Book Slot at ${selectedSlot} (₹${selectedFeeINR})`
                      : `Send Consultation Request (₹${selectedFeeINR})`}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DoctorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FEFFFF] text-[#17252A] py-20">
          <Spinner size="lg" />
          <p className="text-xs text-[#17252A]/70 font-mono">Loading physician profile...</p>
        </div>
      }
    >
      <DoctorDetailContent params={params} />
    </React.Suspense>
  );
}
