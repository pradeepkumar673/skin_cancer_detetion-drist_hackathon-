"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Coins,
  MessageSquare,
  Phone,
  Video,
  ArrowLeft,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";

interface DoctorFeesResponse {
  doctor: {
    isVerified: boolean;
    feesINR: {
      chat: number;
      audio: number;
      video: number;
    };
  };
}

const MIN_FEE_INR = 100;
const MAX_FEE_INR = 5000;

export default function DoctorFeesPage() {
  const { user } = useAuth();
  const [chatFee, setChatFee] = useState<string>("300");
  const [audioFee, setAudioFee] = useState<string>("500");
  const [videoFee, setVideoFee] = useState<string>("800");
  const [isVerified, setIsVerified] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFees() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await apiClient<DoctorFeesResponse>("/doctors/me");
        if (mounted) {
          setIsVerified(res.doctor.isVerified);
          if (res.doctor.feesINR) {
            setChatFee(String(res.doctor.feesINR.chat || 300));
            setAudioFee(String(res.doctor.feesINR.audio || 500));
            setVideoFee(String(res.doctor.feesINR.video || 800));
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load fee configuration");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadFees();

    return () => {
      mounted = false;
    };
  }, []);

  const validateFee = (val: string, label: string): number | null => {
    const num = Number(val);
    if (!Number.isInteger(num)) {
      setError(`${label} fee must be a whole rupee amount without decimals.`);
      return null;
    }
    if (num < MIN_FEE_INR || num > MAX_FEE_INR) {
      setError(`${label} fee must be between ₹${MIN_FEE_INR} and ₹${MAX_FEE_INR}.`);
      return null;
    }
    return num;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const chatNum = validateFee(chatFee, "Chat consultation");
    if (chatNum === null) return;

    const audioNum = validateFee(audioFee, "Audio consultation");
    if (audioNum === null) return;

    const videoNum = validateFee(videoFee, "Video consultation");
    if (videoNum === null) return;

    try {
      setIsSaving(true);
      await apiClient("/doctors/me/fees", {
        method: "PUT",
        body: JSON.stringify({
          chat: chatNum,
          audio: audioNum,
          video: videoNum,
        }),
      });

      setSuccess("Consultation fees updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fees");
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
                Your professional registration is pending verification. Consultation rates cannot be published until verified.
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

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Link
            href="/doctor/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-[#2B7A78] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Practice Dashboard</span>
          </Link>
        </div>

        <div className="pb-6 border-b border-[#17252A]/15">
          <h1 className="text-2xl font-bold tracking-tight text-[#17252A] flex items-center gap-2">
            <Coins className="h-6 w-6 text-[#2B7A78]" />
            <span>Clinical Consultation Rates</span>
          </h1>
          <p className="text-xs text-[#17252A]/70 mt-1">
            Set your consultation fees in Indian Rupees (INR). Fees are displayed transparently to patients prior to booking.
          </p>
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

        <form onSubmit={handleSave} className="space-y-6 mt-6">
          <Card className="border border-[#17252A]/15">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Fee Structure (Whole Rupees)</span>
                <span className="text-[11px] font-mono text-[#2B7A78]">
                  Permitted Range: ₹{MIN_FEE_INR} to ₹{MAX_FEE_INR}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <FormField
                label="Text Chat Consultation Fee (₹ INR)"
                htmlFor="chat-fee"
                required
                hint={`Minimum ₹${MIN_FEE_INR}, Maximum ₹${MAX_FEE_INR}`}
              >
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-[#17252A]/60 font-bold">
                    ₹
                  </span>
                  <Input
                    id="chat-fee"
                    type="number"
                    min={MIN_FEE_INR}
                    max={MAX_FEE_INR}
                    value={chatFee}
                    onChange={(e) => setChatFee(e.target.value)}
                    className="pl-7"
                    required
                  />
                </div>
              </FormField>

              <FormField
                label="Voice Audio Call Fee (₹ INR)"
                htmlFor="audio-fee"
                required
                hint={`Minimum ₹${MIN_FEE_INR}, Maximum ₹${MAX_FEE_INR}`}
              >
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-[#17252A]/60 font-bold">
                    ₹
                  </span>
                  <Input
                    id="audio-fee"
                    type="number"
                    min={MIN_FEE_INR}
                    max={MAX_FEE_INR}
                    value={audioFee}
                    onChange={(e) => setAudioFee(e.target.value)}
                    className="pl-7"
                    required
                  />
                </div>
              </FormField>

              <FormField
                label="Live Video Consultation Fee (₹ INR)"
                htmlFor="video-fee"
                required
                hint={`Minimum ₹${MIN_FEE_INR}, Maximum ₹${MAX_FEE_INR}`}
              >
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-[#17252A]/60 font-bold">
                    ₹
                  </span>
                  <Input
                    id="video-fee"
                    type="number"
                    min={MIN_FEE_INR}
                    max={MAX_FEE_INR}
                    value={videoFee}
                    onChange={(e) => setVideoFee(e.target.value)}
                    className="pl-7"
                    required
                  />
                </div>
              </FormField>

              <div className="p-3 bg-[#DEF2F1]/30 border border-[#17252A]/10 rounded-[4px] text-[11px] text-[#17252A]/80 flex items-start gap-2">
                <Info className="h-4 w-4 text-[#2B7A78] shrink-0 mt-0.5" />
                <span>
                  Fees are processed via Razorpay in Indian Paise and credited according to platform provider settlement schedules. No additional payment surcharges are levied without advance notification.
                </span>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full"
                  isLoading={isSaving}
                >
                  Save Consultation Rates
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
