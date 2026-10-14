"use client";

import React, { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquare,
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Clock,
  Shield,
  ShieldAlert,
  Send,
  AlertCircle,
  CheckCircle2,
  FileText,
  Stethoscope,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";

interface PageProps {
  params: Promise<{ appointmentId: string }>;
}

interface MessageItem {
  id: string;
  senderId: string;
  text: string;
  sentAt: string;
}

interface AppointmentDetails {
  id: string;
  mode: "chat" | "audio" | "video";
  kind: "instant" | "scheduled";
  status: "paid" | "in_progress" | "completed" | "cancelled" | "expired";
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

interface CaseDetails {
  _id: string;
  lesionLabel: string;
  bodySite: string;
  status: string;
  imagePaths?: Array<{
    kind: string;
    path: string;
    processedPath?: string;
    overlayPath?: string;
  }>;
  createdAt: string;
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
  const { user } = useAuth();

  const isDoctor = user?.role === "doctor";

  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

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
  const [consentActive, setConsentActive] = useState<boolean>(false);
  const [consentMessage, setConsentMessage] = useState<string>("");
  const [revokingConsent, setRevokingConsent] = useState<boolean>(false);

  // Post session summary
  const [summaryText, setSummaryText] = useState<string>("");
  const [summarySubmitting, setSummarySubmitting] = useState<boolean>(false);
  const [summarySuccess, setSummarySuccess] = useState<boolean>(false);

  // Remaining time
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // 1. Fetch Appointment and RTC config
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setSessionError(null);

        const apptData = await apiClient<{ appointment: AppointmentDetails }>(
          `/appointments/${appointmentId}`
        );
        setAppointment(apptData.appointment);
        if (apptData.appointment.sessionSummary) {
          setSummaryText(apptData.appointment.sessionSummary);
        }

        // Check if session can be opened
        if (!["paid", "in_progress"].includes(apptData.appointment.status)) {
          setSessionError(
            `This consultation is currently ${apptData.appointment.status}. You may only enter when the appointment is paid or in progress.`
          );
        }

        // Fetch ICE servers
        try {
          const rtc = await apiClient<{ iceServers: RTCIceServer[] }>("/rtc/config");
          setRtcConfig({ iceServers: rtc.iceServers });
        } catch {
          setRtcConfig({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          });
        }

        // Fetch Case details if attached
        if (apptData.appointment.caseId) {
          try {
            const caseRes = await apiClient<{
              case: CaseDetails | null;
              consentActive: boolean;
              message?: string;
            }>(`/appointments/${appointmentId}/case`);
            setSharedCase(caseRes.case);
            setConsentActive(caseRes.consentActive);
            if (caseRes.message) setConsentMessage(caseRes.message);
          } catch {
            setConsentActive(false);
          }
        }
      } catch (err) {
        setSessionError(
          err instanceof Error ? err.message : "Failed to load consultation appointment"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [appointmentId]);

  // 2. Countdown timer ticker
  useEffect(() => {
    if (!appointment) return;

    function calculateRemaining() {
      const durationMs = (appointment?.durationMin || 15) * 60 * 1000;
      let endMs = 0;

      if (appointment?.sessionStartedAt) {
        endMs = new Date(appointment.sessionStartedAt).getTime() + durationMs;
      } else if (appointment?.scheduledAt) {
        endMs = new Date(appointment.scheduledAt).getTime() + durationMs;
      } else {
        return;
      }

      const diff = Math.floor((endMs - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
    }

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [appointment]);

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

      // Acquire media streams
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

      // Add local tracks to peer connection
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // Handle remote track
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("rtc:ice", { appointmentId, candidate: event.candidate });
        }
      };

      // Track connection state
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

    // Join appointment room
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

    // Case consent revoked event (instant live disappearance)
    socket.on("case:consent_revoked", (data: { caseId: string }) => {
      if (appointment?.caseId && (appointment.caseId._id === data.caseId || appointment.caseId === data.caseId as unknown)) {
        setConsentActive(false);
        setConsentMessage("The patient has revoked access consent for this screening case.");
      }
    });

    // -------------------------------------------------------------------------
    // WebRTC Signalling Handlers
    // -------------------------------------------------------------------------
    socket.on("rtc:ready", async () => {
      if (appointment.mode !== "chat" && isDoctor) {
        // Doctor creates offer upon peer ready
        initiatePeerConnection(true);
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
          // Non-blocking ICE candidate addition failure
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
    initiatePeerConnection(true);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // 5. Send Chat Message
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

  // 6. End Session
  const handleEndSession = () => {
    if (!confirm("Are you sure you want to conclude this consultation session?")) return;
    const socket = getSocket();
    socket.emit("session:end", { appointmentId }, () => {
      endCallCleanup();
    });
  };

  // 7. Revoke Consent (Patient)
  const handleRevokeConsent = async () => {
    if (!confirm("Revoke physician access to this screening case immediately?")) return;
    try {
      setRevokingConsent(true);
      // Fetch active consent
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

  // 8. Doctor Session Summary Submission
  const handleSubmitSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summaryText.trim()) return;

    try {
      setSummarySubmitting(true);
      await apiClient(`/appointments/${appointmentId}/summary`, {
        method: "PATCH",
        body: JSON.stringify({ summary: summaryText }),
      });
      setSummarySuccess(true);
      setTimeout(() => setSummarySuccess(false), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save session summary");
    } finally {
      setSummarySubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6 text-[#2B7A78]" />
        <p className="text-xs text-[#17252A]/70">Entering consultation room...</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex flex-col">
        <header className="border-b border-[#DEF2F1] p-4">
          <Link href="/appointments" className="flex items-center gap-2 text-xs font-bold text-[#2B7A78]">
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
          <PermanentDisclaimer />
          <Link href="/appointments">
            <Button variant="primary" size="sm" className="mt-4">
              Back to Appointments
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const otherPartyName = isDoctor
    ? appointment?.patient?.name || "Patient"
    : appointment?.doctor?.name || "Physician";

  const remainingMins =
    remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : null;
  const remainingSecs =
    remainingSeconds !== null ? remainingSeconds % 60 : null;

  return (
    <div className="min-h-screen bg-[#FEFFFF] flex flex-col">
      {/* Top Session Header */}
      <header className="border-b border-[#DEF2F1] bg-[#FEFFFF] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/appointments"
              className="p-1.5 rounded-[4px] hover:bg-[#DEF2F1] text-[#17252A]/80 transition-colors"
              title="Return to appointments list"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#17252A]">{otherPartyName}</span>
              {isDoctor && appointment?.doctor?.specialty && (
                <span className="text-[11px] text-[#2B7A78] uppercase font-semibold">
                  • {appointment.doctor.specialty}
                </span>
              )}
              <div
                className={`px-2 py-0.5 rounded-[4px] text-[10px] font-semibold uppercase border ${
                  appointment?.status === "in_progress"
                    ? "bg-[#2B7A78] text-[#FEFFFF] border-[#2B7A78]"
                    : appointment?.status === "completed"
                    ? "bg-[#17252A]/10 text-[#17252A] border-[#17252A]/20"
                    : "bg-[#DEF2F1] text-[#2B7A78] border-[#2B7A78]/30"
                }`}
              >
                {appointment?.status.replace("_", " ")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Session Timer */}
            {remainingSeconds !== null && appointment?.status !== "completed" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#DEF2F1] border border-[#2B7A78]/30 rounded-[4px] text-xs font-mono text-[#17252A]">
                <Clock className="h-3.5 w-3.5 text-[#2B7A78]" />
                <span>
                  {remainingMins}m {remainingSecs}s
                </span>
              </div>
            )}

            {/* End consultation button */}
            {appointment?.status !== "completed" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEndSession}
                className="text-red-700 hover:bg-red-50 hover:border-red-300 text-xs"
              >
                End Session
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto p-4 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Call + Chat (8 cols on lg) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <PermanentDisclaimer />

          {/* WebRTC Audio / Video Call Panel */}
          {appointment && appointment.mode !== "chat" && (
            <Card className="border border-[#17252A]/15 bg-[#17252A] text-[#FEFFFF] overflow-hidden">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between text-xs border-b border-[#FEFFFF]/10 pb-2">
                  <div className="flex items-center gap-2">
                    {appointment.mode === "video" ? (
                      <Video className="h-4 w-4 text-[#3AAFA9]" />
                    ) : (
                      <Phone className="h-4 w-4 text-[#3AAFA9]" />
                    )}
                    <span className="font-semibold uppercase tracking-wide">
                      {appointment.mode} Consultation Stream
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#DEF2F1]/80">
                    Connection: {connectionState}
                  </span>
                </div>

                {mediaError && (
                  <div className="p-3 bg-red-900/60 border border-red-500 rounded-[4px] text-xs text-red-200 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{mediaError}</span>
                  </div>
                )}

                {/* Video Streams Display */}
                {appointment.mode === "video" && (
                  <div className="relative aspect-video bg-[#17252A]/90 rounded-[4px] overflow-hidden flex items-center justify-center border border-[#FEFFFF]/10">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {!callActive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
                        <VideoOff className="h-8 w-8 text-[#DEF2F1]/40" />
                        <p className="text-xs text-[#DEF2F1]/70">
                          {isDoctor
                            ? "Press Start Call to initiate the secure video connection."
                            : "Waiting for physician to initiate the video stream..."}
                        </p>
                      </div>
                    )}

                    {/* Local picture-in-picture stream */}
                    <div className="absolute bottom-3 right-3 w-32 aspect-video bg-black rounded-[4px] overflow-hidden border border-[#FEFFFF]/30 shadow-sm">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      {isCameraOff && (
                        <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-[10px] text-white">
                          Camera off
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Audio Mode Graphic Panel */}
                {appointment.mode === "audio" && (
                  <div className="py-8 bg-[#17252A]/80 rounded-[4px] border border-[#FEFFFF]/10 flex flex-col items-center justify-center gap-3">
                    <div className="h-16 w-16 rounded-[4px] bg-[#2B7A78] flex items-center justify-center text-[#FEFFFF]">
                      <Phone className="h-7 w-7" />
                    </div>
                    <audio ref={remoteVideoRef} autoPlay />
                    <p className="text-xs text-[#DEF2F1]/80 font-mono">
                      {callActive ? `Audio connected (${connectionState})` : "Audio stream ready"}
                    </p>
                  </div>
                )}

                {/* Call Controls Toolbar */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  {!callActive ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleStartCall}
                      className="bg-[#2B7A78] hover:bg-[#3AAFA9] text-[#FEFFFF] flex items-center gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      <span>Start Call</span>
                    </Button>
                  ) : (
                    <>
                      <button
                        onClick={toggleMute}
                        className={`p-2.5 rounded-[4px] border transition-colors ${
                          isMuted
                            ? "bg-red-600 border-red-700 text-white"
                            : "bg-[#2B7A78] border-[#3AAFA9] text-white hover:bg-[#3AAFA9]"
                        }`}
                        title={isMuted ? "Unmute microphone" : "Mute microphone"}
                      >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </button>

                      {appointment.mode === "video" && (
                        <button
                          onClick={toggleCamera}
                          className={`p-2.5 rounded-[4px] border transition-colors ${
                            isCameraOff
                              ? "bg-red-600 border-red-700 text-white"
                              : "bg-[#2B7A78] border-[#3AAFA9] text-white hover:bg-[#3AAFA9]"
                          }`}
                          title={isCameraOff ? "Turn on camera" : "Turn off camera"}
                        >
                          {isCameraOff ? (
                            <VideoOff className="h-4 w-4" />
                          ) : (
                            <Video className="h-4 w-4" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={endCallCleanup}
                        className="p-2.5 rounded-[4px] bg-red-700 hover:bg-red-800 border border-red-800 text-white transition-colors"
                        title="Disconnect call"
                      >
                        <PhoneOff className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Secure Chat Box */}
          <Card className="border border-[#17252A]/15 bg-[#FEFFFF] flex-1 flex flex-col min-h-[420px]">
            <CardHeader className="border-b border-[#DEF2F1] p-3 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-[#17252A] flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#2B7A78]" />
                <span>Consultation Chat Record</span>
              </CardTitle>
              <span className="text-[11px] text-[#17252A]/60 font-mono">
                Encrypted & Persisted
              </span>
            </CardHeader>

            <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3 overflow-hidden">
              {/* Messages scroll area */}
              <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[380px] pr-2">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-[#17252A]/50 py-8">
                    No messages yet. Say hello to initiate discussion.
                  </p>
                ) : (
                  messages.map((m) => {
                    const isSelf = m.senderId === user?.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[78%] p-2.5 rounded-[4px] text-xs ${
                            isSelf
                              ? "bg-[#2B7A78] text-[#FEFFFF]"
                              : "bg-[#DEF2F1] text-[#17252A] border border-[#17252A]/10"
                          }`}
                        >
                          {/* Plain text safely rendered by React */}
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        </div>
                        <span className="text-[10px] text-[#17252A]/50 font-mono px-1 mt-0.5">
                          {new Date(m.sentAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
                {isPeerTyping && (
                  <p className="text-[11px] text-[#2B7A78] italic">
                    {otherPartyName} is typing...
                  </p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Form */}
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2 border-t border-[#DEF2F1]">
                <Input
                  type="text"
                  placeholder={
                    appointment?.status === "completed"
                      ? "Consultation completed. Chat is closed."
                      : "Type a clinical question or observation..."
                  }
                  value={inputText}
                  onChange={handleTypingChange}
                  disabled={appointment?.status === "completed"}
                  className="text-xs"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!inputText.trim() || appointment?.status === "completed"}
                  className="shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Case Side Panel & Summary (4 cols on lg) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Patient Case View Side Panel */}
          <Card className="border border-[#17252A]/15 bg-[#FEFFFF]">
            <CardHeader className="border-b border-[#DEF2F1] p-3 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-[#17252A] flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[#2B7A78]" />
                <span>Patient Screening Case</span>
              </CardTitle>
              {consentActive && (
                <div className="flex items-center gap-1 text-[10px] text-[#2B7A78] font-bold">
                  <Shield className="h-3 w-3" />
                  <span>Consent Active</span>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              {sharedCase && consentActive ? (
                <div className="space-y-3">
                  <div className="p-2.5 bg-[#DEF2F1]/50 border border-[#2B7A78]/30 rounded-[4px] space-y-1">
                    <p className="font-bold text-[#17252A]">{sharedCase.lesionLabel}</p>
                    <p className="text-[11px] text-[#17252A]/80">
                      <strong>Anatomical Site:</strong> {sharedCase.bodySite}
                    </p>
                    <p className="text-[11px] text-[#17252A]/80">
                      <strong>Uploaded:</strong> {new Date(sharedCase.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Read-only link to full case record */}
                  <Link
                    href={`/cases/${sharedCase._id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-xs text-[#2B7A78] font-bold hover:underline"
                  >
                    <span>Inspect Full Screening Evaluation</span>
                    <ArrowLeft className="h-3 w-3 rotate-180" />
                  </Link>

                  {/* Revoke consent button for patient */}
                  {!isDoctor && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleRevokeConsent}
                      isLoading={revokingConsent}
                      className="w-full text-red-700 hover:bg-red-50 hover:border-red-300 text-xs mt-2"
                    >
                      Revoke Doctor Access Now
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center space-y-2 bg-[#17252A]/5 rounded-[4px] border border-[#17252A]/10">
                  <ShieldAlert className="h-5 w-5 text-[#17252A]/40 mx-auto" />
                  <p className="text-xs text-[#17252A]/80">
                    {consentMessage || "The patient has not shared a screening case for this consultation, or consent has been revoked."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Doctor Post-Session Summary Form */}
          {isDoctor && (
            <Card className="border border-[#17252A]/15 bg-[#FEFFFF]">
              <CardHeader className="border-b border-[#DEF2F1] p-3">
                <CardTitle className="text-xs font-bold text-[#17252A] flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5 text-[#2B7A78]" />
                  <span>Clinical Summary & Findings</span>
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                <form onSubmit={handleSubmitSummary} className="space-y-3">
                  <Textarea
                    rows={4}
                    placeholder="Provide a concise clinical summary for the patient (observations, recommendations, follow-up timeline)..."
                    value={summaryText}
                    onChange={(e) => setSummaryText(e.target.value)}
                    className="text-xs"
                    required
                  />

                  {summarySuccess && (
                    <p className="text-[11px] text-[#2B7A78] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Summary recorded and visible to patient.</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    {sharedCase?._id && (
                      <Link
                        href={`/cases/${sharedCase._id}`}
                        target="_blank"
                        className="text-[11px] text-[#2B7A78] hover:underline font-semibold"
                      >
                        Submit Case Review
                      </Link>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={summarySubmitting}
                      className="ml-auto text-xs"
                    >
                      Save Summary
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Patient View of Doctor Summary */}
          {!isDoctor && appointment?.sessionSummary && (
            <Card className="border border-[#17252A]/15 bg-[#DEF2F1]/30">
              <CardHeader className="border-b border-[#DEF2F1] p-3">
                <CardTitle className="text-xs font-bold text-[#17252A]">
                  Physician Summary & Advice
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-xs text-[#17252A] whitespace-pre-wrap">
                {appointment.sessionSummary}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
