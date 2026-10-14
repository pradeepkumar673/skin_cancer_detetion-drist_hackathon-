"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MessageSquare,
  Phone,
  Video,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  Stethoscope,
  CreditCard,
  Ban,
  ArrowRight,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";

interface AppointmentData {
  id: string;
  mode: "chat" | "audio" | "video";
  kind: "instant" | "scheduled";
  status:
    | "requested"
    | "awaiting_payment"
    | "paid"
    | "in_progress"
    | "completed"
    | "cancelled"
    | "expired"
    | "no_show";
  scheduledAt?: string;
  durationMin?: number;
  note?: string;
  requestedAt: string;
  confirmedAt?: string;
  paymentDeadlineAt?: string;
  cancelledReason?: string;
  doctor?: {
    id: string;
    name: string;
    specialty: string;
    feesINR: {
      chat: number;
      audio: number;
      video: number;
    };
  } | null;
  patient?: {
    id: string;
    name: string;
  } | null;
  case?: {
    id: string;
    label: string;
    bodySite: string;
  } | null;
}

interface PaymentOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

interface PaymentVerifyResponse {
  success: boolean;
  payment: {
    id: string;
    status: string;
    orderId: string;
    paymentId: string;
    amountPaise: number;
    currency: string;
  };
}

interface ActivePaymentState {
  status: "idle" | "creating_order" | "paying" | "verifying" | "paid" | "failed";
  error?: string;
  receipt?: {
    amountINR: number;
    orderId: string;
    paymentId: string;
  };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  requested: {
    label: "Requested (Awaiting Physician)",
    bg: "bg-[#DEF2F1]/30",
    text: "text-[#17252A]",
    border: "border-[#17252A]/20",
  },
  awaiting_payment: {
    label: "Awaiting Payment",
    bg: "bg-[#DEF2F1]",
    text: "text-[#2B7A78]",
    border: "border-[#2B7A78]/50",
  },
  paid: {
    label: "Paid (Confirmed)",
    bg: "bg-[#2B7A78]/10",
    text: "text-[#2B7A78]",
    border: "border-[#2B7A78]",
  },
  in_progress: {
    label: "Session In Progress",
    bg: "bg-[#2B7A78]",
    text: "text-[#FEFFFF]",
    border: "border-[#2B7A78]",
  },
  completed: {
    label: "Completed",
    bg: "bg-[#17252A]/5",
    text: "text-[#17252A]",
    border: "border-[#17252A]/20",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  expired: {
    label: "Expired (Unpaid)",
    bg: "bg-[#17252A]/5",
    text: "text-[#17252A]/60",
    border: "border-[#17252A]/15",
  },
  no_show: {
    label: "No Show",
    bg: "bg-[#17252A]/5",
    text: "text-[#17252A]/60",
    border: "border-[#17252A]/15",
  },
};

/**
 * Loads Razorpay checkout.js script dynamically on demand
 */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Format remaining window time
 */
function getRemainingWindowText(deadlineIso?: string, currentTimestamp?: number | null): { text: string; isExpired: boolean } {
  if (!deadlineIso) return { text: "", isExpired: false };
  if (!currentTimestamp) return { text: "Payment window active", isExpired: false };
  const diff = new Date(deadlineIso).getTime() - currentTimestamp;
  if (diff <= 0) return { text: "Payment window expired", isExpired: true };
  const minutes = Math.floor(diff / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);
  return { text: `${minutes}m ${seconds}s remaining to pay`, isExpired: false };
}

export default function AppointmentsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
          <Spinner className="h-6 w-6 text-[#2B7A78]" />
        </div>
      }
    >
      <AppointmentsContent />
    </React.Suspense>
  );
}

function AppointmentsContent() {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";

  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "requests" | "past">("upcoming");
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);

  // Payment state tracking per appointment
  const [paymentStates, setPaymentStates] = useState<Record<string, ActivePaymentState>>({});

  // Scheduling Dialog state (for Doctors)
  const [schedulingAppt, setSchedulingAppt] = useState<AppointmentData | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState<string>("10:00");
  const [scheduleDuration, setScheduleDuration] = useState<number>(15);
  const [scheduleSubmitting, setScheduleSubmitting] = useState<boolean>(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Cancellation Dialog state
  const [cancellingAppt, setCancellingAppt] = useState<AppointmentData | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelSubmitting, setCancelSubmitting] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const fetchAppointments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient<{ appointments: AppointmentData[] }>("/appointments");
      setAppointments(data.appointments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
    setCurrentTimestamp(Date.now());
    const interval = setInterval(() => setCurrentTimestamp(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenScheduleModal = (appt: AppointmentData) => {
    setSchedulingAppt(appt);
    setScheduleError(null);
    const defaultDate = appt.scheduledAt
      ? appt.scheduledAt.slice(0, 10)
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setScheduleDate(defaultDate);
    setScheduleTime("10:00");
    setScheduleDuration(appt.durationMin || 15);
  };

  const handleConfirmSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingAppt) return;

    try {
      setScheduleSubmitting(true);
      setScheduleError(null);

      const scheduledAtIso = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();

      await apiClient(`/appointments/${schedulingAppt.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledAt: scheduledAtIso,
          durationMin: Number(scheduleDuration),
        }),
      });

      setSchedulingAppt(null);
      await fetchAppointments();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Failed to schedule appointment");
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleOpenCancelModal = (appt: AppointmentData) => {
    setCancellingAppt(appt);
    setCancelReason("");
    setCancelError(null);
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingAppt) return;

    try {
      setCancelSubmitting(true);
      setCancelError(null);

      await apiClient(`/appointments/${cancellingAppt.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: cancelReason }),
      });

      setCancellingAppt(null);
      await fetchAppointments();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel appointment");
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Razorpay payment launch
  const handlePayConsultationFee = async (appt: AppointmentData) => {
    setPaymentStates((prev) => ({
      ...prev,
      [appt.id]: { status: "creating_order" },
    }));

    try {
      // 1. Create or retrieve order from API
      const orderData = await apiClient<PaymentOrderResponse>("/payments/order", {
        method: "POST",
        body: JSON.stringify({ appointmentId: appt.id }),
      });

      // 2. Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error("Unable to load Razorpay payment gateway. Please check your connection.");
      }

      setPaymentStates((prev) => ({
        ...prev,
        [appt.id]: { status: "paying" },
      }));

      // 3. Open Razorpay modal
      interface RazorpayPaymentResponse {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }

      type RazorpayConstructor = new (options: Record<string, unknown>) => {
        open: () => void;
      };

      const RazorpayClass = (window as unknown as { Razorpay: RazorpayConstructor }).Razorpay;
      const rzpInstance = new RazorpayClass({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "SkinSentry Medical",
        description: `${appt.mode.toUpperCase()} Consultation Fee`,
        order_id: orderData.orderId,
        handler: async (response: RazorpayPaymentResponse) => {
          setPaymentStates((prev) => ({
            ...prev,
            [appt.id]: { status: "verifying" },
          }));

          try {
            const verifyRes = await apiClient<PaymentVerifyResponse>("/payments/verify", {
              method: "POST",
              body: JSON.stringify(response),
            });

            setPaymentStates((prev) => ({
              ...prev,
              [appt.id]: {
                status: "paid",
                receipt: {
                  amountINR: Math.round(verifyRes.payment.amountPaise / 100),
                  orderId: verifyRes.payment.orderId,
                  paymentId: verifyRes.payment.paymentId,
                },
              },
            }));

            await fetchAppointments();
          } catch (err) {
            setPaymentStates((prev) => ({
              ...prev,
              [appt.id]: {
                status: "failed",
                error:
                  err instanceof Error
                    ? err.message
                    : "Payment verification failed. Please contact support.",
              },
            }));
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentStates((prev) => {
              if (prev[appt.id]?.status === "paying") {
                return { ...prev, [appt.id]: { status: "idle" } };
              }
              return prev;
            });
          },
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
        },
        theme: {
          color: "#2B7A78",
        },
      });

      rzpInstance.open();
    } catch (err) {
      setPaymentStates((prev) => ({
        ...prev,
        [appt.id]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Payment initialization failed",
        },
      }));
    }
  };

  // Group appointments into tabs
  const upcomingAppointments = appointments.filter((a) =>
    ["awaiting_payment", "paid", "in_progress"].includes(a.status)
  );
  const requestAppointments = appointments.filter((a) => a.status === "requested");
  const pastAppointments = appointments.filter((a) =>
    ["completed", "cancelled", "expired", "no_show"].includes(a.status)
  );

  const displayedList =
    activeTab === "upcoming"
      ? upcomingAppointments
      : activeTab === "requests"
      ? requestAppointments
      : pastAppointments;

  return (
    <div className="min-h-screen bg-[#FEFFFF] flex flex-col">
      <header className="border-b border-[#DEF2F1] bg-[#FEFFFF] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-[#17252A] flex items-center gap-2"
            >
              <div className="h-6 w-6 rounded-[4px] bg-[#2B7A78] flex items-center justify-center text-[#FEFFFF] text-xs font-black">
                S
              </div>
              <span>SkinSentry</span>
            </Link>
            <span className="text-xs text-[#17252A]/40 font-mono">/</span>
            <h1 className="text-sm font-semibold text-[#17252A]">
              {isDoctor ? "Practice Consultations" : "My Appointments"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {!isDoctor && (
              <Link href="/doctors">
                <Button variant="primary" size="sm" className="flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" />
                  <span>Book New Consultation</span>
                </Button>
              </Link>
            )}
            {isDoctor && (
              <Link href="/doctor/dashboard">
                <Button variant="secondary" size="sm">
                  Practice Dashboard
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        <PermanentDisclaimer />

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#DEF2F1] pb-2">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] transition-colors duration-150 flex items-center gap-2 ${
              activeTab === "upcoming"
                ? "bg-[#2B7A78] text-[#FEFFFF]"
                : "bg-transparent text-[#17252A] hover:bg-[#DEF2F1]/50"
            }`}
          >
            <span>Upcoming Consultations</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-[4px] bg-[#17252A]/20">
              {upcomingAppointments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("requests")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] transition-colors duration-150 flex items-center gap-2 ${
              activeTab === "requests"
                ? "bg-[#2B7A78] text-[#FEFFFF]"
                : "bg-transparent text-[#17252A] hover:bg-[#DEF2F1]/50"
            }`}
          >
            <span>Pending Requests</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-[4px] bg-[#17252A]/20">
              {requestAppointments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("past")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] transition-colors duration-150 flex items-center gap-2 ${
              activeTab === "past"
                ? "bg-[#2B7A78] text-[#FEFFFF]"
                : "bg-transparent text-[#17252A] hover:bg-[#DEF2F1]/50"
            }`}
          >
            <span>Past & Cancelled</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-[4px] bg-[#17252A]/20">
              {pastAppointments.length}
            </span>
          </button>
        </div>

        {/* Error message */}
        {error && (
          <Alert variant="error">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </Alert>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner className="h-6 w-6 text-[#2B7A78]" />
            <p className="text-xs text-[#17252A]/60">Loading consultations...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedList.length === 0 ? (
              <Card className="border border-[#17252A]/10 bg-[#FEFFFF]">
                <CardContent className="p-10 text-center space-y-3">
                  <div className="h-10 w-10 mx-auto rounded-[4px] bg-[#DEF2F1] flex items-center justify-center text-[#2B7A78]">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-[#17252A]">No appointments in this tab</h3>
                  <p className="text-xs text-[#17252A]/70 max-w-sm mx-auto">
                    {activeTab === "upcoming"
                      ? "You do not have any upcoming confirmed or awaiting payment consultations."
                      : activeTab === "requests"
                      ? "No pending consultation requests at this time."
                      : "No past, completed, or cancelled consultations on record."}
                  </p>
                  {!isDoctor && activeTab === "upcoming" && (
                    <Link href="/doctors">
                      <Button variant="primary" size="sm" className="mt-2">
                        Find a Dermatologist
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              displayedList.map((appt) => {
                const badgeCfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.requested;
                const otherPartyName = isDoctor
                  ? appt.patient?.name || "Patient"
                  : appt.doctor?.name || "Physician";
                const pState = paymentStates[appt.id] || { status: "idle" };
                const deadlineInfo = getRemainingWindowText(appt.paymentDeadlineAt, currentTimestamp);
                const feeINR = appt.doctor?.feesINR?.[appt.mode] || 0;

                return (
                  <Card
                    key={appt.id}
                    className="border border-[#17252A]/15 bg-[#FEFFFF] hover:border-[#2B7A78]/40 transition-colors duration-150"
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-[#17252A]">
                              {otherPartyName}
                            </span>
                            {!isDoctor && appt.doctor?.specialty && (
                              <span className="text-[11px] text-[#2B7A78] font-semibold uppercase">
                                • {appt.doctor.specialty}
                              </span>
                            )}
                            <div
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[4px] text-xs font-semibold select-none border ${badgeCfg.bg} ${badgeCfg.text} ${badgeCfg.border}`}
                            >
                              <span>{badgeCfg.label}</span>
                            </div>
                          </div>

                          {/* Time details */}
                          <div className="text-xs text-[#17252A]/80 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-[#2B7A78]" />
                              <span>
                                {appt.scheduledAt
                                  ? `Scheduled: ${new Date(appt.scheduledAt).toLocaleString()}`
                                  : `Requested: ${new Date(appt.requestedAt).toLocaleDateString()}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {appt.mode === "chat" ? (
                                <MessageSquare className="h-3.5 w-3.5 text-[#2B7A78]" />
                              ) : appt.mode === "audio" ? (
                                <Phone className="h-3.5 w-3.5 text-[#2B7A78]" />
                              ) : (
                                <Video className="h-3.5 w-3.5 text-[#2B7A78]" />
                              )}
                              <span className="uppercase">{appt.mode}</span>
                            </div>
                          </div>

                          {/* Payment deadline alert if awaiting payment */}
                          {appt.status === "awaiting_payment" && (
                            <div className="p-3 bg-[#DEF2F1] border border-[#2B7A78]/30 rounded-[4px] text-xs text-[#17252A] space-y-1">
                              <div className="flex items-center justify-between font-semibold">
                                <span>Fee: ₹{feeINR}</span>
                                <span
                                  className={deadlineInfo.isExpired ? "text-red-700" : "text-[#2B7A78]"}
                                >
                                  {deadlineInfo.text}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#17252A]/80">
                                Complete payment using Razorpay test mode before the window expires to secure your slot.
                              </p>
                            </div>
                          )}

                          {/* Payment failure alert */}
                          {pState.status === "failed" && pState.error && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded-[4px] text-xs text-red-700 flex items-center justify-between">
                              <span>We could not send or verify payment: {pState.error}</span>
                            </div>
                          )}

                          {/* Payment Receipt display if paid or recently verified */}
                          {(appt.status === "paid" || pState.status === "paid") && (
                            <div className="p-3 bg-[#FEFFFF] border border-[#2B7A78]/40 rounded-[4px] text-xs text-[#17252A] space-y-1">
                              <div className="flex items-center gap-1.5 font-bold text-[#2B7A78]">
                                <Receipt className="h-4 w-4" />
                                <span>Payment Confirmed & Verified</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-[#17252A]/80 pt-1">
                                <span>
                                  Amount: ₹{pState.receipt?.amountINR || feeINR}
                                </span>
                                {pState.receipt?.orderId && (
                                  <span>Order ID: {pState.receipt.orderId}</span>
                                )}
                                {pState.receipt?.paymentId && (
                                  <span>Payment ID: {pState.receipt.paymentId}</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Cancellation reason if cancelled */}
                          {appt.status === "cancelled" && appt.cancelledReason && (
                            <div className="text-xs text-red-700 bg-red-50 p-2 rounded-[4px] border border-red-200">
                              <strong>Cancellation Reason:</strong> {appt.cancelledReason}
                            </div>
                          )}

                          {/* Attached screening case */}
                          {appt.case && (
                            <div className="flex items-center gap-2 text-xs text-[#17252A]/80 pt-1">
                              <FileText className="h-3.5 w-3.5 text-[#2B7A78]" />
                              <span>Attached Screening Case:</span>
                              <Link
                                href={`/cases/${appt.case.id}`}
                                className="text-[#2B7A78] font-bold hover:underline"
                              >
                                {appt.case.label} ({appt.case.bodySite})
                              </Link>
                            </div>
                          )}

                          {/* Note */}
                          {appt.note && (
                            <p className="text-xs text-[#17252A]/70 italic max-w-lg">
                              Note: "{appt.note}"
                            </p>
                          )}
                        </div>

                        {/* Actions buttons */}
                        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                          {/* Doctor actions on requested appointment */}
                          {isDoctor && appt.status === "requested" && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenScheduleModal(appt)}
                              className="flex items-center gap-1.5"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              <span>Set Practice Time</span>
                            </Button>
                          )}

                          {/* Patient actions on awaiting_payment */}
                          {!isDoctor && appt.status === "awaiting_payment" && !deadlineInfo.isExpired && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex items-center gap-1.5 bg-[#2B7A78] hover:bg-[#17252A]"
                              disabled={
                                pState.status === "creating_order" ||
                                pState.status === "paying" ||
                                pState.status === "verifying"
                              }
                              onClick={() => handlePayConsultationFee(appt)}
                            >
                              {pState.status === "creating_order" ? (
                                <>
                                  <Spinner className="h-3.5 w-3.5" />
                                  <span>Creating Order...</span>
                                </>
                              ) : pState.status === "paying" ? (
                                <>
                                  <Spinner className="h-3.5 w-3.5" />
                                  <span>Opening Checkout...</span>
                                </>
                              ) : pState.status === "verifying" ? (
                                <>
                                  <Spinner className="h-3.5 w-3.5" />
                                  <span>Verifying Signature...</span>
                                </>
                              ) : pState.status === "failed" ? (
                                <>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Retry Payment (₹{feeINR})</span>
                                </>
                              ) : (
                                <>
                                  <CreditCard className="h-3.5 w-3.5" />
                                  <span>Pay Fee (₹{feeINR})</span>
                                </>
                              )}
                            </Button>
                          )}

                          {/* Join session when paid or in_progress */}
                          {["paid", "in_progress"].includes(appt.status) && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex items-center gap-1.5"
                              onClick={() =>
                                alert(
                                  "Real-time consultation room (chat, audio, video) connects in Step 24."
                                )
                              }
                            >
                              <span>Join Session Room</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Cancel button */}
                          {["requested", "awaiting_payment", "paid"].includes(appt.status) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenCancelModal(appt)}
                              className="text-red-600 hover:text-red-700 hover:border-red-300"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Doctor Set Schedule Modal */}
        <Dialog
          open={Boolean(schedulingAppt)}
          onClose={() => setSchedulingAppt(null)}
          title="Schedule Patient Consultation"
        >
          {schedulingAppt && (
            <form onSubmit={handleConfirmSchedule} className="space-y-4 text-xs">
              <p className="text-[#17252A]/80">
                Propose a consultation time for <strong>{schedulingAppt.patient?.name}</strong>. The time must fall within your configured weekly practice hours.
              </p>

              {scheduleError && (
                <Alert variant="error">
                  <AlertCircle className="h-4 w-4" />
                  <span>{scheduleError}</span>
                </Alert>
              )}

              <FormField label="Consultation Date" htmlFor="schedule-date" required>
                <Input
                  id="schedule-date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Start Time (24h)" htmlFor="schedule-time" required>
                <Input
                  id="schedule-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Session Duration" htmlFor="schedule-duration" required>
                <Select
                  id="schedule-duration"
                  value={String(scheduleDuration)}
                  onChange={(e) => setScheduleDuration(Number(e.target.value))}
                >
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="45">45 Minutes</option>
                  <option value="60">60 Minutes</option>
                </Select>
              </FormField>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSchedulingAppt(null)}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={scheduleSubmitting}
                >
                  Confirm & Notify Patient
                </Button>
              </div>
            </form>
          )}
        </Dialog>

        {/* Cancellation Reason Modal */}
        <Dialog
          open={Boolean(cancellingAppt)}
          onClose={() => setCancellingAppt(null)}
          title="Cancel Consultation"
        >
          {cancellingAppt && (
            <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
              <p className="text-[#17252A]/80">
                Are you sure you want to cancel this consultation? The reserved slot will be released, and the other party will be notified by email.
              </p>

              {cancelError && (
                <Alert variant="error">
                  <AlertCircle className="h-4 w-4" />
                  <span>{cancelError}</span>
                </Alert>
              )}

              <FormField label="Reason for Cancellation" htmlFor="cancel-reason" required>
                <Textarea
                  id="cancel-reason"
                  rows={3}
                  placeholder="Please state the clinical or scheduling reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                />
              </FormField>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCancellingAppt(null)}
                >
                  Never Mind
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="bg-red-700 hover:bg-red-800"
                  isLoading={cancelSubmitting}
                >
                  Confirm Cancellation
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      </main>
    </div>
  );
}
