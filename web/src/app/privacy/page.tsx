import React from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { legalMeta } from "@/content/legalMeta";

export default function PrivacyPage() {
  const sections = [
    { id: "operator", title: "1. Operator and Contact Information" },
    { id: "collection", title: "2. Information We Collect" },
    { id: "purpose", title: "3. Why We Process Your Data" },
    { id: "processors", title: "4. Third Parties and Processors" },
    { id: "retention", title: "5. Data Retention Periods" },
    { id: "security", title: "6. Security Measures" },
    { id: "rights", title: "7. Your Rights and Choices" },
    { id: "children", title: "8. Children and Minimum Age" },
    { id: "cookies", title: "9. Cookies and Tracking Technologies" },
    { id: "transfers", title: "10. International Transfers" },
    { id: "changes", title: "11. Changes to This Policy" },
    { id: "contact", title: "12. Contact and Inquiries" },
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
              Privacy Policy
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-[#17252A]/70">
              <span>Version: {legalMeta.version}</span>
              <span>Effective Date: {legalMeta.effectiveDate}</span>
              <span>Operator: {legalMeta.organisationName}</span>
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

            {/* Policy text - max 70ch width */}
            <article className="lg:col-span-8 max-w-[70ch] space-y-10 text-sm leading-relaxed text-[#17252A]/90">
              <section id="operator" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  1. Operator and Contact Information
                </h2>
                <p>
                  This service is operated by <strong>{legalMeta.organisationName}</strong>.
                  For questions concerning your personal data, privacy practices, or to exercise
                  your legal privacy rights, contact our data protection representative at{" "}
                  <a href={`mailto:${legalMeta.contactEmail}`} className="text-[#2B7A78] underline font-medium">
                    {legalMeta.contactEmail}
                  </a>.
                </p>
              </section>

              <section id="collection" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  2. Information We Collect
                </h2>
                <p>
                  We collect and process only the information strictly necessary to provide automated
                  dermatological screening decision support and facilitate professional teleconsultations:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs">
                  <li>
                    <strong>Account Information:</strong> Full name, clinical email address, phone number,
                    hashed password, language preference, and account role (patient or healthcare provider).
                  </li>
                  <li>
                    <strong>Clinical Context (Patients):</strong> Self-reported date of birth, biological sex,
                    Fitzpatrick skin phototype (I to VI), sun exposure category, family history of melanoma,
                    and diabetic status.
                  </li>
                  <li>
                    <strong>Professional Credentials (Doctors):</strong> Medical specialty, state medical
                    council registration number, and clinical biography.
                  </li>
                  <li>
                    <strong>Clinical Photographs:</strong> User-uploaded images of skin lesions, wounds,
                    or rashes, lesion identifiers, body anatomical sites, and physical measurement scales.
                  </li>
                  <li>
                    <strong>Technical & Audit Logs:</strong> Timestamped records of system actions, IP
                    addresses for session integrity, and user-agent strings.
                  </li>
                </ul>
              </section>

              <section id="purpose" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  3. Why We Process Your Data
                </h2>
                <p>We process your personal information for specific, lawful purposes:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>To provide automated visual screening, asymmetry scoring, and area measurements.</li>
                  <li>To present comparative healing trajectories across historical photos of the same lesion.</li>
                  <li>To connect you with licensed medical doctors upon your explicit consent.</li>
                  <li>To maintain clinical audit records and protect against fraudulent activity.</li>
                </ul>
              </section>

              <section id="processors" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  4. Third Parties and Processors
                </h2>
                <p>
                  We work with carefully chosen service providers. Personal data is disclosed only
                  as described below:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-xs">
                  <li>
                    <strong>Database & Storage:</strong> Encrypted data storage in MongoDB and isolated
                    local server disk partitions.
                  </li>
                  <li>
                    <strong>Automated AI Service:</strong> A private, internal machine learning service
                    processes photos without transmitting them to public internet endpoints.
                  </li>
                  <li>
                    <strong>Large Language Model (Groq):</strong> Generates plain-language summaries of
                    structured metrics. Groq receives <em>only de-identified measured features</em>
                    (numerical ABCDE scores, tissue area in square centimetres, risk band, and language
                    code). Patient identity, names, emails, IP addresses, and photographs are
                    <em>never</em> sent to Groq.
                  </li>
                  <li>
                    <strong>Payment Gateway (Razorpay):</strong> Processes teleconsultation fees. SkinSentry
                    stores only order identifiers, payment identifiers, and transaction amounts. We do
                    not store credit card numbers, debit card numbers, or banking credentials.
                  </li>
                  <li>
                    <strong>Email Delivery:</strong> Transactional notices are dispatched via TLS-encrypted SMTP.
                  </li>
                  <li>
                    <strong>Video Calling (STUN/TURN):</strong> WebRTC infrastructure routes peer-to-peer audio
                    and video streams during live doctor consultations.
                  </li>
                  <li>
                    <strong>Licensed Doctors:</strong> Doctors can only access a patient&apos;s case, photos, and
                    results when the patient explicitly creates and authorizes a consultation consent.
                  </li>
                </ul>
              </section>

              <section id="retention" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  5. Data Retention Periods
                </h2>
                <p>We adhere to fixed retention policies configured in our system for this hackathon demonstration:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    <strong>Case Photographs and Results:</strong> Retained for 24 hours (1 day) from submission
                    to demonstrate longitudinal screening flows, after which they are automatically expunged.
                  </li>
                  <li>
                    <strong>Clinical Audit Logs:</strong> Retained for 24 hours (1 day) for session audit and testing.
                  </li>
                  <li>
                    <strong>Account Deletion Grace Period:</strong> Following an account deletion request,
                    data is permanently purged within 24 hours (1 day).
                  </li>
                </ul>
              </section>

              <section id="security" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  6. Security Measures
                </h2>
                <p>We apply robust administrative and technical protections:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs">
                  <li>
                    <strong>Metadata Stripping:</strong> Every uploaded photograph is re-encoded by our
                    backend using Sharp, permanently stripping all EXIF metadata, GPS coordinates, and
                    device serial numbers before disk storage.
                  </li>
                  <li>
                    <strong>Authentication Security:</strong> Passwords are protected using bcrypt work
                    factor 12. Access tokens are stored exclusively in temporary browser memory (never in
                    localStorage) and refreshed via secure HTTP-only cookies.
                  </li>
                  <li>
                    <strong>File Isolation:</strong> Uploaded images are stored in segregated filesystem
                    folders outside any public static web directory. Access requires verified session
                    authorization.
                  </li>
                  <li>
                    <strong>File Type Verification:</strong> Files are validated against magic bytes using
                    file-type inspection to prevent malicious file uploads.
                  </li>
                </ul>
              </section>

              <section id="rights" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  7. Your Rights and Choices
                </h2>
                <p>
                  Under applicable data protection legislation, you possess the right to:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Request access to the personal data we maintain about you.</li>
                  <li>Export your clinical records and measurements in standard JSON format.</li>
                  <li>Correct any inaccurate personal details in your profile.</li>
                  <li>Request permanent deletion of your account and case photographs.</li>
                  <li>Revoke consultation access previously granted to a doctor.</li>
                </ul>
                <p className="text-xs">
                  To exercise any of these rights, contact our data protection desk at{" "}
                  <a href={`mailto:${legalMeta.contactEmail}`} className="text-[#2B7A78] underline">
                    {legalMeta.contactEmail}
                  </a>.
                </p>
              </section>

              <section id="children" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  8. Children and Minimum Age
                </h2>
                <p>
                  SkinSentry is not directed to individuals under the age of {legalMeta.minimumAge}.
                  Users must be at least {legalMeta.minimumAge} years of age to register an account.
                  If you become aware that a child under {legalMeta.minimumAge} has registered without
                  parental consent, please notify us immediately so we can remove the data.
                </p>
              </section>

              <section id="cookies" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  9. Cookies and Tracking Technologies
                </h2>
                <p>
                  SkinSentry operates under a strict privacy-first architecture:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    We use a single, essential session refresh cookie (HTTP-only, SameSite=Lax) to
                    maintain your authenticated login.
                  </li>
                  <li>We do not use advertising cookies, marketing pixels, or behavioural trackers.</li>
                  <li>We do not employ third-party analytics scripts that profile users across websites.</li>
                </ul>
              </section>

              <section id="transfers" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  10. International Transfers
                </h2>
                <p>
                  Core patient records and image storage reside within {legalMeta.governingLaw}. Where
                  de-identified metrics are processed by external infrastructure (such as Groq for
                  natural language synthesis), transmissions are encrypted and strictly devoid of personal
                  identifiers or raw imagery.
                </p>
              </section>

              <section id="changes" className="scroll-mt-24 space-y-3">
                <h2 className="text-xl font-bold text-[#17252A]">
                  11. Changes to This Policy
                </h2>
                <p>
                  We may periodically update this Privacy Policy. When material changes occur, the version
                  number and effective date will be revised, and existing registered users will be
                  prompted to review and accept the updated policy upon their next sign-in.
                </p>
              </section>

              <section id="contact" className="scroll-mt-24 space-y-3 pb-8">
                <h2 className="text-xl font-bold text-[#17252A]">
                  12. Contact and Inquiries
                </h2>
                <p>
                  For inquiries or privacy concerns, contact:
                </p>
                <div className="border border-[#17252A]/15 p-4 rounded-[4px] bg-[#DEF2F1]/20 text-xs space-y-1">
                  <div><strong>Operator:</strong> {legalMeta.organisationName}</div>
                  <div><strong>Privacy Inquiries:</strong> {legalMeta.contactEmail}</div>
                  <div><strong>Support:</strong> {legalMeta.supportEmail}</div>
                  <div><strong>Governing Jurisdiction:</strong> {legalMeta.governingLaw}</div>
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
