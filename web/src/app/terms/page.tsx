import React from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { legalMeta } from "@/content/legalMeta";

export default function TermsPage() {
  const sections = [
    { id: "nature", title: "1. Nature of the Service and Emergency Warning" },
    { id: "eligibility", title: "2. Eligibility and User Accounts" },
    { id: "content", title: "3. User Content and Processing Rights" },
    { id: "doctors", title: "4. Independent Medical Practitioners" },
    { id: "payments", title: "5. Fees, Payments and Refund Policy" },
    { id: "acceptable-use", title: "6. Acceptable Use Guidelines" },
    { id: "ai-limits", title: "7. Automated Screening Limitations" },
    { id: "attribution", title: "8. Dataset and Model Attribution" },
    { id: "availability", title: "9. Service Availability" },
    { id: "liability", title: "10. Limitation of Liability" },
    { id: "governing-law", title: "11. Governing Law and Disputes" },
    { id: "changes", title: "12. Modifications to Terms" },
    { id: "contact", title: "13. Contact Information" },
  ];

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
        <header className="border-b border-[#17252A]/10 bg-[#FEFFFF] py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h1 className="text-3xl font-bold tracking-tight text-[#17252A]">
              Terms and Conditions
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-[#17252A]/70">
              <span>Version: {legalMeta.version}</span>
              <span>Effective Date: {legalMeta.effectiveDate}</span>
              <span>Jurisdiction: {legalMeta.governingLaw}</span>
            </div>
          </div>
        </header>

        {/* Content with sidebar table of contents */}
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-12">
            {/* Table of Contents - Left sticky nav on large screens */}
            <aside className="lg:col-span-4 hidden lg:block">
              <div className="sticky top-20 border border-[#17252A]/15 p-4 rounded-[4px] bg-[#DEF2F1]/20">
                <div className="text-xs font-bold uppercase tracking-wider text-[#17252A]/70 mb-3 font-mono">
                  Contents
                </div>
                <nav className="space-y-1.5 text-xs">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block py-1 text-[#17252A]/80 hover:text-[#2B7A78] hover:underline"
                    >
                      {s.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Terms text - max 70ch width */}
            <article className="lg:col-span-8 max-w-[70ch] space-y-10 text-sm leading-relaxed text-[#17252A]/90">
              <section id="nature" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  1. Nature of the Service and Emergency Warning
                </h2>
                <div className="border border-[#B42318]/40 bg-[#B42318]/5 p-4 rounded-[4px] text-xs space-y-2">
                  <div className="font-bold text-[#B42318] uppercase tracking-wide">
                    Crucial Medical Disclaimer
                  </div>
                  <p className="text-[#17252A]">
                    SkinSentry is a clinical decision-support tool. It is NOT a medical device, does NOT
                    provide definitive medical diagnoses, and does NOT replace the clinical judgment of a
                    licensed physician. A normal or low-risk result never proves there is no problem.
                  </p>
                  <p className="text-[#17252A] font-semibold">
                    DO NOT USE THIS SERVICE FOR MEDICAL EMERGENCIES. If you observe rapid changes in lesion
                    size, uncontrolled bleeding, spreading redness, fever, intense swelling, or severe pain,
                    contact an emergency medical service or visit the nearest hospital emergency room immediately.
                  </p>
                </div>
              </section>

              <section id="eligibility" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  2. Eligibility and User Accounts
                </h2>
                <p>
                  To create an account and use SkinSentry, you must be at least {legalMeta.minimumAge} years of age.
                  By registering, you confirm that all information provided (including clinical context and
                  identification) is accurate and complete. You are responsible for safeguarding your login
                  credentials and for all activities conducted through your account.
                </p>
              </section>

              <section id="content" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  3. User Content and Processing Rights
                </h2>
                <p>
                  You retain ownership of the photographs and health information you upload. By submitting
                  photographs to the service, you grant SkinSentry a non-exclusive license solely to process,
                  measure, segment, and present the image for your decision-support screening and to share it
                  with a doctor when you explicitly authorize a consultation.
                </p>
              </section>

              <section id="doctors" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  4. Independent Medical Practitioners
                </h2>
                <p>
                  Doctors available for consultation on SkinSentry are independent medical professionals
                  registered with their respective state or national medical councils. The medical
                  consultation relationship exists solely between the patient and the consulting physician.
                  SkinSentry provides the communication and record-sharing platform but does not practice medicine.
                </p>
              </section>

              <section id="payments" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  5. Fees, Payments and Refund Policy
                </h2>
                <p>
                  Teleconsultation fees are clearly presented prior to booking and processed through Razorpay.
                </p>
                <div className="border border-[#17252A]/15 p-3 rounded-[4px] bg-[#DEF2F1]/20 text-xs">
                  <strong>Refund Policy:</strong> This platform is a hackathon prototype demonstration. Test
                  transactions are simulated and eligible for a full refund if a consultation fails or is cancelled.
                </div>
              </section>

              <section id="acceptable-use" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  6. Acceptable Use Guidelines
                </h2>
                <p>You agree not to:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Upload images of individuals without their explicit informed consent.</li>
                  <li>Upload non-clinical, obscene, or fraudulent imagery.</li>
                  <li>Attempt to reverse-engineer, decompile, or extract the machine learning models.</li>
                  <li>Interfere with or disrupt the integrity or performance of the API or servers.</li>
                </ul>
              </section>

              <section id="ai-limits" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  7. Automated Screening Limitations
                </h2>
                <p>
                  Our algorithms rely on probabilistic statistical patterns. Findings can be impacted by lighting
                  quality, focus, skin pigmentation, hair coverage, and camera calibration:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Smartphone photos have lower optical resolution than dermoscopic epiluminescence microscopy.</li>
                  <li>
                    Public training datasets consist predominantly of lighter skin phototypes (Fitzpatrick I to III).
                    Accuracy may be lower on darker skin tones (Fitzpatrick IV to VI).
                  </li>
                  <li>If image quality is insufficient, the system will abstain rather than issue an uncertain estimate.</li>
                </ul>
              </section>

              <section id="attribution" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  8. Dataset and Model Attribution
                </h2>
                <p>
                  SkinSentry is built upon recognized open-source clinical research datasets and foundational models:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs">
                  <li>
                    <strong>HAM10000 Dataset:</strong> Tschandl, P., Rosendahl, C. & Kittler, H. The HAM10000
                    dataset, a large collection of multi-source dermatoscopic images of common pigmented skin lesions.
                    Sci. Data 5, 180161 (2018). Used under Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).
                  </li>
                  <li>
                    <strong>DermNet:</strong> 23-class skin disease image dataset used for educational and decision-support reference.
                  </li>
                  <li>
                    <strong>FUSeg Foot Ulcer Dataset:</strong> Diabetic foot ulcer segmentation and area measurement benchmarks.
                  </li>
                  <li>
                    <strong>DINOv2 & MedSAM:</strong> Foundational vision transformers for representation learning and medical segmentation.
                  </li>
                </ul>
              </section>

              <section id="availability" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  9. Service Availability
                </h2>
                <p>
                  We strive to maintain continuous system availability. However, service may be occasionally
                  suspended for routine maintenance, security upgrades, or due to infrastructure outages outside
                  our reasonable control.
                </p>
              </section>

              <section id="liability" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  10. Limitation of Liability
                </h2>
                <p>
                  To the maximum extent permitted by applicable law, {legalMeta.organisationName} and its contributors
                  shall not be liable for any indirect, incidental, special, consequential, or punitive damages,
                  nor for any loss of health or medical complications arising out of your reliance on automated
                  screening results. You acknowledge that clinical decisions must always be made in consultation
                  with a qualified healthcare professional.
                </p>
              </section>

              <section id="governing-law" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  11. Governing Law and Disputes
                </h2>
                <p>
                  These Terms and any dispute arising from your use of the service shall be governed by and
                  construed in accordance with the laws of <strong>{legalMeta.governingLaw}</strong>, without
                  regard to conflict of law principles.
                </p>
              </section>

              <section id="changes" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  12. Modifications to Terms
                </h2>
                <p>
                  We reserve the right to revise these Terms at any time. When revisions are published, the effective
                  date will be updated, and continued use of the platform requires acceptance of the updated terms.
                </p>
              </section>

              <section id="contact" className="scroll-mt-24 space-y-3 pb-8">
                <h2 className="text-xl font-bold text-[#17252A]">
                  13. Contact Information
                </h2>
                <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#DEF2F1]/20 text-xs space-y-1">
                  <div><strong>Operator:</strong> {legalMeta.organisationName}</div>
                  <div><strong>Legal Desk:</strong> {legalMeta.contactEmail}</div>
                  <div><strong>Support:</strong> {legalMeta.supportEmail}</div>
                </div>
              </section>
            </article>
          </div>
        </div>

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
