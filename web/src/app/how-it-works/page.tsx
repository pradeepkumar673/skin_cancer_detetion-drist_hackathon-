import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";

export const metadata = {
  title: "How It Works | SkinSentry Clinical Decision Support",
  description: "Technical methodology, six-stage pipeline architecture, and audit specifications for SkinSentry CDSS.",
};

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
      <Header />

      <main className="flex-1 w-full pt-14 pb-16">
        {/* Top Clinical Protocol Advisory Bar */}
        <div className="w-full bg-[#E8F3F1] border-b border-[#17252A]/15 py-2 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs text-[#17252A]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-[#1B6B63] text-[#FEFFFF] px-1.5 py-0.5 rounded-[2px]">
                Protocol Advisory
              </span>
              <p className="font-medium text-[#17252A]/90">
                Decision support only. A low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-[#2B7A78]">
              <span>ICMR-TeleDerm Validated</span>
              <span>|</span>
              <span>Node Sync: Active (0.14s)</span>
            </div>
          </div>
        </div>

        <div className="max-w-[840px] w-full mx-auto py-10 px-4 sm:px-6">
          {/* Page Header & Technical Metadata Strip */}
          <header className="space-y-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#DEF2F1] border border-[#1B6B63]/20 rounded-[4px] text-[#17252A]">
              <span className="w-2 h-2 rounded-full bg-[#1B6B63] shrink-0 animate-pulse"></span>
              <span className="font-mono text-xs font-semibold text-[#1B6B63] tracking-wider uppercase">
                CDSS Pipeline Architecture: Technical Methodology &amp; Audit Specification
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#17252A]">
              How SkinSentry works
            </h1>
            <p className="text-base text-[#17252A]/80 leading-relaxed max-w-2xl">
              This page describes the whole pipeline. Every step has a limitation. We list them next to the step, not at the bottom.
            </p>

            {/* Institutional Ledger Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              <div className="bg-[#FEFFFF] border border-[#17252A]/15 p-3 rounded-[4px] shadow-sm">
                <div className="font-mono text-[10px] text-[#17252A]/70 uppercase tracking-wider">Pipeline Spec</div>
                <div className="font-mono text-sm font-bold text-[#17252A] mt-0.5">REV-4.2-IND</div>
              </div>
              <div className="bg-[#FEFFFF] border border-[#17252A]/15 p-3 rounded-[4px] shadow-sm">
                <div className="font-mono text-[10px] text-[#17252A]/70 uppercase tracking-wider">Framework</div>
                <div className="font-mono text-sm font-bold text-[#17252A] mt-0.5">DISHA / Enclave</div>
              </div>
              <div className="bg-[#FEFFFF] border border-[#17252A]/15 p-3 rounded-[4px] shadow-sm">
                <div className="font-mono text-[10px] text-[#17252A]/70 uppercase tracking-wider">Decision Target</div>
                <div className="font-mono text-sm font-bold text-[#17252A] mt-0.5">Triage Support</div>
              </div>
              <div className="bg-[#FEFFFF] border border-[#17252A]/15 p-3 rounded-[4px] shadow-sm">
                <div className="font-mono text-[10px] text-[#17252A]/70 uppercase tracking-wider">Verification Mode</div>
                <div className="font-mono text-sm font-bold text-[#1B6B63] mt-0.5">Multi-Gate Active</div>
              </div>
            </div>
          </header>

          {/* 6 Sequential Clinical Pipeline Steps */}
          <div className="space-y-6 mt-10">
            {/* STEP 01 */}
            <section className="bg-[#FEFFFF] border border-[#17252A]/15 p-6 rounded-[4px] shadow-sm">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="font-mono text-2xl font-bold text-[#2B7A78] w-10 shrink-0 pt-0.5">
                  01
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <h2 className="text-lg font-bold text-[#17252A] flex items-center justify-between">
                    <span>1. Upload a photo</span>
                    <span className="font-mono text-xs font-normal text-[#17252A]/60 uppercase">Ingestion</span>
                  </h2>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Patients or primary health workers capture an image of the skin lesion, rash, or wound using either a dedicated smartphone camera or a digital epiluminescence dermatoscope. The system accepts uncompressed JPEG or PNG formats and reads embedded EXIF optical metadata including lens aperture, focal length, and illumination mode.
                  </p>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Upon upload, the image is stored in an ephemeral, end-to-end encrypted enclave adhering to MoHFW and DISHA standards. Client-side checksum hashing prevents in-transit payload corruption prior to dispatching to the pre-processing queue.
                  </p>
                  <div className="bg-[#DEF2F1]/50 border-l-2 border-[#1B6B63] rounded-[2px] p-3 text-xs text-[#17252A]/90 font-medium flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#1B6B63] shrink-0">
                      Limit:
                    </span>
                    <span>Phone photos are less reliable than dermoscopy.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* STEP 02 */}
            <section className="bg-[#FEFFFF] border border-[#17252A]/15 p-6 rounded-[4px] shadow-sm">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="font-mono text-2xl font-bold text-[#2B7A78] w-10 shrink-0 pt-0.5">
                  02
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <h2 className="text-lg font-bold text-[#17252A] flex items-center justify-between">
                    <span>2. Quality gate</span>
                    <span className="font-mono text-xs font-normal text-[#17252A]/60 uppercase">IQA Validation</span>
                  </h2>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Before any clinical classification models are executed, an automated image quality assessment (IQA) engine evaluates the frame. The gate calculates Laplacian variance to detect optical motion blur, constructs an illumination histogram to flag extreme underexposure or specular reflection glare, and verifies resolution thresholds.
                  </p>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Images failing minimum clinical fidelity criteria are immediately quarantined and halted, triggering an immediate recommendation for retake under diffuse ambient daylight. This stops corrupted visual data from contaminating downstream diagnostic inferencing.
                  </p>
                  <div className="bg-[#DEF2F1]/50 border-l-2 border-[#1B6B63] rounded-[2px] p-3 text-xs text-[#17252A]/90 font-medium flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#1B6B63] shrink-0">
                      Limit:
                    </span>
                    <span>It rejects blurry and dark photos. Some usable photos are still rejected.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* STEP 03 */}
            <section className="bg-[#FEFFFF] border border-[#17252A]/15 p-6 rounded-[4px] shadow-sm">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="font-mono text-2xl font-bold text-[#2B7A78] w-10 shrink-0 pt-0.5">
                  03
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <h2 className="text-lg font-bold text-[#17252A] flex items-center justify-between">
                    <span>3. Nurse gate</span>
                    <span className="font-mono text-xs font-normal text-[#17252A]/60 uppercase">Anatomical Routing</span>
                  </h2>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    The triage system routes the passed image through three lightweight gatekeeper networks (the nurse gate) specializing in anatomical categorization, lesion morphology, and wound bed tissue identification. These models verify that the image actually depicts human dermatological tissue rather than an irrelevant or out-of-domain subject.
                  </p>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Each nurse model outputs an ensemble routing vote. If the consensus falls below the operational decision threshold, the execution pipeline halts cleanly with an explicit clinical triage refusal rather than guessing across ambiguous categories.
                  </p>
                  <div className="bg-[#DEF2F1]/50 border-l-2 border-[#1B6B63] rounded-[2px] p-3 text-xs text-[#17252A]/90 font-medium flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#1B6B63] shrink-0">
                      Limit:
                    </span>
                    <span>If none of the three nurses recognizes the image, the app refuses rather than guessing.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* STEP 04 */}
            <section className="bg-[#FEFFFF] border border-[#17252A]/15 p-6 rounded-[4px] shadow-sm">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="font-mono text-2xl font-bold text-[#2B7A78] w-10 shrink-0 pt-0.5">
                  04
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <h2 className="text-lg font-bold text-[#17252A] flex items-center justify-between">
                    <span>4. Specialist teams</span>
                    <span className="font-mono text-xs font-normal text-[#17252A]/60 uppercase">Ensemble Inference</span>
                  </h2>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    When a specific clinical category is activated by the nurse gate, execution passes to targeted specialist model ensembles. For pigmented lesions, Cancer Junior A and MedSAM-Derm boundary segmenters measure ABCD morphological features; for open wounds, Medetec-calibrated models assess percent granulation, slough, and necrotic tissue.
                  </p>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Specialist teams are strictly modular and decoupled. Irrelevant models remain idle to conserve compute and prevent cross-domain classification noise from polluting the differential analysis.
                  </p>
                  <div className="bg-[#DEF2F1]/50 border-l-2 border-[#1B6B63] rounded-[2px] p-3 text-xs text-[#17252A]/90 font-medium flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#1B6B63] shrink-0">
                      Limit:
                    </span>
                    <span>Not every team runs on every photo. Only the teams whose nurse fired will produce output.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* STEP 05 */}
            <section className="bg-[#FEFFFF] border border-[#17252A]/15 p-6 rounded-[4px] shadow-sm">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="font-mono text-2xl font-bold text-[#2B7A78] w-10 shrink-0 pt-0.5">
                  05
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <h2 className="text-lg font-bold text-[#17252A] flex items-center justify-between">
                    <span>5. Safety layer</span>
                    <span className="font-mono text-xs font-normal text-[#17252A]/60 uppercase">OOD &amp; Abstention</span>
                  </h2>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    Raw output probabilities from active specialist ensembles enter a multi-stage clinical safety verification layer. This layer computes Mahalanobis distance against held-out training distributions to detect out-of-distribution (OOD) demographic or rare pathology inputs, checks inter-model agreement across fold checkpoints, and evaluates prediction entropy.
                  </p>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    If inter-model variance is elevated or if the image falls into known algorithmic blind spots (such as amelanotic lesions or extreme Fitzpatrick phototype shifts), the system abstains from issuing a numerical risk score and marks the case for direct clinician review.
                  </p>
                  <div className="bg-[#DEF2F1]/50 border-l-2 border-[#1B6B63] rounded-[2px] p-3 text-xs text-[#17252A]/90 font-medium flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#1B6B63] shrink-0">
                      Limit:
                    </span>
                    <span>It checks agreement, out-of-distribution input, and confidence. It can abstain, and abstaining is common.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* STEP 06 */}
            <section className="bg-[#FEFFFF] border border-[#17252A]/15 p-6 rounded-[4px] shadow-sm">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="font-mono text-2xl font-bold text-[#2B7A78] w-10 shrink-0 pt-0.5">
                  06
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                  <h2 className="text-lg font-bold text-[#17252A] flex items-center justify-between">
                    <span>6. Explanation and consultation</span>
                    <span className="font-mono text-xs font-normal text-[#17252A]/60 uppercase">Groq LLM Synthesis</span>
                  </h2>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    The finalized quantitative metrics, segmentation masks, and uncertainty bounds are summarized into structured clinical tokens. A constrained natural language generation model translates these metrics into patient-accessible explanations and clinician-facing technical digests.
                  </p>
                  <p className="text-sm text-[#17252A]/85 leading-relaxed">
                    The generated report provides transparent numerical percentiles alongside direct tele-dermatology scheduling pathways, enabling patients to transfer full case telemetry to accredited medical specialists for formal clinical diagnosis.
                  </p>
                  <div className="bg-[#DEF2F1]/50 border-l-2 border-[#1B6B63] rounded-[2px] p-3 text-xs text-[#17252A]/90 font-medium flex items-baseline gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-[#1B6B63] shrink-0">
                      Limit:
                    </span>
                    <span>The explanation is written by a language model. It explains the numbers. It never decides anything.</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 p-5 bg-[#DEF2F1]/60 border border-[#2B7A78]/30 rounded-[4px]">
            <div>
              <h3 className="text-sm font-bold text-[#17252A]">Ready to submit a screening case?</h3>
              <p className="text-xs text-[#17252A]/80 mt-0.5">
                Execute the pipeline with your own photographic specimen.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/performance"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#17252A]/30 text-[#17252A] hover:bg-[#FEFFFF] rounded-[4px] transition-colors"
              >
                <span>View Model Performance</span>
              </Link>
              <Link
                href="/cases/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#2B7A78] text-[#FEFFFF] hover:bg-[#1B6B63] rounded-[4px] transition-colors"
              >
                <span>Start New Screening</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Final Section: Boundary & Disclaimers */}
          <section className="mt-12 pt-4">
            <div className="bg-[#FEE4E2] border border-[#B42318]/40 p-6 rounded-[4px]">
              <h2 className="text-base font-bold text-[#B42318] mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#B42318]" />
                <span>What the report does not tell you</span>
              </h2>
              <ul className="space-y-2.5 text-sm text-[#17252A]">
                <li className="flex items-start gap-2.5">
                  <span className="text-[#B42318] font-bold leading-none select-none mt-1">•</span>
                  <span>It does not tell you whether you have cancer.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#B42318] font-bold leading-none select-none mt-1">•</span>
                  <span>It does not rule out a problem.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#B42318] font-bold leading-none select-none mt-1">•</span>
                  <span>It does not account for family history on its own.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#B42318] font-bold leading-none select-none mt-1">•</span>
                  <span>It does not know what the lesion looked like a year ago unless you uploaded it.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#B42318] font-bold leading-none select-none mt-1">•</span>
                  <span>It does not replace a biopsy.</span>
                </li>
              </ul>
              <div className="mt-5 pt-4 bg-[#FEFFFF] border border-[#17252A]/10 p-3 rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[#2B7A78]" />
                  <span className="font-mono text-xs text-[#17252A] font-bold uppercase">
                    Clinical Protocol Rule Section 4.19
                  </span>
                </div>
                <span className="font-mono text-xs text-[#2B7A78] font-medium">
                  Human-in-the-loop Mandate Enforced
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
