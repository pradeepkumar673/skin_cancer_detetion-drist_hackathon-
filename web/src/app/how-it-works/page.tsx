import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex-1">
        {/* Top Disclaimer */}
        <div className="border-b border-[#17252A]/10 bg-[#DEF2F1]/60 py-2.5">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <PermanentDisclaimer />
          </div>
        </div>

        {/* Header */}
        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-[#17252A] sm:text-4xl">
            How SkinSentry Works
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#17252A]/80">
            SkinSentry combines image quality gating, specialized computer vision models, and
            structured clinical explanations to support medical decision-making. Here is the
            complete process from photograph submission to physician consultation.
          </p>
        </section>

        {/* Steps Detailed */}
        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 space-y-10">
          {/* Step 1 */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#2B7A78] text-[#FEFFFF] font-mono text-sm font-bold">
                1
              </div>
              <div>
                <CardTitle className="text-lg">Taking and Uploading a Photo</CardTitle>
                <p className="text-xs text-[#17252A]/70">Proper capture ensures reliable analysis</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-[#17252A]/85">
              <p>
                The reliability of automated visual analysis depends directly on photo quality.
                When capturing an image of a mole, lesion, wound, or rash:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>Steady hand:</strong> Rest your elbows or hands on a firm surface to eliminate motion blur.</li>
                <li><strong>Daylight lighting:</strong> Use bright, indirect natural daylight. Avoid harsh flash, direct sunlight glare, or heavy shadows.</li>
                <li><strong>Scale reference:</strong> If you want measurements in square centimetres, place a ruler or small standard coin next to the spot on the same plane.</li>
                <li><strong>Centred framing:</strong> Keep the spot directly in the centre of the camera frame, filling about half the view.</li>
                <li><strong>Clear field:</strong> Gently move hair away from the lesion if possible. Avoid applying creams, ointments, or bandages before photographing.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#2B7A78] text-[#FEFFFF] font-mono text-sm font-bold">
                2
              </div>
              <div>
                <CardTitle className="text-lg">Real-Time Quality Check (Nurse Gate)</CardTitle>
                <p className="text-xs text-[#17252A]/70">Automated triage before clinical processing</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-[#17252A]/85">
              <p>
                Before any diagnostic triage models run, our &ldquo;Nurse Gate&rdquo; evaluates the technical
                suitability of the image:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>Skin validation:</strong> Confirms the photo actually shows human skin, rejecting household objects, animals, or non-skin scenes.</li>
                <li><strong>Sharpness and focus:</strong> Rejects blurry images using Laplacian variance thresholds.</li>
                <li><strong>Exposure check:</strong> Identifies underexposed (too dark) or overexposed (washed out) photographs.</li>
                <li><strong>Actionable feedback:</strong> If an image fails the check, the system abstains and gives specific coaching tips on how to retake it immediately.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#2B7A78] text-[#FEFFFF] font-mono text-sm font-bold">
                3
              </div>
              <div>
                <CardTitle className="text-lg">Specialist Decision Modules</CardTitle>
                <p className="text-xs text-[#17252A]/70">Dedicated models for distinct clinical presentations</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-[#17252A]/85">
              <p>
                Images that pass quality validation are directed to the relevant clinical models:
              </p>
              <div className="space-y-3 pt-1">
                <div className="border border-[#17252A]/10 p-3 rounded-[4px] bg-[#DEF2F1]/20">
                  <h4 className="text-xs font-bold text-[#17252A]">Skin Lesions & Melanoma Risk</h4>
                  <p className="text-xs text-[#17252A]/80 mt-1">
                    Evaluates pigmentation and dermoscopic features. Produces calibrated likelihood
                    estimates across 7 lesion classes (melanoma, melanocytic nevus, basal cell carcinoma,
                    actinic keratosis, benign keratosis, dermatofibroma, vascular lesion).
                  </p>
                </div>
                <div className="border border-[#17252A]/10 p-3 rounded-[4px] bg-[#DEF2F1]/20">
                  <h4 className="text-xs font-bold text-[#17252A]">Wounds and Ulcers</h4>
                  <p className="text-xs text-[#17252A]/80 mt-1">
                    Segments wound borders and calculates surface area in square centimetres. Identifies
                    granulation, slough, and necrotic tissue fractions. When historical photos exist,
                    calculates healing trajectory (healing, stalled, deteriorating).
                  </p>
                </div>
                <div className="border border-[#17252A]/10 p-3 rounded-[4px] bg-[#DEF2F1]/20">
                  <h4 className="text-xs font-bold text-[#17252A]">Skin Conditions and Rashes</h4>
                  <p className="text-xs text-[#17252A]/80 mt-1">
                    Evaluates inflammatory conditions against dermatological reference datasets,
                    returning up to three plausible candidate categories or explicitly abstaining
                    if confidence is low.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 4 */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#2B7A78] text-[#FEFFFF] font-mono text-sm font-bold">
                4
              </div>
              <div>
                <CardTitle className="text-lg">Understanding Your Results</CardTitle>
                <p className="text-xs text-[#17252A]/70">Clear numbers and plain-language explanations</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-[#17252A]/85">
              <p>
                SkinSentry displays raw measurements alongside evidence visualisations:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs">
                <li>
                  <strong>Likelihood and Range:</strong> Rather than a single number, risk is presented
                  with an uncertainty interval (for example, &ldquo;38% estimated risk, range 31% to 45%&rdquo;).
                </li>
                <li>
                  <strong>ABCDE Scores:</strong> Asymmetry, Border irregularity, Colour variation, and
                  Diameter are reported as percentile ranks against verified reference datasets.
                </li>
                <li>
                  <strong>Agreement View:</strong> An 8x8 cell grid compares predictions between
                  independent senior models, highlighting areas where both agree or disagree.
                </li>
                <li>
                  <strong>Plain-Language Explanation:</strong> De-identified metrics are summarized into
                  plain language in English, Tamil, or Hindi. The explanation describes the observed
                  features without offering a diagnosis.
                </li>
                <li>
                  <strong>When the system is not sure:</strong> If confidence is below safety thresholds,
                  the system abstains and advises in-person clinical review.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Step 5 */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#2B7A78] text-[#FEFFFF] font-mono text-sm font-bold">
                5
              </div>
              <div>
                <CardTitle className="text-lg">Consulting a Verified Doctor</CardTitle>
                <p className="text-xs text-[#17252A]/70">Direct transition to licensed care</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-[#17252A]/85">
              <p>
                Automated screening is decision support only. You can immediately share your case
                with a state-registered dermatologist or wound specialist:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>Explicit consent:</strong> Doctors can only view your images and measurements when you grant time-limited consent.</li>
                <li><strong>Multiple formats:</strong> Consultations are supported via secure text chat, audio, or encrypted video calls.</li>
                <li><strong>Clinical authority:</strong> The doctor reviews the original photo, validates the measurements, provides clinical diagnosis, and recommends treatment.</li>
              </ul>

              <div className="pt-2">
                <Link href="/register">
                  <Button variant="primary" size="sm" className="flex items-center gap-2">
                    <span>Start a screening check</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Bottom Disclaimer */}
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
