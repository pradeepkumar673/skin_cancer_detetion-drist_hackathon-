"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Radio,
  CircleOff,
  Calendar,
  Clock,
  Coins,
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";

interface DoctorDashboardData {
  id: string;
  name: string;
  email: string;
  specialty: string;
  registrationNumber: string;
  verificationStatus: string;
  bio?: string | null;
  presenceMode: "auto" | "offline";
  isOnline: boolean;
  feesINR: {
    chat: number;
    audio: number;
    video: number;
  };
  isVerified: boolean;
}

interface AppointmentItem {
  id: string;
  patientName: string;
  mode: "chat" | "audio" | "video";
  status: string;
  scheduledAt?: string;
  requestedAt: string;
  note?: string;
}

export default function DoctorDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [doctorData, setDoctorData] = useState<DoctorDashboardData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [presenceUpdating, setPresenceUpdating] = useState<boolean>(false);
  const [presenceSuccess, setPresenceSuccess] = useState<string | null>(null);

  // Load doctor profile and appointments
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    let mounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch doctor profile
        const docRes = await apiClient<{ doctor: DoctorDashboardData }>("/doctors/me");
        if (mounted) {
          setDoctorData(docRes.doctor);
        }

        // Fetch appointments if doctor is verified
        if (docRes.doctor.isVerified) {
          try {
            const apptRes = await apiClient<{ appointments: AppointmentItem[] }>("/appointments");
            if (mounted) {
              setAppointments(apptRes.appointments || []);
            }
          } catch {
            if (mounted) setAppointments([]);
          }
        }
      } catch (err) {
        if (mounted) {
          if (err instanceof ApiError && err.statusCode === 401) {
            router.push("/login");
            return;
          }
          // If 403 with doctor_not_verified, show awaiting screen
          setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [authLoading, isAuthenticated, router]);

  const handlePresenceToggle = async (mode: "auto" | "offline") => {
    try {
      setPresenceUpdating(true);
      setPresenceSuccess(null);
      const res = await apiClient<{ presenceMode: "auto" | "offline"; isOnline: boolean }>(
        "/doctors/me/presence",
        {
          method: "PATCH",
          body: JSON.stringify({ mode }),
        }
      );

      if (doctorData) {
        setDoctorData({
          ...doctorData,
          presenceMode: res.presenceMode,
          isOnline: res.isOnline,
        });
      }
      setPresenceSuccess(`Presence mode updated to ${mode.toUpperCase()}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update presence mode");
    } finally {
      setPresenceUpdating(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // 1. Unverified doctor screen
  if (!doctorData || !doctorData.isVerified || user?.verificationStatus === "pending") {
    return (
      <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
        <PermanentDisclaimer />

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <Card className="border border-[#17252A]/20 bg-[#FEFFFF] shadow-none">
            <CardHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-[4px] bg-[#DEF2F1] text-[#2B7A78] flex items-center justify-center mx-auto mb-3">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold text-[#17252A]">
                Physician Credentials Awaiting Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-[#17252A]/80 leading-relaxed text-center max-w-lg mx-auto">
              <p>
                Your professional medical registration number is currently undergoing clinical administrative verification.
              </p>
              <div className="p-3 bg-[#DEF2F1]/30 border border-[#17252A]/15 rounded-[4px] text-left space-y-1 font-mono text-xs">
                <div>Registration Number: {doctorData?.registrationNumber || user?.doctor?.registrationNumber || "On File"}</div>
                <div>Account Role: Registered Medical Practitioner (Doctor)</div>
                <div>Status: Pending Administrative Review</div>
              </div>
              <p className="text-[11px] text-[#17252A]/60">
                While pending, your public profile is hidden from the patient directory, and public fees or schedule availability cannot be published. You will receive an automated notification once credential verification is completed.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Filter today's appointments and pending requests
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter(
    (a) => a.scheduledAt && a.scheduledAt.slice(0, 10) === todayDateStr
  );
  const pendingRequests = appointments.filter((a) => a.status === "requested");

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
      <PermanentDisclaimer />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#17252A]/15">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17252A] flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-[#2B7A78]" />
              <span>Doctor Practice Dashboard</span>
            </h1>
            <p className="text-xs text-[#17252A]/70 mt-1">
              Welcome, {doctorData.name}. Medical License: {doctorData.registrationNumber} (Verified).
            </p>
          </div>

          {/* Quick links buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/doctor/availability">
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Weekly Schedule</span>
              </Button>
            </Link>
            <Link href="/doctor/fees">
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" />
                <span>Consultation Fees</span>
              </Button>
            </Link>
            <Link href="/appointments">
              <Button variant="primary" size="sm" className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>All Appointments</span>
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </Alert>
        )}

        {presenceSuccess && (
          <Alert variant="info" className="mt-6">
            <CheckCircle2 className="h-4 w-4" />
            <span>{presenceSuccess}</span>
          </Alert>
        )}

        {/* Presence Mode Card */}
        <Card className="mt-6 border border-[#17252A]/15 bg-[#FEFFFF]">
          <CardHeader className="pb-2 border-b border-[#17252A]/10">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#2B7A78]" />
                <span>Live Availability & Presence Mode</span>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-xs font-semibold select-none border ${
                  doctorData.isOnline
                    ? "bg-[#DEF2F1] text-[#2B7A78] border-[#2B7A78]/40"
                    : "bg-[#17252A]/5 text-[#17252A]/60 border-[#17252A]/15"
                }`}
              >
                {doctorData.isOnline ? (
                  <>
                    <Radio className="h-3 w-3 text-[#2B7A78]" />
                    <span>Status: Online</span>
                  </>
                ) : (
                  <>
                    <CircleOff className="h-3 w-3 text-[#17252A]/50" />
                    <span>Status: Offline</span>
                  </>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-[#17252A]/75 leading-relaxed">
              <strong>Presence Protocol:</strong> When set to <em>Automatic</em>, your online status reflects whether you have an active SkinSentry session open in your browser. When set to <em>Appear Offline</em>, you appear offline to all patients regardless of activity.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant={doctorData.presenceMode === "auto" ? "primary" : "secondary"}
                size="sm"
                onClick={() => handlePresenceToggle("auto")}
                isLoading={presenceUpdating && doctorData.presenceMode !== "auto"}
                className="flex items-center gap-1.5"
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Automatic Mode (Online when connected)</span>
              </Button>
              <Button
                variant={doctorData.presenceMode === "offline" ? "primary" : "secondary"}
                size="sm"
                onClick={() => handlePresenceToggle("offline")}
                isLoading={presenceUpdating && doctorData.presenceMode !== "offline"}
                className="flex items-center gap-1.5"
              >
                <CircleOff className="h-3.5 w-3.5" />
                <span>Appear Offline</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Today's Appointments */}
          <Card className="border border-[#17252A]/15">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#2B7A78]" />
                  <span>Today&apos;s Confirmed Consultations</span>
                </div>
                <span className="text-xs font-mono font-normal text-[#17252A]/60">
                  {todayAppointments.length} scheduled
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {todayAppointments.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#17252A]/60">
                  No consultation sessions scheduled for today.
                </div>
              ) : (
                <div className="space-y-3">
                  {todayAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-3 border border-[#17252A]/10 rounded-[4px] flex items-center justify-between text-xs bg-[#DEF2F1]/10"
                    >
                      <div>
                        <div className="font-semibold text-[#17252A]">{appt.patientName}</div>
                        <div className="text-[11px] text-[#17252A]/70 uppercase font-mono">
                          {appt.mode} • Time: {appt.scheduledAt ? new Date(appt.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Pending"}
                        </div>
                      </div>
                      <Link href={`/appointments`}>
                        <Button variant="secondary" size="sm">
                          View Session
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Consultation Requests */}
          <Card className="border border-[#17252A]/15">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#2B7A78]" />
                  <span>Pending Consultation Requests</span>
                </div>
                <span className="text-xs font-mono font-normal text-[#17252A]/60">
                  {pendingRequests.length} pending
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#17252A]/60">
                  No pending consultation requests awaiting physician scheduling.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-3 border border-[#17252A]/10 rounded-[4px] flex items-center justify-between text-xs bg-[#DEF2F1]/10"
                    >
                      <div>
                        <div className="font-semibold text-[#17252A]">{appt.patientName}</div>
                        <div className="text-[11px] text-[#17252A]/70">
                          Mode: {appt.mode.toUpperCase()} • Requested: {new Date(appt.requestedAt).toLocaleDateString()}
                        </div>
                        {appt.note && (
                          <p className="text-[11px] text-[#17252A]/80 italic mt-0.5 max-w-xs truncate">
                            &ldquo;{appt.note}&rdquo;
                          </p>
                        )}
                      </div>
                      <Link href="/appointments">
                        <Button variant="primary" size="sm">
                          Set Schedule Time
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
