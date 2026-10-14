"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  ArrowLeft,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";

interface AvailabilityRange {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

interface DoctorAvailabilityResponse {
  doctor: {
    isVerified: boolean;
    weekly: AvailabilityRange[];
    exceptions: string[];
    timezone: string;
    registrationNumber?: string;
  };
}

const WEEKDAYS = [
  { index: 1, name: "Monday" },
  { index: 2, name: "Tuesday" },
  { index: 3, name: "Wednesday" },
  { index: 4, name: "Thursday" },
  { index: 5, name: "Friday" },
  { index: 6, name: "Saturday" },
  { index: 0, name: "Sunday" },
];

export default function DoctorAvailabilityPage() {
  const { user } = useAuth();
  const [weeklyRanges, setWeeklyRanges] = useState<AvailabilityRange[]>([]);
  const [exceptions, setExceptions] = useState<string[]>([]);
  const [timezone, setTimezone] = useState<string>("Asia/Kolkata");
  const [isVerified, setIsVerified] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New exception date input
  const [newExceptionDate, setNewExceptionDate] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function loadAvailability() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await apiClient<DoctorAvailabilityResponse>("/doctors/me");
        if (mounted) {
          setIsVerified(res.doctor.isVerified);
          setWeeklyRanges(res.doctor.weekly || []);
          setExceptions(res.doctor.exceptions || []);
          setTimezone(res.doctor.timezone || "Asia/Kolkata");
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load schedule");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  const addRange = (weekday: number) => {
    setWeeklyRanges((prev) => [
      ...prev,
      {
        weekday,
        startTime: "09:00",
        endTime: "13:00",
      },
    ]);
  };

  const removeRange = (index: number) => {
    setWeeklyRanges((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRange = (
    index: number,
    field: "startTime" | "endTime",
    value: string
  ) => {
    setWeeklyRanges((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const addException = () => {
    if (!newExceptionDate) return;
    if (exceptions.includes(newExceptionDate)) {
      setError("This exception date is already added.");
      return;
    }
    setExceptions((prev) => [...prev, newExceptionDate].sort());
    setNewExceptionDate("");
    setError(null);
  };

  const removeException = (dateStr: string) => {
    setExceptions((prev) => prev.filter((d) => d !== dateStr));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate ranges: end > start and no overlaps on same weekday
    for (let i = 0; i < weeklyRanges.length; i++) {
      const r = weeklyRanges[i];
      if (r.startTime >= r.endTime) {
        setError(`End time must be after start time on ${WEEKDAYS.find((w) => w.index === r.weekday)?.name || "weekday"}.`);
        return;
      }
    }

    // Check overlaps
    for (const wd of [0, 1, 2, 3, 4, 5, 6]) {
      const dayRanges = weeklyRanges
        .filter((r) => r.weekday === wd)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      for (let j = 0; j < dayRanges.length - 1; j++) {
        if (dayRanges[j].endTime > dayRanges[j + 1].startTime) {
          setError(
            `Overlapping time ranges on ${WEEKDAYS.find((w) => w.index === wd)?.name}: ${dayRanges[j].startTime}-${dayRanges[j].endTime} overlaps with ${dayRanges[j + 1].startTime}-${dayRanges[j + 1].endTime}.`
          );
          return;
        }
      }
    }

    try {
      setIsSaving(true);
      await apiClient("/doctors/me/availability", {
        method: "PUT",
        body: JSON.stringify({
          weekly: weeklyRanges.map((r) => ({
            weekday: r.weekday,
            startTime: r.startTime,
            endTime: r.endTime,
          })),
          exceptions,
          timezone,
        }),
      });

      setSuccess("Weekly availability schedule and exception dates updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update availability");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isVerified || user?.verificationStatus === "pending") {
    return (
      <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
        <PermanentDisclaimer />

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <Card className="border border-[#17252A]/20 bg-[#FEFFFF]">
            <CardHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-[4px] bg-[#DEF2F1] text-[#2B7A78] flex items-center justify-center mx-auto mb-3">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold text-[#17252A]">
                Awaiting Credential Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-[#17252A]/80 leading-relaxed text-center max-w-lg mx-auto">
              <p>
                Your medical registration is pending verification. Public availability cannot be published until verified.
              </p>
              <Link href="/doctor/dashboard">
                <Button variant="secondary" size="sm">
                  Return to Practice Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
      <PermanentDisclaimer />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Link
            href="/doctor/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-[#2B7A78] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Practice Dashboard</span>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#17252A]/15">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17252A] flex items-center gap-2">
              <Calendar className="h-6 w-6 text-[#2B7A78]" />
              <span>Weekly Availability & Exceptions</span>
            </h1>
            <p className="text-xs text-[#17252A]/70 mt-1">
              Configure your weekly appointment schedule. Time slots are generated strictly within these bounds (Timezone: {timezone}).
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
          >
            Save Schedule Changes
          </Button>
        </div>

        {error && (
          <Alert variant="error" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </Alert>
        )}

        {success && (
          <Alert variant="info" className="mt-6">
            <CheckCircle2 className="h-4 w-4" />
            <span>{success}</span>
          </Alert>
        )}

        <form onSubmit={handleSave} className="space-y-8 mt-6">
          {/* Weekly Editor */}
          <Card className="border border-[#17252A]/15">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#2B7A78]" />
                <span>Recurring Weekly Practice Hours</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 divide-y divide-[#17252A]/10">
              {WEEKDAYS.map((day) => {
                const dayRanges = weeklyRanges.filter((r) => r.weekday === day.index);
                return (
                  <div key={day.index} className="py-4 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#17252A] w-28">{day.name}</span>
                        <span className="text-[11px] text-[#17252A]/60">
                          {dayRanges.length === 0 ? "Off (No appointments)" : `${dayRanges.length} practice block(s)`}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addRange(day.index)}
                        className="flex items-center gap-1 text-[11px] py-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Time Block</span>
                      </Button>
                    </div>

                    {dayRanges.length > 0 && (
                      <div className="space-y-2 pl-2">
                        {weeklyRanges.map((range, rangeIndex) => {
                          if (range.weekday !== day.index) return null;
                          return (
                            <div
                              key={rangeIndex}
                              className="flex items-center gap-3 bg-[#DEF2F1]/20 p-2 border border-[#17252A]/10 rounded-[4px] text-xs max-w-md"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-[#17252A]/70">From:</span>
                                <Input
                                  type="time"
                                  value={range.startTime}
                                  onChange={(e) => updateRange(rangeIndex, "startTime", e.target.value)}
                                  className="w-28 py-1 text-xs"
                                  required
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-[#17252A]/70">To:</span>
                                <Input
                                  type="time"
                                  value={range.endTime}
                                  onChange={(e) => updateRange(rangeIndex, "endTime", e.target.value)}
                                  className="w-28 py-1 text-xs"
                                  required
                                />
                              </div>
                              <Button
                                type="button"
                                variant="text"
                                size="sm"
                                onClick={() => removeRange(rangeIndex)}
                                className="text-red-600 hover:text-red-700 p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Exception Dates Manager */}
          <Card className="border border-[#17252A]/15">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#2B7A78]" />
                <span>Exception & Leave Dates</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-xs text-[#17252A]/75">
                Mark specific calendar dates when you will be unavailable for consultations (holidays, personal leave, or clinical duties).
              </p>

              <div className="flex items-center gap-3 max-w-md">
                <Input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={newExceptionDate}
                  onChange={(e) => setNewExceptionDate(e.target.value)}
                  className="text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addException}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Exception</span>
                </Button>
              </div>

              {exceptions.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-[#17252A] block mb-2">
                    Configured Exception Dates:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {exceptions.map((dateStr) => (
                      <div
                        key={dateStr}
                        className="inline-flex items-center gap-2 bg-[#DEF2F1] text-[#17252A] border border-[#2B7A78]/30 px-2.5 py-1 rounded-[4px] text-xs font-mono"
                      >
                        <span>{dateStr}</span>
                        <button
                          type="button"
                          onClick={() => removeException(dateStr)}
                          className="text-[#17252A]/60 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
