"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Stethoscope,
  Radio,
  CircleOff,
  Filter,
  MessageSquare,
  Phone,
  Video,
  AlertCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";

interface DoctorCardData {
  id: string;
  userId: string;
  name: string;
  specialty: "dermatologist" | "wound_care" | "diabetologist" | "general";
  bio: string;
  isOnline: boolean;
  presenceMode: "auto" | "offline";
  lastSeenAt?: string;
  fees: {
    chat: number;
    audio: number;
    video: number;
    chatINR: number;
    audioINR: number;
    videoINR: number;
  };
}

const SPECIALTY_LABELS: Record<string, string> = {
  all: "All Specialties",
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

export default function DoctorsDirectoryPage() {
  const [doctors, setDoctors] = useState<DoctorCardData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [onlineOnly, setOnlineOnly] = useState<boolean>(false);

  // Fetch doctors list
  useEffect(() => {
    let mounted = true;

    async function loadDoctors() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await apiClient<{ doctors: DoctorCardData[] }>("/doctors");
        if (mounted) {
          setDoctors(data.doctors || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load doctor directory");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadDoctors();

    return () => {
      mounted = false;
    };
  }, []);

  // Real-time presence updates via Socket.IO
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();

      const handlePresence = (evt: { doctorId: string; isOnline: boolean }) => {
        setDoctors((prev) =>
          prev.map((doc) => {
            if (doc.id === evt.doctorId) {
              return { ...doc, isOnline: evt.isOnline };
            }
            return doc;
          })
        );
      };

      socket.emit("presence:subscribe");
      socket.on("doctor:presence", handlePresence);

      return () => {
        if (socket) {
          socket.emit("presence:unsubscribe");
          socket.off("doctor:presence", handlePresence);
        }
      };
    } catch {
      // Sockets not available in offline/static modes
    }
  }, []);

  // Filtered and sorted doctors
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      if (specialtyFilter !== "all" && doc.specialty !== specialtyFilter) {
        return false;
      }
      if (onlineOnly && !doc.isOnline) {
        return false;
      }
      return true;
    });
  }, [doctors, specialtyFilter, onlineOnly]);

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A]">
      <PermanentDisclaimer />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#17252A]/15">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#17252A] flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-[#2B7A78]" />
              <span>Verified Clinical Specialists</span>
            </h1>
            <p className="text-xs text-[#17252A]/70 mt-1">
              Connect with verified dermatologists and wound care physicians. Real-time availability is monitored live.
            </p>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#17252A]">
              <Filter className="h-3.5 w-3.5 text-[#2B7A78]" />
              <span>Filter:</span>
            </div>

            <Select
              id="specialty-filter"
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="text-xs w-48 py-1.5"
            >
              <option value="all">All Specialties</option>
              <option value="dermatologist">Dermatologist</option>
              <option value="wound_care">Wound Care Specialist</option>
              <option value="diabetologist">Diabetologist</option>
              <option value="general">General Physician</option>
            </Select>

            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none bg-[#DEF2F1]/30 border border-[#17252A]/15 px-3 py-1.5 rounded-[4px]">
              <input
                type="checkbox"
                checked={onlineOnly}
                onChange={(e) => setOnlineOnly(e.target.checked)}
                className="rounded-[2px] border-[#17252A]/30 text-[#2B7A78] focus:ring-[#2B7A78]"
              />
              <span>Online Only</span>
            </label>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <Alert variant="error" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </Alert>
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-xs text-[#17252A]/70">
            <Spinner size="lg" />
            <span>Loading medical specialist directory...</span>
          </div>
        )}

        {/* Doctors Grid */}
        {!isLoading && !error && (
          <div className="mt-6">
            {filteredDoctors.length === 0 ? (
              <Card className="border-dashed border-[#17252A]/20 bg-[#DEF2F1]/10">
                <CardContent className="py-16 text-center">
                  <Stethoscope className="h-10 w-10 text-[#2B7A78]/50 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-[#17252A]">No Doctors Found</h3>
                  <p className="text-xs text-[#17252A]/70 mt-1 max-w-sm mx-auto">
                    {onlineOnly
                      ? "No verified doctors in this specialty are currently online. Uncheck the online filter to view all physicians and book a scheduled consultation."
                      : "No verified physicians currently match the selected criteria."}
                  </p>
                  {(specialtyFilter !== "all" || onlineOnly) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSpecialtyFilter("all");
                        setOnlineOnly(false);
                      }}
                      className="mt-4"
                    >
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredDoctors.map((doc) => (
                  <Card
                    key={doc.id}
                    className="border border-[#17252A]/15 bg-[#FEFFFF] flex flex-col justify-between hover:border-[#2B7A78]/50 transition-colors duration-150"
                  >
                    <CardContent className="p-5 space-y-4">
                      {/* Top Header: Initials + Status Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {/* Square Initials Block (no stock photos per project rules) */}
                          <div className="w-12 h-12 rounded-[4px] border border-[#2B7A78]/30 bg-[#DEF2F1] text-[#17252A] flex items-center justify-center font-bold text-base tracking-wider shrink-0">
                            {getInitials(doc.name)}
                          </div>
                          <div>
                            <h2 className="text-base font-bold text-[#17252A] leading-tight">
                              {doc.name}
                            </h2>
                            <span className="inline-block text-[11px] font-semibold text-[#2B7A78] uppercase tracking-wide mt-0.5">
                              {SPECIALTY_LABELS[doc.specialty] || doc.specialty}
                            </span>
                          </div>
                        </div>

                        {/* Live Online Status Badge (never color alone) */}
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-xs font-semibold select-none border ${
                            doc.isOnline
                              ? "bg-[#DEF2F1] text-[#2B7A78] border-[#2B7A78]/40"
                              : "bg-[#17252A]/5 text-[#17252A]/60 border-[#17252A]/15"
                          }`}
                        >
                          {doc.isOnline ? (
                            <>
                              <Radio className="h-3.5 w-3.5 text-[#2B7A78]" />
                              <span>Online</span>
                            </>
                          ) : (
                            <>
                              <CircleOff className="h-3.5 w-3.5 text-[#17252A]/50" />
                              <span>Offline</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Bio Excerpt */}
                      <p className="text-xs text-[#17252A]/75 line-clamp-3 leading-relaxed">
                        {doc.bio || "No professional biography provided."}
                      </p>

                      {/* Consultation Fees Table */}
                      <div className="border-t border-[#17252A]/10 pt-3">
                        <span className="text-[10px] uppercase font-bold text-[#17252A]/60 tracking-wider block mb-2">
                          Standard Consultation Rates
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="border border-[#17252A]/10 rounded-[4px] p-2 bg-[#DEF2F1]/20">
                            <MessageSquare className="h-3.5 w-3.5 text-[#2B7A78] mx-auto mb-1" />
                            <span className="block text-[10px] text-[#17252A]/70">Chat</span>
                            <span className="text-xs font-bold text-[#17252A]">
                              ₹{doc.fees.chatINR}
                            </span>
                          </div>
                          <div className="border border-[#17252A]/10 rounded-[4px] p-2 bg-[#DEF2F1]/20">
                            <Phone className="h-3.5 w-3.5 text-[#2B7A78] mx-auto mb-1" />
                            <span className="block text-[10px] text-[#17252A]/70">Audio</span>
                            <span className="text-xs font-bold text-[#17252A]">
                              ₹{doc.fees.audioINR}
                            </span>
                          </div>
                          <div className="border border-[#17252A]/10 rounded-[4px] p-2 bg-[#DEF2F1]/20">
                            <Video className="h-3.5 w-3.5 text-[#2B7A78] mx-auto mb-1" />
                            <span className="block text-[10px] text-[#17252A]/70">Video</span>
                            <span className="text-xs font-bold text-[#17252A]">
                              ₹{doc.fees.videoINR}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="pt-2">
                        <Link href={`/doctors/${doc.id}`} className="block">
                          <Button variant="primary" size="sm" className="w-full">
                            View Profile & Schedule
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
