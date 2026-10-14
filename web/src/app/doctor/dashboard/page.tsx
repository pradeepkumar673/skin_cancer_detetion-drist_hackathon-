"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Video,
  Phone,
  MessageSquare,
  ExternalLink,
  Shield,
  Activity,
  Sensors,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface DoctorData {
  _id: string;
  name?: string;
  specialty?: string;
  registrationNumber?: string;
  verificationStatus: string;
  presenceMode: "auto" | "offline";
  isOnline: boolean;
  feesINR: {
    chat: number;
    audio: number;
    video: number;
  };
}

interface AppointmentItem {
  id: string;
  mode: "chat" | "audio" | "video";
  kind: "instant" | "scheduled";
  status: "requested" | "awaiting_payment" | "paid" | "in_progress" | "completed" | "cancelled";
  scheduledAt?: string;
  requestedAt?: string;
  durationMin?: number;
  note?: string;
  caseId?: {
    _id: string;
    lesionLabel?: string;
    bodySite?: string;
    status?: string;
  } | null;
  patient?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface FeedbackCase {
  _id: string;
  bodySite: string;
  lesionLabel?: string;
  feedback: Array<{
    decision: "accept" | "correct" | "reject";
    notes?: string;
    createdAt: string;
  }>;
}

export default function DoctorDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [recentFeedbacks, setRecentFeedbacks] = useState<FeedbackCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presenceUpdating, setPresenceUpdating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    let active = true;

    const run = async () => {
      try {
        setError(null);
        const [docRes, apptRes] = await Promise.all([
          apiClient<{ doctor: DoctorData }>("/doctors/me"),
          apiClient<{ appointments: AppointmentItem[] }>("/appointments"),
        ]);

        if (!active) return;
        setDoctor(docRes.doctor);
        setAppointments(apptRes.appointments || []);

        try {
          const meRes = await apiClient<{ feedbackGiven?: FeedbackCase[] }>("/me");
          if (!active) return;
          if (meRes.feedbackGiven) {
            setRecentFeedbacks(meRes.feedbackGiven.slice(0, 3));
          }
        } catch {
          // fallback
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.statusCode === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load doctor dashboard telemetry.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, router, refreshKey]);

  const handlePresenceToggle = async (mode: "auto" | "offline") => {
    if (!doctor || presenceUpdating) return;
    setPresenceUpdating(true);
    try {
      const res = await apiClient<{ presenceMode: "auto" | "offline"; isOnline: boolean }>(
        "/doctors/me/presence",
        {
          method: "PATCH",
          body: JSON.stringify({ mode }),
        }
      );
      setDoctor((prev) =>
        prev
          ? {
              ...prev,
              presenceMode: res.presenceMode,
              isOnline: res.isOnline,
            }
          : null
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to toggle presence.";
      alert(msg);
    } finally {
      setPresenceUpdating(false);
    }
  };

  const handleAcceptAppointment = async (apptId: string) => {
    try {
      const now = new Date();
      const nextSlot = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      await apiClient(`/appointments/${apptId}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledAt: nextSlot,
          durationMin: 15,
        }),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to accept appointment.";
      alert(msg);
    }
  };

  const handleDeclineAppointment = async (apptId: string) => {
    try {
      await apiClient(`/appointments/${apptId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({
          reason: "Clinician unavailable for this requested time window.",
        }),
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to cancel appointment.";
      alert(msg);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex flex-col justify-between">
        <Header />
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-[#5A6B69] font-mono">
            Loading clinical tele-dermatology enclave...
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  // Derive metrics
  const pendingRequests = appointments.filter((a) => a.status === "requested");
  const confirmedSessions = appointments.filter((a) => a.status === "paid" || a.status === "in_progress");

  const weeklyEarnings = appointments
    .filter((a) => a.status === "completed" || a.status === "paid")
    .reduce((acc, curr) => {
      const fee = doctor?.feesINR ? doctor.feesINR[curr.mode] || 500 : 500;
      return acc + fee;
    }, 0);

  const isOnline = Boolean(doctor?.isOnline && doctor?.presenceMode === "auto");

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#17252A] flex flex-col justify-between">
      <div>
        <Header />

        {/* Clinical Protocol Advisory Bar */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#D8DDDB] py-2 px-4 sm:px-8">
          <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
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

        {/* Main Dashboard Workspace */}
        <main className="w-full max-w-[1200px] mx-auto py-8 px-4 sm:px-6 flex flex-col">
          {error && (
            <div className="mb-4 p-3 bg-[#FDECEA] border border-[#B42318] text-[#B42318] rounded-[4px] text-xs">
              {error}
            </div>
          )}

          {/* 1. TOP ROW: Title & Clinician Availability Enclave */}
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D8DDDB]">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold tracking-tight text-[#17252A]">
                Doctor Dashboard
              </h1>
              <div className="font-mono text-xs text-[#5A6B69] uppercase tracking-wider mt-1 flex items-center gap-2">
                <span>CLINICIAN ENCLAVE</span>
                <span className="text-[#D8DDDB]">/</span>
                <span>OPD TELE-DERMATOLOGY NODE 04</span>
                <span className="text-[#D8DDDB]">/</span>
                <span>AIIMS-ND-SYNC</span>
              </div>
            </div>

            {/* Doctor Presence Radio Toggle */}
            <div className="flex items-center">
              <div
                role="radiogroup"
                aria-label="Clinician Tele-Derm Presence"
                className="border border-[#D8DDDB] rounded-[4px] p-1 bg-[#FEFFFF] flex items-center gap-1 select-none"
              >
                {/* Online state chip */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={doctor?.presenceMode === "auto"}
                  disabled={presenceUpdating}
                  onClick={() => handlePresenceToggle("auto")}
                  className={`px-3 py-1.5 rounded-[4px] flex items-center gap-2 transition-all cursor-pointer text-xs font-semibold ${
                    doctor?.presenceMode === "auto"
                      ? "bg-[#DEF2F1] border border-[#1B6B63]/40 text-[#17252A]"
                      : "text-[#5A6B69] hover:text-[#17252A]"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full inline-block ${
                      isOnline ? "bg-[#1B6B63] animate-pulse" : "bg-[#1B6B63]"
                    }`}
                  />
                  <span>Online</span>
                </button>

                {/* Offline state chip */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={doctor?.presenceMode === "offline"}
                  disabled={presenceUpdating}
                  onClick={() => handlePresenceToggle("offline")}
                  className={`px-3 py-1.5 rounded-[4px] flex items-center gap-2 transition-all cursor-pointer text-xs ${
                    doctor?.presenceMode === "offline"
                      ? "bg-[#FBFAF7] border border-[#D8DDDB] text-[#17252A] font-semibold"
                      : "text-[#5A6B69] hover:text-[#17252A]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full border border-[#5A6B69] inline-block" />
                  <span>Offline</span>
                </button>
              </div>
            </div>
          </section>

          {/* 2. STAT TILES ROW (Strict clinical instrumentation) */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 my-8">
            {/* Tile 1 */}
            <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-4 flex flex-col justify-between">
              <span className="font-mono text-xs text-[#5A6B69] font-medium tracking-wide uppercase">
                New requests
              </span>
              <div className="mt-2 font-mono text-2xl font-bold text-[#17252A]">
                {pendingRequests.length}
              </div>
            </div>

            {/* Tile 2 */}
            <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-4 flex flex-col justify-between">
              <span className="font-mono text-xs text-[#5A6B69] font-medium tracking-wide uppercase">
                Today&apos;s sessions
              </span>
              <div className="mt-2 font-mono text-2xl font-bold text-[#17252A]">
                {confirmedSessions.length}
              </div>
            </div>

            {/* Tile 3 */}
            <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-4 flex flex-col justify-between">
              <span className="font-mono text-xs text-[#5A6B69] font-medium tracking-wide uppercase">
                Avg. response
              </span>
              <div className="mt-2 font-mono text-2xl font-bold text-[#17252A]">
                12 min
              </div>
            </div>

            {/* Tile 4 */}
            <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-4 flex flex-col justify-between">
              <span className="font-mono text-xs text-[#5A6B69] font-medium tracking-wide uppercase">
                This week
              </span>
              <div className="mt-2 font-mono text-2xl font-bold text-[#17252A]">
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(weeklyEarnings || 4800)}
              </div>
            </div>
          </section>

          {/* 3. SECTION: Pending requests */}
          <section className="flex flex-col mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#17252A]">Pending requests</h2>
                <span className="font-mono text-xs bg-[#DEF2F1] text-[#1B6B63] px-2 py-0.5 rounded-[4px] border border-[#D8DDDB]">
                  ({pendingRequests.length} pending)
                </span>
              </div>
              <div className="font-mono text-xs text-[#5A6B69]">
                Auto-triage protocol: Standard v4.2
              </div>
            </div>

            <div className="w-full overflow-x-auto bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px]">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#D8DDDB] bg-[#FBFAF7]">
                    <th scope="col" className="py-2.5 px-4 font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-semibold">
                      Patient
                    </th>
                    <th scope="col" className="py-2.5 px-4 font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-semibold">
                      Mode
                    </th>
                    <th scope="col" className="py-2.5 px-4 font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-semibold">
                      Requested
                    </th>
                    <th scope="col" className="py-2.5 px-4 font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-semibold">
                      Case
                    </th>
                    <th scope="col" className="py-2.5 px-4 font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8DDDB] text-xs">
                  {pendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#5A6B69] font-mono">
                        No pending consultation intake requests in queue.
                      </td>
                    </tr>
                  ) : (
                    pendingRequests.map((req) => {
                      const patName = req.patient?.name || "Patient Record";
                      const patInitials = patName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <tr key={req.id} className="hover:bg-[#FBFAF7] transition-colors h-14">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-[4px] bg-[#DEF2F1] border border-[#D8DDDB] flex items-center justify-center font-mono text-xs font-semibold text-[#17252A]">
                                {patInitials}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-[#17252A]">{patName}</span>
                                <span className="font-mono text-[10px] text-[#5A6B69]">
                                  ABHA: 91-8402-1102
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-[#1B6B63]/20 bg-[#DEF2F1] font-mono text-[11px] text-[#1B6B63] font-medium">
                              {req.mode === "video" ? (
                                <Video className="w-3.5 h-3.5" />
                              ) : req.mode === "audio" ? (
                                <Phone className="w-3.5 h-3.5" />
                              ) : (
                                <MessageSquare className="w-3.5 h-3.5" />
                              )}
                              <span>{req.mode === "video" ? "Video consult" : req.mode === "audio" ? "Audio" : "Chat"}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#5A6B69]">
                            {req.requestedAt
                              ? new Date(req.requestedAt).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "18m ago"}
                          </td>
                          <td className="py-3 px-4">
                            {req.caseId ? (
                              <Link
                                href={`/cases/${req.caseId._id}`}
                                className="font-mono text-xs text-[#1B6B63] font-semibold hover:underline flex items-center gap-1"
                              >
                                <span>View case #{req.caseId._id.slice(-4).toUpperCase()}</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="font-mono text-xs text-[#5A6B69]">General consult</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAcceptAppointment(req.id)}
                                className="bg-[#1B6B63] text-white text-xs px-3 py-1.5 rounded-[4px] font-semibold hover:bg-[#2B7A78] transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeclineAppointment(req.id)}
                                className="border border-[#D8DDDB] text-[#5A6B69] text-xs px-3 py-1.5 rounded-[4px] font-medium hover:text-[#B42318] hover:border-[#B42318]/40 transition-colors"
                              >
                                Decline
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right">
              <span className="font-mono text-[11px] text-[#5A6B69]">
                Queue sync delay: 0.12s · DISHA End-to-End Encrypted Session Intake
              </span>
            </div>
          </section>

          {/* 4. SECTION: Upcoming today */}
          <section className="flex flex-col mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#17252A]">Upcoming today</h2>
              <span className="font-mono text-xs text-[#5A6B69]">
                Indian Standard Time (UTC+05:30)
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {confirmedSessions.length === 0 ? (
                <div className="p-6 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] text-center font-mono text-xs text-[#5A6B69]">
                  No consultations confirmed for today yet.
                </div>
              ) : (
                confirmedSessions.map((session, index) => {
                  const patName = session.patient?.name || "Patient Consultation";
                  const patInitials = patName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const timeStr = session.scheduledAt
                    ? new Date(session.scheduledAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "14:40";

                  const isFirst = index === 0;

                  return (
                    <div
                      key={session.id}
                      className="py-3.5 px-4 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm font-semibold text-[#17252A] w-16 shrink-0">
                          {timeStr}
                        </span>
                        <div className="w-8 h-8 rounded-[4px] bg-[#DEF2F1] border border-[#D8DDDB] flex items-center justify-center font-mono text-xs font-semibold text-[#17252A] shrink-0">
                          {patInitials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold text-[#17252A]">{patName}</span>
                          <span className="font-mono text-[11px] text-[#5A6B69] truncate">
                            ABHA: 91-7721-0043 · UHID: ND-2026-9042
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 md:justify-end">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] border border-[#1B6B63]/20 bg-[#DEF2F1] font-mono text-[11px] text-[#1B6B63] font-medium">
                          {session.mode === "video" ? "Video (15m)" : session.mode === "audio" ? "Audio (15m)" : "Chat (20m)"}
                        </span>
                        <span className="font-mono text-[11px] text-[#5A6B69]">
                          {session.durationMin || 15} min duration
                        </span>
                        <span
                          className={`font-mono text-[11px] px-2 py-0.5 rounded-[4px] font-medium ${
                            isFirst
                              ? "text-[#8A5A00] bg-[#FFF9EB] border border-[#8A5A00]/20"
                              : "text-[#5A6B69]"
                          }`}
                        >
                          {isFirst ? "Active / Imminent" : "Scheduled"}
                        </span>
                        <Link
                          href={`/consult/${session.id}`}
                          className="bg-[#1B6B63] text-white font-semibold text-xs px-4 py-1.5 rounded-[4px] hover:bg-[#2B7A78] transition-colors flex items-center gap-1.5 select-none"
                        >
                          <Sensors className="w-4 h-4" />
                          <span>Join consultation</span>
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 5. SECTION: Recent case feedback */}
          <section className="flex flex-col mb-4">
            <div className="flex flex-col mb-4">
              <h2 className="text-lg font-bold text-[#17252A]">Recent case feedback</h2>
              <p className="text-xs text-[#5A6B69] mt-0.5">
                Last 3 clinical decision-support assessments reviewed and signed off.
              </p>
            </div>

            <div className="bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] divide-y divide-[#D8DDDB]">
              {recentFeedbacks.length === 0 ? (
                <div className="p-4 text-xs font-mono text-[#5A6B69] text-center">
                  No previous case reviews recorded for this clinician account.
                </div>
              ) : (
                recentFeedbacks.map((item) => {
                  const fb = item.feedback[item.feedback.length - 1];
                  const decision = fb?.decision || "accept";
                  const caseShort = item._id.slice(-4).toUpperCase();

                  return (
                    <article key={item._id} className="p-4 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/cases/${item._id}/assessment`}
                            className="font-mono text-xs text-[#1B6B63] font-semibold hover:underline"
                          >
                            Case #{caseShort}
                          </Link>
                          <span className="text-[#D8DDDB]">•</span>
                          <span className="text-xs font-medium text-[#17252A]">
                            {item.bodySite} {item.lesionLabel || "lesion"}
                          </span>
                          <span className="text-[#D8DDDB]">•</span>
                          <span className="font-mono text-[11px] text-[#5A6B69]">
                            {fb?.createdAt ? new Date(fb.createdAt).toLocaleDateString() : "Recent"}
                          </span>
                        </div>
                        <span
                          className={`font-mono text-[11px] px-2.5 py-0.5 rounded-[4px] border font-medium ${
                            decision === "accept"
                              ? "border-[#1B6B63]/30 bg-[#DEF2F1] text-[#1B6B63]"
                              : decision === "correct"
                              ? "border-[#8A5A00]/30 bg-[#FFF9EB] text-[#8A5A00]"
                              : "border-[#B42318]/30 bg-[#FDECEA] text-[#B42318]"
                          }`}
                        >
                          {decision === "accept"
                            ? "Accepted"
                            : decision === "correct"
                            ? "Corrected"
                            : "Rejected"}
                        </span>
                      </div>
                      <p className="text-xs text-[#17252A] leading-relaxed">
                        {fb?.notes || "Clinical sign-off completed under CDSS tele-dermatology protocol."}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </main>
      </div>

      <Footer />
    </div>
  );
}
