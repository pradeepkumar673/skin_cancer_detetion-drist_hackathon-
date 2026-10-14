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

export default function AppointmentsPage() {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";

  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "requests" | "past">("upcoming");

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
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
      <PermanentDisclaimer />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#17252A]/15">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17252A] flex items-center gap-2">
              <Calendar className="h-6 w-6 text-[#2B7A78]" />
              <span>Consultation Appointments</span>
            </h1>
            <p className="text-xs text-[#17252A]/70 mt-1">
              {isDoctor
                ? "Manage patient consultation requests, schedule availability slots, and track upcoming clinical sessions."
                : "Monitor consultation requests, review confirmed appointment times, and enter scheduled session rooms."}
            </p>
          </div>

          {!isDoctor && (
            <Link href="/doctors">
              <Button variant="primary" size="sm" className="flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4" />
                <span>Find Physicians</span>
              </Button>
            </Link>
          )}
        </div>

        {error && (
          <Alert variant="error" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </Alert>
        )}

        {/* Tab navigation */}
        <div className="flex items-center gap-2 border-b border-[#17252A]/15 mt-6 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("upcoming")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] border transition-colors duration-150 ${
              activeTab === "upcoming"
                ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            Upcoming ({upcomingAppointments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] border transition-colors duration-150 ${
              activeTab === "requests"
                ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            Pending Requests ({requestAppointments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("past")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] border transition-colors duration-150 ${
              activeTab === "past"
                ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            Past & Cancelled ({pastAppointments.length})
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center gap-2 text-xs text-[#17252A]/70">
            <Spinner size="lg" />
            <span>Loading consultations...</span>
          </div>
        )}

        {/* Appointment Cards List */}
        {!isLoading && (
          <div className="mt-6 space-y-4">
            {displayedList.length === 0 ? (
              <Card className="border-dashed border-[#17252A]/20 bg-[#DEF2F1]/10">
                <CardContent className="py-16 text-center">
                  <Calendar className="h-10 w-10 text-[#2B7A78]/40 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-[#17252A]">
                    {activeTab === "upcoming"
                      ? "No Upcoming Consultations"
                      : activeTab === "requests"
                      ? "No Pending Consultation Requests"
                      : "No Past Consultations"}
                  </h3>
                  <p className="text-xs text-[#17252A]/60 mt-1 max-w-sm mx-auto">
                    {isDoctor
                      ? "Consultation bookings and requests submitted by patients will appear in this log."
                      : "You currently have no consultations in this section. Browse verified specialists to schedule a review."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              displayedList.map((appt) => {
                const badgeCfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.requested;
                const otherPartyName = isDoctor
                  ? appt.patient?.name || "Patient"
                  : appt.doctor?.name || "Physician";

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
                          {appt.status === "awaiting_payment" && appt.paymentDeadlineAt && (
                            <div className="p-2 bg-[#DEF2F1] border border-[#2B7A78]/30 rounded-[4px] text-xs text-[#17252A]">
                              <strong>Payment Deadline:</strong> Complete payment before{" "}
                              {new Date(appt.paymentDeadlineAt).toLocaleTimeString()} to secure the slot.
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
                          {!isDoctor && appt.status === "awaiting_payment" && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex items-center gap-1.5"
                              onClick={() =>
                                alert(
                                  "Online payment integration arrives in Step 23. This reservation is confirmed in test mode."
                                )
                              }
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              <span>Pay Consultation Fee</span>
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
                                  "Real-time consultation room (chat, audio, video) activates in Step 24."
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
