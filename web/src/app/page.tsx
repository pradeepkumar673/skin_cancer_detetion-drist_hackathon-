import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ArrowRight, AlertTriangle } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex-1">
        {/* Top Disclaimer Notice */}
        <div className="border-b border-[#17252A]/10 bg-[#DEF2F1]/60 py-2.5">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PermanentDisclaimer />
          </div>
        </div>

        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="space-y-6 lg:col-span-7">
              <h1 className="text-3xl font-bold tracking-tight text-[#17252A] sm:text-4xl leading-tight">
                Check a skin lesion, wound or rash, then talk to a doctor.
              </h1>

              <p className="text-base leading-relaxed text-[#17252A]/85">
                Upload a photo. SkinSentry measures the area, estimates how concerning it looks,
                shows which parts of the image drove the result, and lets you book a chat, audio
                or video consultation with a verified doctor. It supports a doctor&apos;s decision.
                It does not replace one.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link href="/register">
                  <Button variant="primary" size="lg" className="flex items-center gap-2">
                    <span>Start a check</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/how-it-works">
                  <Button variant="secondary" size="lg">
                    How it works
                  </Button>
                </Link>
              </div>
            </div>

            {/* Pipeline Visual: SVG Diagram */}
            <div className="lg:col-span-5">
              <div className="border border-[#17252A]/15 bg-[#DEF2F1]/30 p-5 rounded-[4px]">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#17252A]/70 mb-3 font-mono">
                  Screening Pipeline Architecture
                </div>
                <svg
                  viewBox="0 0 340 380"
                  className="w-full h-auto text-[#17252A]"
                  aria-label="Clinical screening pipeline flow"
                  role="img"
                >
                  {/* Step 1: Photo Input */}
                  <rect x="20" y="10" width="300" height="42" rx="4" fill="#FEFFFF" stroke="#17252A" strokeWidth="1.5" />
                  <text x="170" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="#17252A">1. Patient Photo Upload</text>

                  {/* Down arrow */}
                  <line x1="170" y1="52" x2="170" y2="72" stroke="#2B7A78" strokeWidth="1.5" />
                  <polygon points="166,70 170,78 174,70" fill="#2B7A78" />

                  {/* Step 2: Quality Check */}
                  <rect x="20" y="78" width="300" height="42" rx="4" fill="#DEF2F1" stroke="#2B7A78" strokeWidth="1.5" />
                  <text x="170" y="104" textAnchor="middle" fontSize="13" fontWeight="600" fill="#17252A">2. Nurse Gate (Quality & Skin Check)</text>

                  {/* Down arrow */}
                  <line x1="170" y1="120" x2="170" y2="140" stroke="#2B7A78" strokeWidth="1.5" />
                  <polygon points="166,138 170,146 174,138" fill="#2B7A78" />

                  {/* Step 3: Three Specialist Checks */}
                  <rect x="20" y="146" width="300" height="74" rx="4" fill="#FEFFFF" stroke="#17252A" strokeWidth="1.5" />
                  <text x="170" y="168" textAnchor="middle" fontSize="12" fontWeight="600" fill="#17252A">3. Specialist Decision Modules</text>
                  <text x="170" y="188" textAnchor="middle" fontSize="10" fill="#17252A" opacity="0.8">Cancer Triage | Ulcer Area | Skin Disease</text>
                  <text x="170" y="204" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#2B7A78">Only applicable models report</text>

                  {/* Down arrow */}
                  <line x1="170" y1="220" x2="170" y2="240" stroke="#2B7A78" strokeWidth="1.5" />
                  <polygon points="166,238 170,246 174,238" fill="#2B7A78" />

                  {/* Step 4: Safety Check & Structured Explanation */}
                  <rect x="20" y="246" width="300" height="46" rx="4" fill="#DEF2F1" stroke="#2B7A78" strokeWidth="1.5" />
                  <text x="170" y="266" textAnchor="middle" fontSize="12" fontWeight="600" fill="#17252A">4. Safety Layer & Explanation</text>
                  <text x="170" y="282" textAnchor="middle" fontSize="10" fill="#17252A" opacity="0.8">English, Tamil, or Hindi summary</text>

                  {/* Down arrow */}
                  <line x1="170" y1="292" x2="170" y2="312" stroke="#2B7A78" strokeWidth="1.5" />
                  <polygon points="166,310 170,318 174,310" fill="#2B7A78" />

                  {/* Step 5: Verified Doctor */}
                  <rect x="20" y="318" width="300" height="44" rx="4" fill="#2B7A78" stroke="#17252A" strokeWidth="1.5" />
                  <text x="170" y="345" textAnchor="middle" fontSize="13" fontWeight="600" fill="#FEFFFF">5. Verified Doctor Consultation</text>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Section: What it checks */}
        <section className="border-t border-[#17252A]/10 bg-[#DEF2F1]/20 py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#17252A]">What it checks</h2>
              <p className="mt-1 text-sm text-[#17252A]/70">
                SkinSentry runs specialist computer vision models designed for specific visual presentations.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Skin lesions (moles and spots)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-[#17252A]/80">
                  Sorts a lesion into one of seven types seen in dermoscopy images, outlines it,
                  and scores asymmetry, border, colour and diameter. Gives an estimated likelihood
                  with a range, not a diagnosis.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Wounds and ulcers</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-[#17252A]/80">
                  Outlines the wound, estimates its area and tissue colours, and compares your photos
                  over time to show whether it is healing, stalled or getting worse.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Skin conditions</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-[#17252A]/80">
                  Lists up to three possible conditions from a limited set, or says it is not sure.
                  The full list is on the{" "}
                  <Link href="/terms" className="text-[#2B7A78] underline font-medium">
                    Model performance
                  </Link>{" "}
                  page.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Section: How it works */}
        <section className="py-14 border-t border-[#17252A]/10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#17252A]">How it works</h2>
              <p className="mt-1 text-sm text-[#17252A]/70">
                Five steps from photograph submission to clinical consultation.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
                <div className="text-xs font-mono font-bold text-[#2B7A78] mb-2">01</div>
                <h3 className="text-sm font-semibold text-[#17252A] mb-1">Upload Photo</h3>
                <p className="text-xs text-[#17252A]/80 leading-relaxed">
                  Upload a clear photo of the skin lesion, wound, or affected area.
                </p>
              </div>

              <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
                <div className="text-xs font-mono font-bold text-[#2B7A78] mb-2">02</div>
                <h3 className="text-sm font-semibold text-[#17252A] mb-1">Quality Check</h3>
                <p className="text-xs text-[#17252A]/80 leading-relaxed">
                  The app checks photo quality and tells you how to retake it if needed.
                </p>
              </div>

              <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
                <div className="text-xs font-mono font-bold text-[#2B7A78] mb-2">03</div>
                <h3 className="text-sm font-semibold text-[#17252A] mb-1">Specialist Checks</h3>
                <p className="text-xs text-[#17252A]/80 leading-relaxed">
                  Three specialist checks run (lesion, wound, condition). Only applicable ones report.
                </p>
              </div>

              <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
                <div className="text-xs font-mono font-bold text-[#2B7A78] mb-2">04</div>
                <h3 className="text-sm font-semibold text-[#17252A] mb-1">Review Evidence</h3>
                <p className="text-xs text-[#17252A]/80 leading-relaxed">
                  You see the result, measurements behind it, and an explanation in English, Tamil or Hindi.
                </p>
              </div>

              <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#FEFFFF]">
                <div className="text-xs font-mono font-bold text-[#2B7A78] mb-2">05</div>
                <h3 className="text-sm font-semibold text-[#17252A] mb-1">Doctor Booking</h3>
                <p className="text-xs text-[#17252A]/80 leading-relaxed">
                  You can book a verified doctor for a full clinical consultation.
                </p>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link href="/how-it-works">
                <Button variant="secondary" size="sm">
                  Read complete screening instructions
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Section: What it cannot do */}
        <section className="border-t border-[#17252A]/10 bg-[#DEF2F1]/30 py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="border border-[#17252A]/20 bg-[#FEFFFF] p-6 rounded-[4px]">
              <div className="flex items-center gap-2 text-base font-bold text-[#17252A] mb-3">
                <AlertTriangle className="h-5 w-5 text-[#8A5A00]" />
                <h2>What it cannot do</h2>
              </div>
              <p className="text-sm leading-relaxed text-[#17252A]/85">
                It cannot diagnose. It cannot rule out a problem. Photos taken with a phone are
                less reliable than clinical images. It was trained on public image sets that contain
                mostly lighter skin tones, so it may be less reliable on darker skin. See the{" "}
                <Link href="/terms" className="font-semibold text-[#2B7A78] underline">
                  Model performance
                </Link>{" "}
                page for the measured results and limits.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Disclaimer Bar */}
        <div className="border-t border-[#17252A]/10 bg-[#DEF2F1]/50 py-3">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PermanentDisclaimer />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
