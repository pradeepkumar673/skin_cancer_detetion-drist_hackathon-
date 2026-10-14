import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ShieldCheck, Activity, Layers, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex-1">
        {/* Top Disclaimer Notice */}
        <div className="border-b border-[#17252A]/10 bg-[#DEF2F1]/50 py-2.5">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PermanentDisclaimer />
          </div>
        </div>

        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-3xl space-y-6">
            <div
              className="inline-flex items-center gap-2 border border-[#2B7A78]/30 bg-[#DEF2F1] px-3 py-1 text-xs font-semibold text-[#17252A]"
              style={{ borderRadius: "4px" }}
            >
              <Activity className="h-3.5 w-3.5 text-[#2B7A78]" />
              <span>Dermatological Decision Support</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-[#17252A] sm:text-4xl">
              Automated visual screening for skin lesions, wounds, and common conditions.
            </h1>

            <p className="text-base leading-relaxed text-[#17252A]/80">
              SkinSentry provides structured decision support to patients and healthcare workers.
              Visual findings are evaluated across calibrated lesion contour parameters, wound healing
              trajectories, and multi-class disease representations.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link href="/register">
                <Button variant="primary" size="lg" className="flex items-center gap-2">
                  <span>Start Skin Screening</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" size="lg">
                  Access My Cases
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Clinical Capabilities Section */}
        <section className="border-t border-[#17252A]/10 bg-[#DEF2F1]/30 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[#17252A]">
                Structured screening pathways
              </h2>
              <p className="mt-2 text-sm text-[#17252A]/70">
                Incoming images are verified by an automated quality gate before triage into three
                clinical screening pathways.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Pathway 1: Cancer */}
              <Card className="flex flex-col justify-between border-[#17252A]/15 bg-[#FEFFFF]">
                <div>
                  <CardHeader>
                    <div
                      className="mb-3 inline-flex h-10 w-10 items-center justify-center border border-[#2B7A78]/20 bg-[#DEF2F1] text-[#2B7A78]"
                      style={{ borderRadius: "4px" }}
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <CardTitle>Pigmented Lesion Screening</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs leading-relaxed text-[#17252A]/80">
                    <p>
                      Evaluates asymmetry, border irregularity, color variation, and diameter.
                    </p>
                    <p>
                      Longitudinal image registration compares earlier photos to detect evolution over
                      time and outlier lesions.
                    </p>
                  </CardContent>
                </div>
              </Card>

              {/* Pathway 2: Ulcer */}
              <Card className="flex flex-col justify-between border-[#17252A]/15 bg-[#FEFFFF]">
                <div>
                  <CardHeader>
                    <div
                      className="mb-3 inline-flex h-10 w-10 items-center justify-center border border-[#2B7A78]/20 bg-[#DEF2F1] text-[#2B7A78]"
                      style={{ borderRadius: "4px" }}
                    >
                      <Activity className="h-5 w-5" />
                    </div>
                    <CardTitle>Chronic Wound Tracking</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs leading-relaxed text-[#17252A]/80">
                    <p>
                      Segments wound margins to estimate surface area and rate of change per week.
                    </p>
                    <p>
                      Observes tissue color breakdowns and checks for clinical red flags warranting
                      in-person consultation.
                    </p>
                  </CardContent>
                </div>
              </Card>

              {/* Pathway 3: Disease */}
              <Card className="flex flex-col justify-between border-[#17252A]/15 bg-[#FEFFFF]">
                <div>
                  <CardHeader>
                    <div
                      className="mb-3 inline-flex h-10 w-10 items-center justify-center border border-[#2B7A78]/20 bg-[#DEF2F1] text-[#2B7A78]"
                      style={{ borderRadius: "4px" }}
                    >
                      <Layers className="h-5 w-5" />
                    </div>
                    <CardTitle>Skin Condition Assessment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs leading-relaxed text-[#17252A]/80">
                    <p>
                      Provides top probable conditions from validated reference distributions.
                    </p>
                    <p>
                      Applies calibrated abstention when visual features do not meet strict confidence
                      thresholds.
                    </p>
                  </CardContent>
                </div>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
