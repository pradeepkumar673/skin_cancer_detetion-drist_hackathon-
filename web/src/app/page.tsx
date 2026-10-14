"use client";

import React from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const startCheckHref = isAuthenticated ? "/cases/new" : "/login";

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFAF7] text-[#0E1F1E]">
      {/* 1. Sticky Navigation Header */}
      <Header />

      {/* 2. Mandatory Clinical Protocol Advisory Strip */}
      <aside
        className="w-full bg-[#E8F3F1] border-b border-[#D8DDDB] py-2 px-6"
        aria-label="Clinical Protocol Advisory"
      >
        <div className="max-w-[1120px] mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[13px] text-[#0E1F1E]">
            {/* Shield Check SVG */}
            <svg
              className="w-4 h-4 text-[#1B6B63] flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
            <span>
              <strong className="font-semibold">Decision support only.</strong> A low-risk result never proves there is no problem. A doctor makes the diagnosis.
            </span>
          </div>
          <span className="hidden lg:inline text-[11px] font-mono text-[#5A6B69]">
            IEC 62304 / ISO 13485 COMPLIANT WORKFLOW
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1120px] mx-auto px-6">
        {/* 3. Hero Section (7/5 Split Layout) */}
        <section className="py-12 border-b border-[#D8DDDB]" id="overview">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column (7 cols) */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="inline-flex items-center space-x-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-[#1B6B63]"></span>
                <span className="text-[12px] font-mono tracking-wide text-[#5A6B69] uppercase">
                  Clinical Verification Platform
                </span>
              </div>

              <h1 className="text-[28px] leading-[34px] tracking-[-0.01em] font-semibold text-[#0E1F1E] mb-4">
                Check a skin lesion, wound, or rash, then talk to a doctor.
              </h1>

              <p className="text-[14px] leading-[22px] text-[#5A6B69] max-w-[60ch] mb-6">
                Upload a photo. SkinSentry measures the area, estimates how concerning it looks, and shows which parts of the image drove the result. Then book a verified doctor for a chat, audio, or video consultation. It supports a doctor&apos;s decision. It does not replace one.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <Link
                  href={startCheckHref}
                  className="inline-flex items-center text-[14px] font-medium text-white bg-[#1B6B63] hover:bg-[#2B7A78] px-5 py-2.5 rounded-[4px] border border-[#1B6B63] transition-colors"
                >
                  <span>Start a check</span>
                  <svg
                    className="ml-2 w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center text-[14px] font-medium text-[#0E1F1E] bg-[#FFFFFF] hover:bg-[#F2F1ED] px-5 py-2.5 rounded-[4px] border border-[#D8DDDB] transition-colors"
                >
                  How it works
                </Link>
              </div>

              {/* Three Stat Chips */}
              <div className="pt-4 border-t border-[#D8DDDB] flex flex-wrap items-center gap-2">
                <Link
                  href="/performance"
                  className="inline-flex items-center px-2.5 py-1 text-[12px] text-[#0E1F1E] bg-white border border-[#D8DDDB] rounded-[4px] hover:border-[#1B6B63] transition-colors"
                >
                  <span className="font-mono font-medium text-[#1B6B63] mr-1.5">12</span> models
                </Link>
                <div className="inline-flex items-center px-2.5 py-1 text-[12px] text-[#0E1F1E] bg-white border border-[#D8DDDB] rounded-[4px]">
                  <span className="font-mono text-[#5A6B69] mr-1.5">Groq-powered</span> explanation in English, Tamil, Hindi
                </div>
                <Link
                  href="/doctors"
                  className="inline-flex items-center px-2.5 py-1 text-[12px] text-[#0E1F1E] bg-white border border-[#D8DDDB] rounded-[4px] hover:border-[#1B6B63] transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 text-[#1E6B3A] mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Verified doctors only
                </Link>
              </div>
            </div>

            {/* Right Column (5 cols): 340 x 380 px SVG Pipeline Diagram */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <div className="w-[340px] h-[380px] bg-white border border-[#D8DDDB] rounded-[4px] p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-[#D8DDDB]">
                  <span className="text-[11px] font-mono text-[#5A6B69] uppercase tracking-wider">
                    Inference &amp; Triage Flow
                  </span>
                  <span className="text-[11px] font-mono text-[#1B6B63]">6-STEP PIPELINE</span>
                </div>

                <svg
                  viewBox="0 0 316 320"
                  width="316"
                  height="320"
                  className="w-full h-auto"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Clinical screening pipeline 6-step flow"
                >
                  <defs>
                    <marker
                      id="stitch-arrow"
                      viewBox="0 0 6 6"
                      refX="3"
                      refY="3"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 6 3 L 0 6 z" fill="#5A6B69" />
                    </marker>
                    <marker
                      id="stitch-arrow-teal"
                      viewBox="0 0 6 6"
                      refX="3"
                      refY="3"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 6 3 L 0 6 z" fill="#1B6B63" />
                    </marker>
                  </defs>

                  {/* Node 1: Patient photo upload */}
                  <g transform="translate(8, 6)">
                    <rect width="300" height="36" rx="4" fill="#FFFFFF" stroke="#D8DDDB" strokeWidth="1" />
                    <text x="14" y="22" fontFamily="'IBM Plex Sans', sans-serif" fontSize="12" fontWeight="500" fill="#0E1F1E">
                      1. Patient photo upload
                    </text>
                    <text x="286" y="22" fontFamily="'IBM Plex Mono', monospace" fontSize="11" fill="#5A6B69" textAnchor="end">
                      INPUT
                    </text>
                  </g>

                  {/* Arrow 1 -> 2 */}
                  <line x1="158" y1="42" x2="158" y2="55" stroke="#5A6B69" strokeWidth="1" markerEnd="url(#stitch-arrow)" />

                  {/* Node 2: Quality gate */}
                  <g transform="translate(8, 56)">
                    <rect width="300" height="36" rx="4" fill="#FFFFFF" stroke="#D8DDDB" strokeWidth="1" />
                    <text x="14" y="22" fontFamily="'IBM Plex Sans', sans-serif" fontSize="12" fontWeight="500" fill="#0E1F1E">
                      2. Quality gate
                    </text>
                    <text x="286" y="22" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill="#5A6B69" textAnchor="end">
                      FOCUS / LIGHT
                    </text>
                  </g>

                  {/* Arrow 2 -> 3 */}
                  <line x1="158" y1="92" x2="158" y2="105" stroke="#5A6B69" strokeWidth="1" markerEnd="url(#stitch-arrow)" />

                  {/* Node 3: Nurses */}
                  <g transform="translate(8, 106)">
                    <rect width="300" height="36" rx="4" fill="#FFFFFF" stroke="#D8DDDB" strokeWidth="1" />
                    <text x="14" y="22" fontFamily="'IBM Plex Sans', sans-serif" fontSize="12" fontWeight="500" fill="#0E1F1E">
                      3. Nurses (is this our kind of image?)
                    </text>
                  </g>

                  {/* Arrow 3 -> 4 */}
                  <line x1="158" y1="142" x2="158" y2="155" stroke="#5A6B69" strokeWidth="1" markerEnd="url(#stitch-arrow)" />

                  {/* Node 4: Specialist teams */}
                  <g transform="translate(8, 156)">
                    <rect width="300" height="36" rx="4" fill="#FFFFFF" stroke="#D8DDDB" strokeWidth="1" />
                    <text x="14" y="22" fontFamily="'IBM Plex Sans', sans-serif" fontSize="12" fontWeight="500" fill="#0E1F1E">
                      4. Specialist teams (lesion / wound / rash)
                    </text>
                  </g>

                  {/* Arrow 4 -> 5 */}
                  <line x1="158" y1="192" x2="158" y2="205" stroke="#5A6B69" strokeWidth="1" markerEnd="url(#stitch-arrow)" />

                  {/* Node 5: Safety layer */}
                  <g transform="translate(8, 206)">
                    <rect width="300" height="36" rx="4" fill="#FFFFFF" stroke="#D8DDDB" strokeWidth="1" />
                    <text x="14" y="22" fontFamily="'IBM Plex Sans', sans-serif" fontSize="12" fontWeight="500" fill="#0E1F1E">
                      5. Safety layer &amp; plain-language explanation
                    </text>
                  </g>

                  {/* Arrow 5 -> 6 */}
                  <line x1="158" y1="242" x2="158" y2="255" stroke="#1B6B63" strokeWidth="1" markerEnd="url(#stitch-arrow-teal)" />

                  {/* Node 6: Clinician sign-off */}
                  <g transform="translate(8, 256)">
                    <rect width="300" height="42" rx="4" fill="#1B6B63" stroke="#1B6B63" strokeWidth="1" />
                    <text x="14" y="26" fontFamily="'IBM Plex Sans', sans-serif" fontSize="13" fontWeight="600" fill="#FFFFFF">
                      6. Verified doctor consultation
                    </text>
                    <text x="286" y="26" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill="#E8F3F1" textAnchor="end">
                      CLINICIAN SIGN-OFF
                    </text>
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Section: What it checks (Three equal columns) */}
        <section className="py-12 border-b border-[#D8DDDB]" id="how-it-works">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <h2 className="text-[20px] leading-[26px] tracking-[-0.005em] font-semibold text-[#0E1F1E]">
                What it checks
              </h2>
              <p className="text-[13px] text-[#5A6B69] mt-1">
                Segmented anatomical evaluation using dedicated neural model ensembles.
              </p>
            </div>
            <span className="text-[12px] font-mono text-[#5A6B69] uppercase">SCOPE OF PROTOCOLS</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Skin lesions */}
            <article className="bg-[#FFFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <svg
                    className="w-4 h-4 text-[#0E1F1E]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="8" strokeDasharray="2 2" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <h3 className="text-[15px] leading-[22px] font-semibold text-[#0E1F1E]">
                    Skin lesions (moles and spots)
                  </h3>
                </div>
                <p className="text-[14px] leading-[22px] text-[#5A6B69]">
                  Sorts a lesion into one of seven types seen in dermoscopy images, outlines it, and scores asymmetry, border, colour, and diameter. Gives an estimated likelihood with a range, not a diagnosis.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-[#D8DDDB] flex items-center justify-between text-[11px] font-mono text-[#5A6B69]">
                <span>ABCD CRITERIA</span>
                <span>HAM10000 / ISIC</span>
              </div>
            </article>

            {/* Card 2: Wounds and ulcers */}
            <article className="bg-[#FFFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <svg
                    className="w-4 h-4 text-[#0E1F1E]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m10 16V8m-5 12V12" />
                  </svg>
                  <h3 className="text-[15px] leading-[22px] font-semibold text-[#0E1F1E]">
                    Wounds and ulcers
                  </h3>
                </div>
                <p className="text-[14px] leading-[22px] text-[#5A6B69]">
                  Outlines the wound, estimates its area and tissue colours, and compares your photos over time to show whether it is healing, stalled, or getting worse.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-[#D8DDDB] flex items-center justify-between text-[11px] font-mono text-[#5A6B69]">
                <span>AREA &amp; TISSUE BED</span>
                <span>TIME-SERIES DELTA</span>
              </div>
            </article>

            {/* Card 3: Skin conditions */}
            <article className="bg-[#FFFFFF] border border-[#D8DDDB] rounded-[4px] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <svg
                    className="w-4 h-4 text-[#0E1F1E]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <h3 className="text-[15px] leading-[22px] font-semibold text-[#0E1F1E]">
                    Skin conditions
                  </h3>
                </div>
                <p className="text-[14px] leading-[22px] text-[#5A6B69]">
                  Lists up to three possible conditions from a limited set, or says it is not sure.
                </p>
              </div>
              <div className="mt-6 pt-3 border-t border-[#D8DDDB] flex items-center justify-between text-[11px] font-mono text-[#5A6B69]">
                <span>TOP-3 DIFFERENTIAL</span>
                <span>UNCERTAINTY FLAG</span>
              </div>
            </article>
          </div>
        </section>

        {/* 5. Section: What it cannot do (Regulatory danger panel) */}
        <section className="py-12" id="limitations">
          <div className="bg-[#FDECEA] border border-[#B42318]/30 rounded-[4px] p-5">
            <div className="flex items-start space-x-3">
              <svg
                className="w-5 h-5 text-[#B42318] flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[15px] leading-[22px] font-semibold text-[#B42318]">
                    What it cannot do
                  </h3>
                  <span className="text-[11px] font-mono font-medium text-[#B42318] uppercase">
                    Regulatory Notice
                  </span>
                </div>
                <p className="text-[14px] leading-[22px] text-[#0E1F1E]">
                  It cannot diagnose. It cannot rule out a problem. Photos taken with a phone are less reliable than clinical images. It was trained on public image sets that contain mostly lighter skin tones, so it may be less reliable on darker skin. Read the measured results and limits on the Model performance page.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 6. Footer */}
      <footer className="mt-auto bg-[#FBFAF7] border-t border-[#D8DDDB]">
        {/* Row 1: Repeated clinical disclaimer */}
        <div className="bg-[#E8F3F1] border-b border-[#D8DDDB] py-2 px-6">
          <div className="max-w-[1120px] mx-auto flex items-center justify-between text-[13px] text-[#0E1F1E]">
            <div className="flex items-center space-x-2">
              <svg
                className="w-4 h-4 text-[#1B6B63] flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>
                <strong className="font-semibold">Decision support only.</strong> A low-risk result never proves there is no problem. A doctor makes the diagnosis.
              </span>
            </div>
            <span className="hidden md:inline text-[11px] font-mono text-[#5A6B69]">
              FOR LICENSED CLINICIANS &amp; PATIENT TRIAGE
            </span>
          </div>
        </div>

        <div className="max-w-[1120px] mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[13px]">
            <div>
              <div className="text-[#0E1F1E] font-medium">SkinSentry Clinical Informatics System</div>
              <div className="text-[#5A6B69] text-[12px] mt-0.5">
                © 2025 SkinSentry. Governed by the Laws of India and Central Drugs Standard Control Organisation (CDSCO) guidelines for clinical decision support systems.
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-6 text-[13px]">
              <Link href="/privacy" className="text-[#5A6B69] hover:text-[#0E1F1E] transition-colors py-1">
                Privacy
              </Link>
              <Link href="/terms" className="text-[#5A6B69] hover:text-[#0E1F1E] transition-colors py-1">
                Terms
              </Link>
              <Link href="/performance" className="text-[#5A6B69] hover:text-[#0E1F1E] transition-colors py-1">
                Model performance
              </Link>
              <Link href="/doctors" className="text-[#5A6B69] hover:text-[#0E1F1E] transition-colors py-1">
                Specialists
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
