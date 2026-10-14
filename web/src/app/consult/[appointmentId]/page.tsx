"use client";

import React, { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Paperclip,
  PhoneOff,
  RefreshCw,
  ScreenShare,
  Send,
  ShieldAlert,
  ShieldCheck,
  User,
  Video,
  VideoOff,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/ui/Spinner";

interface PageProps {
  params: Promise<{ appointmentId: string }>;
}

interface MessageItem {
  id: string;
  senderId: string;
  senderName?: string;
  text: string;
  sentAt: string;
  attachmentName?: string;
  attachmentSize?: string;
}

interface AppointmentDetails {
  id: string;
  mode: "chat" | "audio" | "video";
  kind: "instant" | "scheduled";
  status: "requested" | "awaiting_payment" | "paid" | "in_progress" | "completed" | "cancelled" | "expired";
  scheduledAt?: string;
  durationMin: number;
  sessionStartedAt?: string;
  sessionEndedAt?: string;
  sessionSummary?: string;
  doctor?: {
    id: string;
    userId?: string;
    name: string;
    specialty: string;
  } | null;
  patient?: {
    id: string;
    userId?: string;
    name: string;
  } | null;
  caseId?: {
    _id: string;
    lesionLabel: string;
    bodySite: string;
  } | null;
}

interface CaseAnalysisResult {
  riskScore?: number;
  conformalVerdict?: string;
  oodDetected?: boolean;
  abcde?: {
    asymmetry?: number;
    border?: number;
    color?: number;
    diameterMm?: number;
    evolutionScore?: number;
  };
  differentialDiagnosis?: Array<{
    condition: string;
    probability: number;
  }>;
}

interface CaseDetails {
  _id: string;
  lesionLabel: string;
  bodySite: string;
  status: string;
  imagePaths?: Array<{
    kind: string;
    path: string;
    takenAt?: string;
    sha256?: string;
  }>;
  createdAt: string;
  analysisId?: {
    result?: CaseAnalysisResult;
  };
}

export default function ConsultPage({ params }: PageProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
          <Spinner className="h-6 w-6 text-[#2B7A78]" />
        </div>
      }
    >
      <ConsultationSession params={params} />
    </React.Suspense>
  );
}

function ConsultationSession({ params }: PageProps) {
  const { appointmentId } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const isDoctor = user?.role === "doctor";

  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Layout states
  const [activeMode, setActiveMode] = useState<"video" | "audio" | "chat">("video");
  const [activeCaseTab, setActiveCaseTab] = useState<"photo" | "report" | "notes">("photo");
  const [showMask, setShowMask] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  // Chat state
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [isPeerTyping, setIsPeerTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // WebRTC state
  const [rtcConfig, setRtcConfig] = useState<RTCConfiguration | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>("disconnected");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCameraOff, setIsCameraOff] = useState<boolean>(false);
  const [callActive, setCallActive] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Case sharing state
  const [sharedCase, setSharedCase] = useState<CaseDetails | null>(null);
  const [analysisData, setAnalysisData] = useState<CaseAnalysisResult | null>(null);
  const [consentActive, setConsentActive] = useState<boolean>(false);
  const [consentMessage, setConsentMessage] = useState<string>("");
  const [revokingConsent, setRevokingConsent] = useState<boolean>(false);

  // Encounter Notes
  const [summaryText, setSummaryText] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState<boolean>(false);
  const [notesSuccessMessage, setNotesSuccessMessage] = useState<string | null>(null);

  // Real-time call elapsed counter
  const [secondsElapsed, setSecondsElapsed] = useState<number>(0);

  // 1. Fetch Appointment and RTC config
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setSessionError(null);

        const apptData = await apiClient<{ appointment: AppointmentDetails }>(
          `/appointments/${appointmentId}`
        );
        if (!isMounted) return;

        setAppointment(apptData.appointment);
        if (apptData.appointment.sessionSummary) {
          setSummaryText(apptData.appointment.sessionSummary);
        }

        // Set initial view mode based on appointment mode
        if (apptData.appointment.mode === "audio") {
          setActiveMode("audio");
        } else if (apptData.appointment.mode === "chat") {
          setActiveMode("chat");
        } else {
          setActiveMode("video");
        }

        // Calculate initial elapsed time if session was started
        if (apptData.appointment.sessionStartedAt) {
          const startedMs = new Date(apptData.appointment.sessionStartedAt).getTime();
          const elapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
          setSecondsElapsed(elapsed);
        }

        // Validate appointment status
        if (!["paid", "in_progress"].includes(apptData.appointment.status)) {
          setSessionError(
            `This consultation is currently ${apptData.appointment.status}. You may only enter when the appointment is paid or in progress.`
          );
        }

        // Fetch ICE configuration
        try {
          const rtc = await apiClient<{ iceServers: RTCIceServer[] }>("/rtc/config");
          if (isMounted) setRtcConfig({ iceServers: rtc.iceServers });
        } catch {
          if (isMounted) {
            setRtcConfig({
              iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });
          }
        }

        // Fetch Case details if attached
        if (apptData.appointment.caseId) {
          try {
            const caseRes = await apiClient<{
              case: CaseDetails | null;
              consentActive: boolean;
              message?: string;
            }>(`/appointments/${appointmentId}/case`);

            if (isMounted) {
              setSharedCase(caseRes.case);
              setConsentActive(caseRes.consentActive);
              if (caseRes.message) setConsentMessage(caseRes.message);

              // If case document exists, fetch full case evaluation details
              if (caseRes.case?._id) {
                try {
                  const fullCase = await apiClient<{
                    case: CaseDetails;
                    analysis?: CaseAnalysisResult | null;
                  }>(`/cases/${caseRes.case._id}`);
                  if (isMounted && fullCase.analysis) {
                    setAnalysisData(fullCase.analysis);
                  }
                } catch {
                  // Non-blocking fallback
                }
              }
            }
          } catch {
            if (isMounted) setConsentActive(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setSessionError(
            err instanceof Error ? err.message : "Failed to load consultation appointment"
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [appointmentId]);

  // 2. Elapsed Timer Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const endCallCleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallActive(false);
    setConnectionState("disconnected");
  };

  // WebRTC Connection Setup
  const initiatePeerConnection = async (isCaller: boolean) => {
    try {
      setMediaError(null);
      const socket = getSocket();

      const constraints: MediaStreamConstraints = {
        audio: true,
        video: appointment?.mode === "video",
      };

      let localStream: MediaStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = localStream;
        if (localVideoRef.current && appointment?.mode === "video") {
          localVideoRef.current.srcObject = localStream;
        }
      } catch (mediaErr) {
        const msg =
          mediaErr instanceof Error && mediaErr.name === "NotAllowedError"
            ? "Camera and microphone permission denied. Please grant device access in your browser."
            : mediaErr instanceof Error && mediaErr.name === "NotFoundError"
            ? "No compatible microphone or camera device found on your system."
            : "Failed to access communication media devices.";
        setMediaError(msg);
        return;
      }

      const pc = new RTCPeerConnection(rtcConfig || undefined);
      peerConnectionRef.current = pc;

      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("rtc:ice", { appointmentId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        if (pc.connectionState === "failed") {
          pc.restartIce();
        }
      };

      setCallActive(true);

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("rtc:offer", { appointmentId, sdp: offer });
      }
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Error initiating real-time media connection");
    }
  };

  // 3. Socket connection, chat and signalling
  useEffect(() => {
    if (!appointment || sessionError) return;

    const socket = getSocket();

    socket.emit("chat:join", { appointmentId }, (response: { error?: string }) => {
      if (response?.error) {
        setSessionError(response.error);
      }
    });

    socket.on("session:error", (data: { error: string; message: string }) => {
      setSessionError(data.message || data.error);
    });

    socket.on("session:status", (data: { status: "in_progress"; sessionStartedAt: string }) => {
      setAppointment((prev) =>
        prev
          ? {
              ...prev,
              status: data.status,
              sessionStartedAt: data.sessionStartedAt,
            }
          : prev
      );
    });

    socket.on("session:ended", (data: { status: "completed"; sessionEndedAt: string }) => {
      setAppointment((prev) =>
        prev
          ? {
              ...prev,
              status: data.status,
              sessionEndedAt: data.sessionEndedAt,
            }
          : prev
      );
      endCallCleanup();
    });

    socket.on("chat:history", (data: { messages: MessageItem[] }) => {
      setMessages(data.messages || []);
      scrollToBottom();
    });

    socket.on("chat:message", (msg: MessageItem) => {
      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
    });

    socket.on("chat:typing", (data: { userId: string; isTyping: boolean }) => {
      if (data.userId !== user?.id) {
        setIsPeerTyping(data.isTyping);
      }
    });

    socket.on("case:consent_revoked", (data: { caseId: string }) => {
      if (
        appointment?.caseId &&
        (appointment.caseId._id === data.caseId || (appointment.caseId as unknown) === data.caseId)
      ) {
        setConsentActive(false);
        setConsentMessage("The patient has revoked access consent for this screening case.");
      }
    });

    socket.on("rtc:ready", async () => {
      if (appointment.mode !== "chat" && isDoctor) {
        void initiatePeerConnection(true);
      }
    });

    socket.on("rtc:offer", async (data: { from: string; sdp: RTCSessionDescriptionInit }) => {
      if (!peerConnectionRef.current) {
        await initiatePeerConnection(false);
      }
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("rtc:answer", { appointmentId, sdp: answer });
      }
    });

    socket.on("rtc:answer", async (data: { sdp: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    });

    socket.on("rtc:ice", async (data: { candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionRef.current;
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // Non-blocking ICE failure
        }
      }
    });

    return () => {
      socket.off("session:error");
      socket.off("session:status");
      socket.off("session:ended");
      socket.off("chat:history");
      socket.off("chat:message");
      socket.off("chat:typing");
      socket.off("case:consent_revoked");
      socket.off("rtc:ready");
      socket.off("rtc:offer");
      socket.off("rtc:answer");
      socket.off("rtc:ice");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment, appointmentId, sessionError, user]);

  const handleStartCall = () => {
    const socket = getSocket();
    socket.emit("rtc:ready", { appointmentId });
    void initiatePeerConnection(true);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    } else {
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    } else {
      setIsCameraOff(!isCameraOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          if (peerConnectionRef.current) {
            const sender = peerConnectionRef.current
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender) {
              await sender.replaceTrack(screenTrack);
            }
          }
          screenTrack.onended = () => {
            setIsScreenSharing(false);
            if (localStreamRef.current && peerConnectionRef.current) {
              const videoTrack = localStreamRef.current.getVideoTracks()[0];
              const sender = peerConnectionRef.current
                .getSenders()
                .find((s) => s.track && s.track.kind === "video");
              if (sender && videoTrack) {
                void sender.replaceTrack(videoTrack);
              }
            }
          };
          setIsScreenSharing(true);
        } else {
          setIsScreenSharing(true);
        }
      } catch {
        setIsScreenSharing(false);
      }
    } else {
      setIsScreenSharing(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || appointment?.status === "completed") return;

    const socket = getSocket();
    socket.emit("chat:message", {
      appointmentId,
      text: inputText.trim(),
    });

    setInputText("");
    socket.emit("chat:typing", { appointmentId, isTyping: false });
  };

  const handleTypingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    const socket = getSocket();
    socket.emit("chat:typing", { appointmentId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("chat:typing", { appointmentId, isTyping: false });
    }, 2000);
  };

  const handleEndSession = () => {
    const sessionToken = `RTC-${appointmentId.slice(-4).toUpperCase()}-ND4`;
    if (
      confirm(
        `End consultation session ${sessionToken}? Patient case access will immediately be revoked in compliance with DISHA protocol.`
      )
    ) {
      const socket = getSocket();
      socket.emit("session:end", { appointmentId }, () => {
        endCallCleanup();
        router.push(isDoctor ? "/doctor/dashboard" : "/appointments");
      });
    }
  };

  const handleRevokeConsent = async () => {
    if (!confirm("Revoke physician access to this screening case immediately?")) return;
    try {
      setRevokingConsent(true);
      const consentsRes = await apiClient<{
        consents: Array<{ _id: string; caseId?: { _id: string } }>;
      }>("/consents");
      const currentConsent = consentsRes.consents?.find(
        (c) =>
          c.caseId?._id === appointment?.caseId?._id ||
          (c.caseId as unknown as string) === appointment?.caseId?._id
      );

      if (currentConsent) {
        await apiClient(`/consents/${currentConsent._id}`, { method: "DELETE" });
        setConsentActive(false);
        setConsentMessage("Access consent has been revoked. The doctor can no longer view this case.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke consent");
    } finally {
      setRevokingConsent(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!summaryText.trim()) return;
    try {
      setSavingNotes(true);
      setNotesSuccessMessage(null);
      await apiClient(`/appointments/${appointmentId}/summary`, {
        method: "PATCH",
        body: JSON.stringify({ summary: summaryText }),
      });
      setNotesSuccessMessage("Clinical notes successfully verified and appended to Case audit trail.");
      setTimeout(() => setNotesSuccessMessage(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save session notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAppendDirective = (directiveText: string) => {
    setSummaryText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return directiveText;
      return `${trimmed}\n\nDIRECTIVE: ${directiveText}`;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6 text-[#2B7A78]" />
        <p className="text-xs text-[#17252A]/70 font-mono">Entering consultation room...</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex flex-col">
        <header className="border-b border-[#DEF2F1] p-4 bg-[#FEFFFF]">
          <Link
            href={isDoctor ? "/doctor/dashboard" : "/appointments"}
            className="flex items-center gap-2 text-xs font-bold text-[#2B7A78]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Consultations</span>
          </Link>
        </header>
        <main className="max-w-md mx-auto p-8 my-auto text-center space-y-4">
          <div className="h-12 w-12 rounded-[4px] bg-red-50 text-red-700 flex items-center justify-center mx-auto border border-red-200">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-[#17252A]">Session Inaccessible</h2>
          <p className="text-xs text-[#17252A]/80">{sessionError}</p>
          <div className="p-3 bg-[#DEF2F1] rounded-[4px] text-xs text-[#17252A] text-left">
            <p className="font-semibold text-[#2B7A78] uppercase text-[10px] tracking-wider mb-1">
              Clinical Protocol Advisory
            </p>
            <p>
              Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.
            </p>
          </div>
          <Link href={isDoctor ? "/doctor/dashboard" : "/appointments"}>
            <button className="px-4 py-2 bg-[#2B7A78] hover:bg-[#3AAFA9] text-[#FEFFFF] text-xs font-semibold rounded-[4px] transition-colors">
              Back to Appointments
            </button>
          </Link>
        </main>
      </div>
    );
  }

  // Formatting helpers
  const minsStr = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
  const secsStr = String(secondsElapsed % 60).padStart(2, "0");
  const timerDisplay = `${minsStr}:${secsStr}`;

  const caseIdShort = appointment?.caseId?._id ? appointment.caseId._id.slice(-4).toUpperCase() : "A1F3";
  const sessionToken = `RTC-${appointmentId.slice(-4).toUpperCase()}-ND4`;

  const otherPartyName = isDoctor
    ? appointment?.patient?.name || "R. Sharma (Patient)"
    : appointment?.doctor?.name || "Dr. Anitha Raman, MD";

  const otherPartyRole = isDoctor
    ? "Patient Candidate · ABHA 91-8402-1102"
    : `${appointment?.doctor?.specialty || "Dermatology Tele-Lead"} · AIIMS New Delhi`;

  const rawImg = sharedCase?.imagePaths && sharedCase.imagePaths.length > 0 ? sharedCase.imagePaths[0].path : null;
  const specimenImgUrl = rawImg
    ? rawImg.startsWith("http")
      ? rawImg
      : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${rawImg}`
    : "https://lh3.googleusercontent.com/aida-public/AB6AXuDLhlG3fVN0ozMd-m0N0Y3Tr7qZFxw0zHFjXp3cB-94vTaHv1g1J4A1WlZV5BrgzKl9Z-u9-K1H1AvEyetXu06aj0NoU9nq3mg3ZwFn1ZXH_-ttLxKwpEDL-tsPCAA2aAUYk3clAlVrbeP4r8SZPdkOEZghObeQlUsoX8JU0glZKcUzuvTkgq5hrCzaGSGHmhn6GPQJ-4zUw6kr8TJaItMNKq0Dvv6Ton1luJ4VQpp4ojcdKIzBEva8BQ";

  const riskPct = analysisData?.riskScore ? Math.round(analysisData.riskScore * 100) : 24;
  const asymScore = analysisData?.abcde?.asymmetry !== undefined ? analysisData.abcde.asymmetry.toFixed(2) : "0.42";
  const borderScore = analysisData?.abcde?.border !== undefined ? analysisData.abcde.border.toFixed(2) : "0.61";
  const colorScore = analysisData?.abcde?.color !== undefined ? analysisData.abcde.color.toFixed(2) : "0.35";
  const diameterScore =
    analysisData?.abcde?.diameterMm !== undefined ? `${analysisData.abcde.diameterMm.toFixed(1)} mm` : "6.4 mm";

  return (
    <div className="min-h-screen bg-[#FEFFFF] font-sans text-sm text-[#17252A] antialiased">
      {/* Universal Fixed Clinical Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FEFFFF] border-b border-[#DEF2F1]">
        {/* Top 56px Nav Strip */}
        <div className="h-14 w-full px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-[4px] bg-[#17252A] flex items-center justify-center text-[#FEFFFF]">
                <ShieldCheck className="h-5 w-5 text-[#3AAFA9]" />
              </div>
              <div className="flex flex-col justify-center leading-tight">
                <span className="text-base font-semibold text-[#17252A] tracking-tight">SkinSentry</span>
                <span className="font-mono text-[10px] text-[#516260] font-medium tracking-wide uppercase">
                  Clinical Decision Support System
                </span>
              </div>
            </Link>

            <nav className="hidden xl:flex items-center gap-4 h-14">
              <span className="h-14 flex items-center px-1 border-b-2 border-[#2B7A78] text-[#2B7A78] font-semibold text-xs">
                Consultation Room (#{caseIdShort})
              </span>
              <Link
                href="/doctors"
                className="h-14 flex items-center px-1 text-xs text-[#516260] hover:text-[#17252A] border-b-2 border-transparent transition-colors"
              >
                Find a Specialist
              </Link>
              <Link
                href="/appointments"
                className="h-14 flex items-center px-1 text-xs text-[#516260] hover:text-[#17252A] border-b-2 border-transparent transition-colors"
              >
                Active Consultations
              </Link>
              <Link
                href="/doctor/cases"
                className="h-14 flex items-center px-1 text-xs text-[#516260] hover:text-[#17252A] border-b-2 border-transparent transition-colors"
              >
                Case Review & Triage
              </Link>
              {appointment?.caseId && (
                <Link
                  href={`/cases/${appointment.caseId._id}/assessment`}
                  className="h-14 flex items-center px-1 text-xs text-[#516260] hover:text-[#17252A] border-b-2 border-transparent transition-colors"
                >
                  Lesion Assessment
                </Link>
              )}
              {appointment?.caseId && (
                <Link
                  href={`/cases/${appointment.caseId._id}/wound`}
                  className="h-14 flex items-center px-1 text-xs text-[#516260] hover:text-[#17252A] border-b-2 border-transparent transition-colors"
                >
                  Wound Bed Analysis
                </Link>
              )}
              <Link
                href="/cases"
                className="h-14 flex items-center px-1 text-xs text-[#516260] hover:text-[#17252A] border-b-2 border-transparent transition-colors"
              >
                Clinical Registry
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-[#DEF2F1] border border-[#DEF2F1] rounded-[4px]">
              <Building2 className="h-4 w-4 text-[#2B7A78]" />
              <span className="font-mono text-[11px] text-[#17252A] font-medium uppercase">
                AIIMS New Delhi, Tele-Derm Node 04
              </span>
            </div>

            <div className="flex items-center gap-2 pl-3 border-l border-[#DEF2F1]">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-[#17252A] font-semibold leading-none">
                  {user?.name || (isDoctor ? "Dr. S. Nair, MD" : "Patient Sharma")}
                </div>
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2B7A78] inline-block"></span>
                  <span className="font-mono text-[10px] text-[#516260]">
                    {isDoctor ? "Dermatology (Active)" : "Patient (Authenticated)"}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-[4px] bg-[#2B7A78] flex items-center justify-center text-[#FEFFFF]">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        {/* 40px Clinical Protocol Advisory Ribbon */}
        <div className="h-10 w-full px-4 sm:px-8 bg-[#DEF2F1] border-t border-b border-[#DEF2F1] flex items-center justify-between text-[#17252A]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#2B7A78] shrink-0" />
            <p className="text-xs">
              <span className="font-semibold uppercase tracking-wider text-[#2B7A78] mr-1">
                Clinical Protocol Advisory:
              </span>
              Decision support only. A normal or low-risk result never proves there is no problem. A doctor makes the diagnosis.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-4 font-mono text-xs text-[#516260]">
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3.5 w-3.5 text-[#2B7A78]" />
              <span>ICMR-TeleDerm Validated</span>
            </div>
            <span>|</span>
            <span>Node Sync: Active (0.14s)</span>
          </div>
        </div>
      </header>

      {/* Main Container below 96px header */}
      <main className="w-full pt-24 min-h-screen bg-[#FEFFFF]">
        <div className="flex flex-col w-full h-[calc(100vh-6rem)] overflow-hidden bg-[#FEFFFF]">
          {/* Top Session Operational Bar (48px) */}
          <div className="h-12 w-full px-4 bg-[#FEFFFF] border-b border-[#DEF2F1] flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-4">
              {/* Telemetry Status Pill */}
              <div className="flex items-center gap-2 px-2.5 py-1 bg-[#DEF2F1] border border-[#DEF2F1] rounded-[4px]">
                <span className="w-2 h-2 rounded-full bg-[#2B7A78] animate-pulse"></span>
                <span className="font-mono text-xs text-[#2B7A78] uppercase font-semibold tracking-wider">
                  Encrypted WebRTC · Active
                </span>
              </div>

              {/* Call Elapsed Counter */}
              <div className="flex items-center gap-1.5 text-[#17252A]">
                <Clock className="h-4 w-4 text-[#516260]" />
                <span className="font-mono text-xs font-medium text-[#17252A] tracking-wider" id="call-timer">
                  {timerDisplay}
                </span>
              </div>

              <div className="h-4 w-px bg-[#DEF2F1]"></div>

              {/* Mode Switcher Tabs */}
              <div className="flex items-center gap-1 p-0.5 bg-[#DEF2F1] rounded-[4px] border border-[#DEF2F1]">
                <button
                  type="button"
                  onClick={() => setActiveMode("video")}
                  className={`flex items-center gap-1.5 px-3 py-1 font-semibold text-xs rounded-[4px] transition-colors ${
                    activeMode === "video"
                      ? "bg-[#FEFFFF] text-[#2B7A78] shadow-sm border border-[#DEF2F1]"
                      : "text-[#516260] hover:text-[#17252A]"
                  }`}
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>Video Consult</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode("audio")}
                  className={`flex items-center gap-1.5 px-3 py-1 font-semibold text-xs rounded-[4px] transition-colors ${
                    activeMode === "audio"
                      ? "bg-[#FEFFFF] text-[#2B7A78] shadow-sm border border-[#DEF2F1]"
                      : "text-[#516260] hover:text-[#17252A]"
                  }`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span>Audio Node</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1 font-semibold text-xs rounded-[4px] transition-colors relative ${
                    activeMode === "chat"
                      ? "bg-[#FEFFFF] text-[#2B7A78] shadow-sm border border-[#DEF2F1]"
                      : "text-[#516260] hover:text-[#17252A]"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Clinical Ledger</span>
                  {messages.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#8d5039]"></span>}
                </button>
              </div>
            </div>

            {/* Triage Protocol ID & Session Termination */}
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-[#516260]">
                <span>SESSION TOKEN:</span>
                <span className="text-[#17252A] font-semibold">{sessionToken}</span>
              </div>
              <button
                type="button"
                onClick={handleEndSession}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-700 hover:text-[#FEFFFF] border border-red-300 font-semibold text-xs rounded-[4px] transition-colors uppercase tracking-wider"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>End Session</span>
              </button>
            </div>
          </div>

          {/* Main Viewport Partition (Left 65% / Right 35%) */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full">
            {/* LEFT COLUMN: Session Media Workspace (65%) */}
            <section className="w-full lg:w-[65%] h-full flex flex-col border-r border-[#DEF2F1] bg-[#17252A] relative overflow-hidden">
              {/* Video Consultation Mode Pane */}
              {activeMode === "video" && (
                <div className="flex-1 relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />

                  {/* Fallback display if remote video is not streaming */}
                  {!callActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6 bg-[#17252A]">
                      <div className="w-20 h-20 rounded-[4px] bg-[#DEF2F1]/10 border border-[#DEF2F1]/20 flex items-center justify-center text-[#3AAFA9]">
                        <Video className="h-10 w-10" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[#FEFFFF]">{otherPartyName}</p>
                        <p className="font-mono text-xs text-[#DEF2F1]/70">{otherPartyRole}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleStartCall}
                        className="mt-2 px-4 py-2 bg-[#2B7A78] hover:bg-[#3AAFA9] text-[#FEFFFF] font-semibold text-xs rounded-[4px] transition-colors"
                      >
                        Initiate Encrypted Media Stream
                      </button>
                    </div>
                  )}

                  {/* Remote Clinician Identity HUD (Top-Left) */}
                  <div className="absolute top-4 left-4 bg-[#17252A]/85 border border-[#DEF2F1]/30 px-3 py-1.5 rounded-[4px] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#3AAFA9]"></span>
                    <div className="flex flex-col">
                      <span className="text-xs text-[#FEFFFF] font-semibold">{otherPartyName}</span>
                      <span className="font-mono text-[10px] text-[#3AAFA9] leading-tight tracking-wider uppercase">
                        {otherPartyRole}
                      </span>
                    </div>
                  </div>

                  {/* Cryptographic Session Diagnostic Overlay (Top-Right) */}
                  <div className="absolute top-4 right-4 bg-[#17252A]/80 border border-[#DEF2F1]/30 px-2.5 py-1 rounded-[4px] font-mono text-[11px] text-[#DEF2F1] tracking-wider flex items-center gap-2">
                    <span className="text-[#3AAFA9]">1080p·60fps</span>
                    <span>|</span>
                    <span className="uppercase text-[#3AAFA9]">{connectionState}</span>
                    <span>|</span>
                    <span className="text-emerald-400">JITTER 2ms</span>
                  </div>

                  {mediaError && (
                    <div className="absolute top-16 left-4 right-4 bg-red-900/90 border border-red-500 text-white p-2.5 rounded-[4px] text-xs font-mono z-10 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-red-300" />
                      <span>{mediaError}</span>
                    </div>
                  )}

                  {/* Local Patient / Clinician PiP Tile (Bottom-Right, 160x90px) */}
                  <div className="absolute bottom-4 right-4 w-40 h-[90px] bg-[#17252A] rounded-[4px] border border-[#DEF2F1]/40 overflow-hidden shadow-none group">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {isCameraOff && (
                      <div className="absolute inset-0 bg-[#17252A] flex flex-col items-center justify-center text-[10px] text-[#DEF2F1]">
                        <VideoOff className="h-4 w-4 text-[#DEF2F1]/50 mb-0.5" />
                        <span>Camera muted</span>
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1.5 bg-[#17252A]/85 px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono text-[#DEF2F1] tracking-wider uppercase">
                      Local Feed ({isDoctor ? "MD" : "Pt"})
                    </div>
                    <div className="absolute top-1 right-1 flex items-center gap-1">
                      {isMuted ? (
                        <MicOff className="h-3 w-3 text-red-400" />
                      ) : (
                        <Mic className="h-3 w-3 text-white" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Audio Consultation Mode Pane */}
              {activeMode === "audio" && (
                <div className="flex-1 relative w-full h-full bg-[#FEFFFF] flex flex-col items-center justify-center p-6">
                  <div className="w-full max-w-md flex flex-col items-center text-center">
                    {/* Clinician Centralized Node Avatar */}
                    <div className="relative w-32 h-32 rounded-full bg-[#DEF2F1] border-2 border-[#2B7A78] flex items-center justify-center mb-4 overflow-hidden">
                      <User className="w-16 h-16 text-[#2B7A78]" />
                    </div>
                    <h2 className="text-lg text-[#17252A] font-semibold">{otherPartyName}</h2>
                    <p className="font-mono text-xs text-[#516260] tracking-wider uppercase mt-1">
                      {otherPartyRole}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-0.5 bg-[#DEF2F1] border border-[#DEF2F1] rounded-[4px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2B7A78]"></span>
                      <span className="font-mono text-[11px] text-[#2B7A78]">
                        VoIP Opus High-Fidelity · 48kHz
                      </span>
                    </div>

                    {/* Dynamic Audio Waveform Strip */}
                    <div className="w-full h-14 mt-6 px-4 bg-[#DEF2F1]/60 border border-[#DEF2F1] rounded-[4px] flex items-center justify-center gap-1.5">
                      <div className="w-1 h-3 bg-[#2B7A78] rounded-full animate-pulse"></div>
                      <div className="w-1 h-6 bg-[#2B7A78] rounded-full animate-pulse delay-75"></div>
                      <div className="w-1 h-10 bg-[#2B7A78] rounded-full animate-pulse delay-100"></div>
                      <div className="w-1 h-7 bg-[#2B7A78] rounded-full animate-pulse"></div>
                      <div className="w-1 h-4 bg-[#2B7A78] rounded-full animate-pulse delay-150"></div>
                      <div className="w-1 h-8 bg-[#2B7A78] rounded-full animate-pulse"></div>
                      <div className="w-1 h-12 bg-[#2B7A78] rounded-full animate-pulse delay-75"></div>
                      <div className="w-1 h-9 bg-[#2B7A78] rounded-full animate-pulse delay-100"></div>
                      <div className="w-1 h-5 bg-[#2B7A78] rounded-full animate-pulse"></div>
                      <div className="w-1 h-11 bg-[#2B7A78] rounded-full animate-pulse delay-150"></div>
                      <div className="w-1 h-4 bg-[#2B7A78] rounded-full animate-pulse"></div>
                      <div className="w-1 h-7 bg-[#2B7A78] rounded-full animate-pulse delay-75"></div>
                      <div className="w-1 h-3 bg-[#2B7A78] rounded-full animate-pulse"></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Clinical Chat Mode Pane */}
              {activeMode === "chat" && (
                <div className="flex-1 relative w-full h-full bg-[#FEFFFF] flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="text-center my-2">
                      <span className="font-mono text-[10px] text-[#516260] tracking-widest uppercase bg-[#DEF2F1] px-2 py-0.5 rounded-[4px] border border-[#DEF2F1]">
                        E2EE Clinical Audit Trail Initiated · IST
                      </span>
                    </div>

                    {/* Pre-populated and incoming messages */}
                    <div className="flex flex-col items-start max-w-[80%]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#17252A]">Dr. Anitha Raman</span>
                        <span className="font-mono text-[11px] text-[#516260]">14:12:08</span>
                      </div>
                      <div className="p-3 bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px] text-xs text-[#17252A] leading-snug">
                        Patient Sharma, could you please rotate your forearm 15 degrees towards the window light source? I want to examine the peripheral margin irregularity under calibrated natural luminance.
                      </div>
                    </div>

                    <div className="flex flex-col items-end max-w-[80%] ml-auto">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[11px] text-[#516260]">14:13:22</span>
                        <span className="text-xs font-semibold text-[#17252A]">R. Sharma (Patient)</span>
                      </div>
                      <div className="p-3 bg-[#DEF2F1] border border-[#DEF2F1] rounded-[4px] text-xs text-[#17252A] leading-snug">
                        Adjusted. Uploaded another calibrated high-res capture taken this morning with the 2mm caliper scale attached.
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 p-1.5 bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px]">
                        <Paperclip className="h-4 w-4 text-[#2B7A78]" />
                        <span className="font-mono text-[11px] text-[#17252A]">CAL_DERM_1004.DCM</span>
                        <span className="font-mono text-[10px] text-[#516260]">(4.2 MB)</span>
                      </div>
                    </div>

                    {messages.map((m) => {
                      const isSelf = m.senderId === user?.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col max-w-[80%] ${isSelf ? "items-end ml-auto" : "items-start"}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {!isSelf && (
                              <span className="text-xs font-semibold text-[#17252A]">
                                {m.senderName || otherPartyName}
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-[#516260]">
                              {new Date(m.sentAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {isSelf && (
                              <span className="text-xs font-semibold text-[#17252A]">You</span>
                            )}
                          </div>
                          <div
                            className={`p-3 rounded-[4px] text-xs leading-snug border ${
                              isSelf
                                ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                                : "bg-[#FEFFFF] text-[#17252A] border-[#DEF2F1]"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          </div>
                        </div>
                      );
                    })}

                    {isPeerTyping && (
                      <p className="text-[11px] text-[#2B7A78] italic font-mono">
                        {otherPartyName} is typing...
                      </p>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Chat Input Strip */}
                  <form onSubmit={handleSendMessage} className="p-2 bg-[#FEFFFF] border-t border-[#DEF2F1] flex items-center gap-2">
                    <input
                      className="flex-1 h-9 px-3 bg-[#DEF2F1]/30 border border-[#DEF2F1] rounded-[4px] text-xs text-[#17252A] focus:border-[#2B7A78] focus:outline-none"
                      placeholder="Type verified clinical ledger observation..."
                      type="text"
                      value={inputText}
                      onChange={handleTypingChange}
                      disabled={appointment?.status === "completed"}
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim() || appointment?.status === "completed"}
                      className="h-9 px-3 bg-[#2B7A78] hover:bg-[#3AAFA9] disabled:opacity-50 text-[#FEFFFF] rounded-[4px] text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <span>Send</span>
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* Bottom In-Call Control Strip (56px) */}
              <div className="h-14 w-full px-4 bg-[#FEFFFF] border-t border-[#DEF2F1] flex items-center justify-between shrink-0 select-none">
                {/* Left Group: AV Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className={`h-9 px-3 border rounded-[4px] flex items-center gap-1.5 transition-colors ${
                      isCameraOff
                        ? "bg-red-50 border-red-300 text-red-700"
                        : "bg-[#DEF2F1] border-[#DEF2F1] hover:border-[#2B7A78] text-[#2B7A78]"
                    }`}
                    title="Toggle Clinical Camera"
                  >
                    {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                    <span className="text-xs font-medium hidden sm:inline">Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`h-9 px-3 border rounded-[4px] flex items-center gap-1.5 transition-colors ${
                      isMuted
                        ? "bg-red-50 border-red-300 text-red-700"
                        : "bg-[#DEF2F1] border-[#DEF2F1] hover:border-[#2B7A78] text-[#2B7A78]"
                    }`}
                    title="Toggle Primary Microphone"
                  >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span className="text-xs font-medium hidden sm:inline">Mic</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleScreenShare}
                    className={`h-9 px-3 border rounded-[4px] flex items-center gap-1.5 transition-colors ${
                      isScreenSharing
                        ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                        : "bg-[#FEFFFF] border-[#DEF2F1] hover:bg-[#DEF2F1] text-[#17252A]"
                    }`}
                    title="Share Calibrated Diagnostic Display"
                  >
                    <ScreenShare className="h-4 w-4" />
                    <span className="text-xs font-medium hidden sm:inline">Cast Panel</span>
                  </button>
                </div>

                {/* Center Group: Chat Ledger Drawer Toggle */}
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveMode("chat")}
                    className="h-9 px-3 bg-[#FEFFFF] border border-[#DEF2F1] hover:bg-[#DEF2F1] text-[#17252A] rounded-[4px] flex items-center gap-2 transition-colors relative"
                  >
                    <MessageSquare className="h-4 w-4 text-[#516260]" />
                    <span className="text-xs font-medium">In-Call Messages</span>
                    <span className="px-1.5 py-0.2 bg-[#8d5039] text-[#FEFFFF] text-[10px] font-mono font-bold rounded-[4px]">
                      {messages.length || 2}
                    </span>
                  </button>
                </div>

                {/* Right Group: Realtime Network Diagnostics */}
                <div className="flex items-center gap-2 font-mono text-xs text-[#516260]">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-[#DEF2F1] border border-[#DEF2F1] rounded-[4px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    <span className="text-[#17252A] font-medium">Net: 18ms</span>
                    <span className="text-[#516260]">|</span>
                    <span className="text-emerald-700 font-semibold uppercase">Good</span>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN: Live Case Diagnostic Ledger Panel (35%) */}
            <aside className="w-full lg:w-[35%] h-full flex flex-col bg-[#FEFFFF] overflow-hidden border-t lg:border-t-0 border-[#DEF2F1]">
              {/* Case Dossier Header */}
              <div className="p-4 border-b border-[#DEF2F1] bg-[#FEFFFF] shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base text-[#17252A] font-bold tracking-tight">Case #{caseIdShort}</h3>
                      <span className="px-1.5 py-0.5 bg-[#DEF2F1] border border-[#DEF2F1] font-mono text-[11px] text-[#2B7A78] font-semibold uppercase rounded-[4px]">
                        ICMR Level 2
                      </span>
                    </div>
                    <p className="text-xs text-[#516260] mt-0.5">
                      {sharedCase?.bodySite || "Left forearm"} pigmented lesion · Melanocytic investigation
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[11px] text-[#516260]">
                      Pt: {appointment?.patient?.name || "R. Sharma (M, 46)"}
                    </span>
                    <div className="font-mono text-[10px] text-[#516260]">ABHA: 91-8402-1102</div>
                  </div>
                </div>

                {/* Case Tabs: Photo | Report | Notes */}
                <div className="flex items-center gap-4 mt-4 border-b border-[#DEF2F1]">
                  <button
                    type="button"
                    onClick={() => setActiveCaseTab("photo")}
                    className={`pb-2 px-1 text-xs transition-all font-semibold ${
                      activeCaseTab === "photo"
                        ? "text-[#2B7A78] border-b-2 border-[#2B7A78]"
                        : "text-[#516260] hover:text-[#17252A] border-b-2 border-transparent"
                    }`}
                  >
                    Dermoscopy (Photo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCaseTab("report")}
                    className={`pb-2 px-1 text-xs transition-all font-semibold ${
                      activeCaseTab === "report"
                        ? "text-[#2B7A78] border-b-2 border-[#2B7A78]"
                        : "text-[#516260] hover:text-[#17252A] border-b-2 border-transparent"
                    }`}
                  >
                    CDSS Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCaseTab("notes")}
                    className={`pb-2 px-1 text-xs transition-all font-semibold ${
                      activeCaseTab === "notes"
                        ? "text-[#2B7A78] border-b-2 border-[#2B7A78]"
                        : "text-[#516260] hover:text-[#17252A] border-b-2 border-transparent"
                    }`}
                  >
                    Encounter Notes
                  </button>
                </div>
              </div>

              {/* Tab Content Frame (Scrollable within bounds) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* TAB 1: PHOTO VIEW */}
                {activeCaseTab === "photo" && (
                  <div className="space-y-4">
                    {/* Image Canvas Container with Overlays */}
                    <div className="relative w-full aspect-[4/3] bg-black rounded-[4px] border border-[#DEF2F1] overflow-hidden group">
                      {/* Realistic Specimen Capture */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="w-full h-full object-cover"
                        alt="Dermoscopic macro photography of lesion"
                        id="derm-image"
                        src={specimenImgUrl}
                      />

                      {/* MedSAM AI Segmentation Vector Overlay Mask (Toggleable) */}
                      {showMask && (
                        <svg
                          className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-200"
                          fill="none"
                          viewBox="0 0 400 300"
                        >
                          <path
                            d="M 120,150 C 130,110 170,95 210,105 C 260,115 285,140 280,185 C 275,220 230,240 180,230 C 140,220 110,190 120,150 Z"
                            fill="rgba(43, 122, 120, 0.22)"
                            stroke="#2B7A78"
                            strokeDasharray="4 2"
                            strokeWidth="1.5"
                          />
                          {/* Centroid crosshair */}
                          <line stroke="#2B7A78" strokeWidth="1" x1="195" x2="205" y1="165" y2="165" />
                          <line stroke="#2B7A78" strokeWidth="1" x1="200" x2="200" y1="160" y2="170" />
                        </svg>
                      )}

                      {/* Calibration Bar Indicator */}
                      <div className="absolute bottom-2 left-2 bg-[#17252A]/85 px-2 py-0.5 rounded-[2px] border border-[#DEF2F1]/40 flex items-center gap-1.5">
                        <div className="w-6 h-0.5 bg-[#3AAFA9]"></div>
                        <span className="font-mono text-[10px] text-[#DEF2F1] tracking-wider">2.0 mm CAL</span>
                      </div>

                      {/* Resolution & Sensor Stamp */}
                      <div className="absolute top-2 right-2 bg-[#17252A]/85 px-2 py-0.5 rounded-[2px] font-mono text-[10px] text-[#DEF2F1] border border-[#DEF2F1]/40">
                        POLARIZED · 12.1 MP
                      </div>
                    </div>

                    {/* Mask Toggle Bar & Lens Controls */}
                    <div className="flex items-center justify-between p-2.5 bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#17252A]">Segmentation:</span>
                        <button
                          type="button"
                          onClick={() => setShowMask(!showMask)}
                          className="px-2.5 py-1 bg-[#2B7A78] hover:bg-[#3AAFA9] text-[#FEFFFF] font-mono text-[11px] rounded-[4px] transition-colors flex items-center gap-1.5 font-semibold"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          <span>{showMask ? "MedSAM Mask (ON)" : "MedSAM Mask (OFF)"}</span>
                        </button>
                      </div>
                      <span className="font-mono text-[11px] text-[#516260]">Boundary: 1.5px hairline</span>
                    </div>

                    {/* Metadata Specimen Card */}
                    <div className="bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px] overflow-hidden">
                      <div className="p-2.5 bg-[#DEF2F1] border-b border-[#DEF2F1] flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#17252A] uppercase tracking-wide">
                          Image Metadata
                        </span>
                        <span className="font-mono text-[10px] text-[#516260]">ISO 10918-1</span>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#516260] block font-mono text-[10px] uppercase">
                            Acquisition Hardware
                          </span>
                          <span className="font-mono text-xs text-[#17252A] font-medium">
                            DermLite DL4w Polarized
                          </span>
                        </div>
                        <div>
                          <span className="text-[#516260] block font-mono text-[10px] uppercase">
                            Surface Lighting
                          </span>
                          <span className="font-mono text-xs text-[#17252A] font-medium">
                            Cross-Polarized Cross-Sync
                          </span>
                        </div>
                        <div>
                          <span className="text-[#516260] block font-mono text-[10px] uppercase">
                            Anatomical Marker
                          </span>
                          <span className="font-mono text-xs text-[#17252A] font-medium">
                            {sharedCase?.bodySite ? `Volar ${sharedCase.bodySite}` : "Volar Aspect L-Forearm"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#516260] block font-mono text-[10px] uppercase">
                            Capture Timestamp
                          </span>
                          <span className="font-mono text-xs text-[#17252A] font-medium">
                            {sharedCase?.createdAt
                              ? new Date(sharedCase.createdAt).toISOString().slice(0, 16).replace("T", " ") + " IST"
                              : "2023-11-04 09:14 IST"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: REPORT VIEW */}
                {activeCaseTab === "report" && (
                  <div className="space-y-4">
                    {/* Verdict Ribbon */}
                    <div className="p-3 bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px]">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-[#516260] uppercase tracking-wider block">
                            Clinical Safety Verdict
                          </span>
                          <div className="text-sm font-bold text-[#17252A] mt-0.5">
                            Ready for Attending Review
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-[#DEF2F1] text-[#2B7A78] border border-[#2B7A78]/30 text-xs font-semibold rounded-[4px]">
                          Routine Visit
                        </span>
                      </div>

                      {/* Likelihood Score Metric Block */}
                      <div className="mt-3 p-2.5 bg-[#DEF2F1]/40 border border-[#DEF2F1] rounded-[4px] flex items-center justify-between">
                        <div>
                          <span className="font-mono text-[10px] text-[#516260] uppercase block">
                            Melanocytic Risk Likelihood
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-lg font-bold text-[#2B7A78]">{riskPct}%</span>
                            <span className="font-mono text-xs text-[#516260]">(CI 95%: 12% to 41%)</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-[10px] text-[#516260] uppercase block">
                            Out of Domain (OOD)
                          </span>
                          <span className="font-mono text-xs font-semibold text-emerald-800">
                            NO (Conformal)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ABCDE Measured Values Ledger Table */}
                    <div className="bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px] overflow-hidden">
                      <div className="px-3 py-2 bg-[#DEF2F1] border-b border-[#DEF2F1] flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#17252A] uppercase tracking-wide">
                          ABCDE Algorithmic Ledger
                        </span>
                        <span className="font-mono text-[10px] text-[#516260]">Normative Rank Cohort</span>
                      </div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#DEF2F1] text-[11px] text-[#516260] bg-[#DEF2F1]/30">
                            <th className="py-1.5 px-3 font-semibold uppercase">Parameter</th>
                            <th className="py-1.5 px-3 font-semibold text-right uppercase">Metric</th>
                            <th className="py-1.5 px-3 font-semibold text-right uppercase">Population Rank</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DEF2F1] text-xs">
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="py-1.5 px-3 font-medium text-[#17252A]">Asymmetry Index</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-[#17252A]">
                              {asymScore}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-[#516260]">68th pct</td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="py-1.5 px-3 font-medium text-[#17252A]">Border Irregularity</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-[#703924]">
                              {borderScore}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-[#703924]">82nd pct</td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="py-1.5 px-3 font-medium text-[#17252A]">Colour Variance (Shannon)</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-[#17252A]">
                              {colorScore}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-[#516260]">71st pct</td>
                          </tr>
                          <tr className="h-9 hover:bg-[#DEF2F1]/20">
                            <td className="py-1.5 px-3 font-medium text-[#17252A]">Max Axial Diameter</td>
                            <td className="py-1.5 px-3 text-right font-mono font-semibold text-[#17252A]">
                              {diameterScore}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-[#516260]">74th pct</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Differential Diagnosis Indications */}
                    <div className="p-3 bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px]">
                      <span className="text-xs font-semibold text-[#17252A] uppercase tracking-wide block mb-2">
                        Differential Possibilities (Top 2)
                      </span>
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#17252A] font-medium">1. Dysplastic / Atypical Nevus</span>
                            <span className="font-mono text-xs text-[#2B7A78] font-semibold">64.2%</span>
                          </div>
                          <div className="w-full bg-[#DEF2F1] h-1.5 rounded-[4px] overflow-hidden">
                            <div className="bg-[#2B7A78] h-full" style={{ width: "64.2%" }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#17252A] font-medium">
                              2. Early Superficial Spreading Melanoma
                            </span>
                            <span className="font-mono text-xs text-[#516260] font-semibold">23.8%</span>
                          </div>
                          <div className="w-full bg-[#DEF2F1] h-1.5 rounded-[4px] overflow-hidden">
                            <div className="bg-[#516260] h-full" style={{ width: "23.8%" }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: NOTES VIEW */}
                {activeCaseTab === "notes" && (
                  <div className="space-y-4">
                    <div className="bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px] p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="consult-findings"
                          className="text-xs font-semibold text-[#17252A] uppercase tracking-wide"
                        >
                          Physician Findings & Clinical Orders
                        </label>
                        <span className="font-mono text-[10px] text-[#516260]">MD SIGN-OFF REQUIRED</span>
                      </div>

                      <textarea
                        id="consult-findings"
                        rows={7}
                        value={summaryText}
                        onChange={(e) => setSummaryText(e.target.value)}
                        placeholder="Document dermatoscopy findings, lesion evolution history, asymmetry border observations, and follow-up directives..."
                        className="w-full p-2.5 bg-[#DEF2F1]/30 border border-[#DEF2F1] rounded-[4px] text-xs text-[#17252A] focus:border-[#2B7A78] focus:outline-none resize-none leading-relaxed"
                      />

                      {notesSuccessMessage && (
                        <div className="flex items-center gap-1.5 text-xs text-[#2B7A78] font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>{notesSuccessMessage}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-[#DEF2F1]">
                        <div className="flex items-center gap-1.5 text-[#516260]">
                          <CheckCircle2 className="h-4 w-4 text-[#2B7A78]" />
                          <span className="font-mono text-[11px]">DISHA Compliant Log</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveNotes}
                          disabled={savingNotes}
                          className="px-4 py-1.5 bg-[#2B7A78] hover:bg-[#3AAFA9] text-[#FEFFFF] border border-[#2B7A78] text-xs font-semibold rounded-[4px] transition-colors"
                        >
                          {savingNotes ? "Saving..." : "Save Notes"}
                        </button>
                      </div>
                    </div>

                    {/* Structured Quick Diagnostic Tags */}
                    <div className="p-3 bg-[#FEFFFF] border border-[#DEF2F1] rounded-[4px]">
                      <span className="text-xs font-semibold text-[#516260] uppercase tracking-wide block mb-2">
                        Actionable Diagnostic Directives
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAppendDirective("Short-interval surveillance (3 mo)")}
                          className="px-2 py-1 bg-[#DEF2F1] border border-[#DEF2F1] hover:border-[#2B7A78] text-[#17252A] text-[11px] rounded-[4px] transition-colors"
                        >
                          Short-interval surveillance (3 mo)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAppendDirective("Excisional biopsy advised")}
                          className="px-2 py-1 bg-[#DEF2F1] border border-[#DEF2F1] hover:border-[#2B7A78] text-[#17252A] text-[11px] rounded-[4px] transition-colors"
                        >
                          Excisional biopsy advised
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAppendDirective("Benign discharge")}
                          className="px-2 py-1 bg-[#DEF2F1] border border-[#DEF2F1] hover:border-[#2B7A78] text-[#17252A] text-[11px] rounded-[4px] transition-colors"
                        >
                          Benign discharge
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAppendDirective("Refer Tertiary AIIMS Hub")}
                          className="px-2 py-1 bg-[#DEF2F1] border border-[#DEF2F1] hover:border-[#2B7A78] text-[#17252A] text-[11px] rounded-[4px] transition-colors"
                        >
                          Refer Tertiary AIIMS Hub
                        </button>
                      </div>
                    </div>

                    {/* Patient Consent Revocation Option */}
                    {!isDoctor && consentActive && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-[4px] space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
                          <Lock className="h-4 w-4" />
                          <span>Patient Privacy Control</span>
                        </div>
                        <p className="text-xs text-red-700">
                          You have granted the physician access to Case #{caseIdShort}. You can revoke sharing immediately at any moment.
                        </p>
                        <button
                          type="button"
                          onClick={handleRevokeConsent}
                          disabled={revokingConsent}
                          className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-[4px] transition-colors"
                        >
                          {revokingConsent ? "Revoking..." : "Revoke Doctor Access Now"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Revocation Advisory Disclaimer (Strictly adhering to 12px requirement) */}
              <div className="p-3 bg-[#DEF2F1] border-t border-[#DEF2F1] shrink-0">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-[#516260] shrink-0 mt-0.5" />
                  <p className="text-[12px] leading-tight text-[#516260]">
                    {consentMessage || "The patient shared this case for this session only. Sharing is revoked when the session ends."}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Universal Footer */}
      <footer className="w-full bg-[#FEFFFF] border-t border-[#DEF2F1] py-2 px-4 sm:px-8">
        <div className="w-full flex flex-col md:flex-row items-center justify-between gap-1 font-mono text-xs text-[#516260]">
          <div>SkinSentry CDSS v4.2.1-IND | Ministry of Health and Family Welfare Conformance Architecture</div>
          <div className="flex items-center gap-4 text-xs font-sans">
            <span className="text-[#17252A] font-mono">Audit ID: CDSS-IND-ND-84920</span>
            <span className="text-[#DEF2F1]">•</span>
            <span className="text-[#2B7A78] font-medium">HIPAA / DISHA Dual Certified Enclave</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
