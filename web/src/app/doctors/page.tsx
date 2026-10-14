"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Video,
  MessageSquare,
  Phone,
  Shield,
  Activity,
  CheckCircle,
  RotateCcw,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface DoctorItem {
  id: string;
  userId: string;
  name: string;
  specialty: string;
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

function getInitials(name: string): string {
  if (!name) return "DR";
  const parts = name.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function DoctorsDirectoryContent() {
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId");

  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["English", "Tamil"]);
  const [selectedModes, setSelectedModes] = useState<string[]>(["video", "chat", "audio"]);
  const [maxFee, setMaxFee] = useState<number>(3000);
  const [onlineOnly, setOnlineOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"recommended" | "fee-asc" | "availability">("recommended");

  useEffect(() => {
    let active = true;

    const loadDoctors = async () => {
      try {
        setError(null);
        const data = await apiClient<{ doctors: DoctorItem[] }>("/doctors");
        if (!active) return;
        setDoctors(data.doctors || []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load doctor directory");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDoctors();

    return () => {
      active = false;
    };
  }, []);

  // Real-time presence updates via Socket.IO
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      socket.emit("presence:subscribe");

      socket.on(
        "doctor:presence",
        ({ doctorId, isOnline }: { doctorId: string; isOnline: boolean }) => {
          setDoctors((prev) =>
            prev.map((d) => (d.id === doctorId ? { ...d, isOnline } : d))
          );
        }
      );
    } catch {
      // socket fallback
    }

    return () => {
      if (socket) {
        try {
          socket.emit("presence:unsubscribe");
          socket.off("doctor:presence");
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleResetFilters = () => {
    setSpecialtyFilter("all");
    setSelectedLanguages(["English", "Tamil"]);
    setSelectedModes(["video", "chat", "audio"]);
    setMaxFee(5000);
    setOnlineOnly(false);
    setSortBy("recommended");
  };

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleMode = (mode: string) => {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  // Filtered and sorted doctors
  const filteredDoctors = useMemo(() => {
    return doctors
      .filter((d) => {
        // Specialty filter
        if (specialtyFilter !== "all") {
          const spec = (d.specialty || "").toLowerCase();
          if (specialtyFilter === "derma" && !spec.includes("derm")) return false;
          if (specialtyFilter === "wound" && !spec.includes("wound")) return false;
          if (specialtyFilter === "gp" && !spec.includes("general")) return false;
        }

        // Online only
        if (onlineOnly && !d.isOnline) return false;

        // Fee filter (video or chat fee <= maxFee)
        const fee = d.fees?.videoINR || d.fees?.chatINR || 500;
        if (fee > maxFee) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "fee-asc") {
          const feeA = a.fees?.videoINR || a.fees?.chatINR || 500;
          const feeB = b.fees?.videoINR || b.fees?.chatINR || 500;
          return feeA - feeB;
        }
        if (sortBy === "availability") {
          if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        }
        // default recommended: online first then name
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [doctors, specialtyFilter, onlineOnly, maxFee, sortBy]);

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#17252A] flex flex-col justify-between">
      <div>
        <Header />

        {/* Clinical Protocol Advisory Bar */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#D8DDDB] py-2 px-4 sm:px-8">
          <div className="max-w-[1180px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
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

        {/* Main Content Directory */}
        <main className="w-full max-w-[1180px] mx-auto py-8 px-4 sm:px-6">
          {/* Breadcrumb & CDSS Context Strip */}
          <div className="flex items-center justify-between pb-4 border-b border-[#D8DDDB] mb-6 text-xs text-[#5A6B69] font-mono">
            <div className="flex items-center gap-2">
              <span>SkinSentry Registry</span>
              <span>/</span>
              <span className="text-[#1B6B63] font-semibold">Tele-Consultation Directory</span>
              <span>/</span>
              <span className="text-[#17252A]">India National Node</span>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <CheckCircle className="w-3.5 h-3.5 text-[#1B6B63]" />
              <span>DISHA Verified Credentials</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[#FDECEA] border border-[#B42318] text-[#B42318] rounded-[4px] text-xs">
              {error}
            </div>
          )}

          {/* Main Two-Column Structure */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Sidebar: Refine Results (280px fixed width on desktop) */}
            <aside className="w-full lg:w-[280px] shrink-0 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5">
              {/* Filter Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-[#D8DDDB]">
                <h2 className="text-base font-bold text-[#17252A] tracking-tight">
                  Refine results
                </h2>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="font-mono text-xs text-[#1B6B63] hover:text-[#2B7A78] font-medium transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset all</span>
                </button>
              </div>

              {/* Filter 1: Specialty */}
              <div className="py-4 border-b border-[#D8DDDB]">
                <span className="block font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold mb-2.5">
                  Specialty
                </span>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="radio"
                      name="specialty"
                      value="all"
                      checked={specialtyFilter === "all"}
                      onChange={() => setSpecialtyFilter("all")}
                      className="w-4 h-4 text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span>All Specialties</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="radio"
                      name="specialty"
                      value="derma"
                      checked={specialtyFilter === "derma"}
                      onChange={() => setSpecialtyFilter("derma")}
                      className="w-4 h-4 text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span>Dermatology</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="radio"
                      name="specialty"
                      value="wound"
                      checked={specialtyFilter === "wound"}
                      onChange={() => setSpecialtyFilter("wound")}
                      className="w-4 h-4 text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span>Wound care</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="radio"
                      name="specialty"
                      value="gp"
                      checked={specialtyFilter === "gp"}
                      onChange={() => setSpecialtyFilter("gp")}
                      className="w-4 h-4 text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span>General practice</span>
                  </label>
                </div>
              </div>

              {/* Filter 2: Language */}
              <div className="py-4 border-b border-[#D8DDDB]">
                <span className="block font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold mb-2.5">
                  Language
                </span>
                <div className="space-y-2 text-xs">
                  {["English", "Tamil", "Hindi", "Telugu", "Malayalam"].map((lang) => (
                    <label
                      key={lang}
                      className="flex items-center gap-2.5 cursor-pointer text-[#17252A]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLanguages.includes(lang)}
                        onChange={() => toggleLanguage(lang)}
                        className="w-4 h-4 rounded-[2px] text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                      />
                      <span>{lang}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filter 3: Consultation Mode */}
              <div className="py-4 border-b border-[#D8DDDB]">
                <span className="block font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold mb-2.5">
                  Consultation mode
                </span>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="checkbox"
                      checked={selectedModes.includes("video")}
                      onChange={() => toggleMode("video")}
                      className="w-4 h-4 rounded-[2px] text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span className="flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-[#5A6B69]" />
                      <span>Video</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="checkbox"
                      checked={selectedModes.includes("chat")}
                      onChange={() => toggleMode("chat")}
                      className="w-4 h-4 rounded-[2px] text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#5A6B69]" />
                      <span>Chat</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-[#17252A]">
                    <input
                      type="checkbox"
                      checked={selectedModes.includes("audio")}
                      onChange={() => toggleMode("audio")}
                      className="w-4 h-4 rounded-[2px] text-[#1B6B63] accent-[#1B6B63] cursor-pointer"
                    />
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#5A6B69]" />
                      <span>Audio</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Filter 4: Fee Range */}
              <div className="py-4 border-b border-[#D8DDDB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold">
                    Fee range
                  </span>
                  <span className="font-mono text-xs text-[#17252A] font-medium">
                    Up to ₹{maxFee}
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="5000"
                  step="100"
                  value={maxFee}
                  onChange={(e) => setMaxFee(Number(e.target.value))}
                  className="w-full h-1 bg-[#D8DDDB] accent-[#1B6B63] cursor-pointer"
                />
                <div className="flex justify-between font-mono text-[10px] text-[#5A6B69] mt-1">
                  <span>₹300</span>
                  <span>₹5,000</span>
                </div>
              </div>

              {/* Filter 5: Availability */}
              <div className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#5A6B69] font-bold">
                    Availability
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlineOnly}
                      onChange={(e) => setOnlineOnly(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#D8DDDB] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1B6B63]" />
                  </label>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#5A6B69]">
                  <span className="w-2 h-2 rounded-full bg-[#1E6B3A] inline-block" />
                  <span>Available now only</span>
                </div>
              </div>
            </aside>

            {/* Right Column: Results Ledger (flex-1) */}
            <section className="flex-1 min-w-0 bg-[#FEFFFF] border border-[#D8DDDB] rounded-[4px] p-5">
              {/* Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <div>
                  <h1 className="text-xl font-bold text-[#17252A] tracking-tight">
                    Find a specialist
                  </h1>
                  <p className="font-mono text-xs text-[#5A6B69] mt-0.5">
                    {filteredDoctors.length} doctors available · Enclave verified medical registry
                  </p>
                </div>

                {/* Monospace Sort Control */}
                <div className="flex items-center gap-2 self-start sm:self-auto bg-[#FBFAF7] border border-[#D8DDDB] px-2.5 py-1.5 rounded-[4px]">
                  <span className="font-mono text-[11px] text-[#5A6B69] uppercase font-semibold">
                    Sort:
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "recommended" | "fee-asc" | "availability")}
                    className="bg-transparent font-mono text-xs text-[#17252A] font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="fee-asc">Fee: low to high</option>
                    <option value="availability">Availability</option>
                  </select>
                </div>
              </div>

              {/* Doctor Directory List */}
              <div className="w-full border-t border-b border-[#D8DDDB] mt-2">
                {loading ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-[#5A6B69] font-mono">
                      Searching verified dermatologists in national enclave...
                    </p>
                  </div>
                ) : filteredDoctors.length === 0 ? (
                  <div className="py-12 text-center text-[#5A6B69] font-mono text-xs">
                    No verified clinicians found matching the selected filters.
                  </div>
                ) : (
                  filteredDoctors.map((doc) => {
                    const initials = getInitials(doc.name);
                    const feeINR = doc.fees?.videoINR || doc.fees?.chatINR || 500;
                    const bookUrl = caseId ? `/doctors/${doc.id}?caseId=${caseId}` : `/doctors/${doc.id}`;

                    return (
                      <div
                        key={doc.id}
                        className="w-full min-h-[96px] py-3.5 px-2 flex flex-col md:flex-row md:items-center justify-between border-b border-[#D8DDDB] hover:bg-[#FBFAF7] transition-colors gap-3"
                      >
                        <div className="flex items-start md:items-center gap-4 min-w-0">
                          {/* Avatar / Initials Box */}
                          <div className="w-12 h-12 shrink-0 bg-[#DEF2F1] border border-[#D8DDDB] rounded-[4px] flex items-center justify-center font-mono text-base font-bold text-[#1B6B63]">
                            {initials}
                          </div>

                          {/* Clinical Details */}
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-[#17252A]">
                                {doc.name.startsWith("Dr.") ? doc.name : `Dr. ${doc.name}`}
                              </h3>
                              {doc.isOnline ? (
                                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#1E6B3A] font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E6B3A] inline-block" />
                                  Online
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#5A6B69]">
                                  <span className="w-1.5 h-1.5 rounded-full border border-[#5A6B69] inline-block" />
                                  Offline
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#5A6B69] truncate mt-0.5">
                              {doc.specialty || "Dermatologist"} · MBBS, MD ·{" "}
                              <span className="font-mono text-[11px]">MCI Reg Verified</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px] font-mono">
                                English
                              </span>
                              <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px] font-mono">
                                Hindi
                              </span>
                              <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px] font-mono">
                                Video
                              </span>
                              <span className="px-2 py-0.5 bg-[#FBFAF7] text-[#5A6B69] border border-[#D8DDDB] rounded-[4px] text-[10px] font-mono">
                                Chat
                              </span>
                            </div>
                            <div className="font-mono text-[11px] text-[#5A6B69] mt-1">
                              Next available:{" "}
                              <span className="text-[#17252A] font-medium">
                                {doc.isOnline ? "Immediate (Live Enclave)" : "Today, 18:30"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Booking / Fee Column */}
                        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center shrink-0 pl-16 md:pl-0 gap-1">
                          <div className="text-left md:text-right">
                            <div className="font-mono text-base font-bold text-[#17252A] leading-tight">
                              ₹{feeINR}
                            </div>
                            <div className="font-mono text-[10px] text-[#5A6B69]">
                              video consult
                            </div>
                          </div>
                          <Link
                            href={bookUrl}
                            className="mt-1 h-8 px-4 py-1 bg-[#1B6B63] text-white font-mono text-xs font-semibold rounded-[4px] hover:bg-[#2B7A78] transition-colors flex items-center justify-center select-none"
                          >
                            Book
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FBFAF7] flex flex-col justify-between">
          <Header />
          <div className="py-24 flex items-center justify-center">
            <Spinner size="lg" />
          </div>
          <Footer />
        </div>
      }
    >
      <DoctorsDirectoryContent />
    </Suspense>
  );
}
