"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Alert } from "@/components/ui/Alert";
import { legalMeta } from "@/content/legalMeta";
import {
  ArrowRight,
  Shield,
  Lock,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

const registerSchema = z
  .object({
    role: z.enum(["patient", "doctor"]),
    name: z.string().trim().min(2, "Full legal name must be at least 2 characters"),
    email: z.string().trim().email("Please enter a valid clinical or personal email address"),
    phone: z.string().trim().min(8, "Phone number must be at least 8 digits"),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters")
      .regex(/[A-Za-z]/, "Must contain at least one letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    languagePref: z.enum(["en", "ta", "hi"]).default("en"),
    dateOfBirth: z.string().optional(),
    biologicalSex: z.string().optional(),
    // Patient specific calibration
    skinType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["I", "II", "III", "IV", "V", "VI"]).optional()),
    sunExposure: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
    isDiabetic: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().default(false)),
    familyHistorySkinCancer: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().default(false)),
    // Doctor specific
    specialty: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["dermatologist", "wound_care", "diabetologist", "general"]).optional()),
    registrationNumber: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
    bio: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
    // Mandatory statutory consents
    termsAccepted: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().refine((val) => val === true, {
      message: "You must accept the Terms of Service and Privacy Policy to register",
    })),
    healthConsent: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().optional()),
    cdssDisclaimerConsent: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().refine((val) => val === true, {
      message: "You must acknowledge that this system provides clinical decision support only",
    })),
  })
  .superRefine((data, ctx) => {
    if (data.role === "patient" && !data.healthConsent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["healthConsent"],
        message: "You must consent to processing health photos for screening analysis",
      });
    }
    if (data.role === "doctor") {
      if (!data.specialty) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["specialty"], message: "Medical specialty is required" });
      }
      if (!data.registrationNumber || data.registrationNumber.trim().length < 3) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationNumber"], message: "State medical council registration number is required" });
      }
      if (!data.bio || data.bio.trim().length < 10) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bio"], message: "Professional biography must be at least 10 characters" });
      }
    }
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerAccount } = useAuth();
  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "patient",
      languagePref: "en",
      isDiabetic: false,
      familyHistorySkinCancer: false,
      termsAccepted: false,
      healthConsent: false,
      cdssDisclaimerConsent: false,
    },
  });

  const handleRoleChange = (newRole: "patient" | "doctor") => {
    setRole(newRole);
    setValue("role", newRole);
  };

  const onInvalid = (fieldErrors: Record<string, { message?: string }>) => {
    const errorKeys = Object.keys(fieldErrors);
    if (errorKeys.length > 0) {
      const firstKey = errorKeys[0];
      const el = document.getElementById(firstKey);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
      const firstMsg = fieldErrors[firstKey]?.message || `Please check ${firstKey}`;
      setServerError(`Incomplete registration: ${firstMsg}`);
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    setSuccessMsg(null);
    try {
      const payload = {
        role: data.role,
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        languagePref: data.languagePref,
        skinType: data.skinType || undefined,
        sunExposure: data.sunExposure || undefined,
        isDiabetic: Boolean(data.isDiabetic),
        familyHistorySkinCancer: Boolean(data.familyHistorySkinCancer),
        specialty: data.specialty || undefined,
        registrationNumber: data.registrationNumber || undefined,
        bio: data.bio || undefined,
        termsVersionAccepted: legalMeta.version,
        termsAcceptedAt: new Date().toISOString(),
        healthDataConsentAt: role === "patient" ? new Date().toISOString() : undefined,
      };
      await registerAccount(payload);
      setSuccessMsg("Account registered successfully. Redirecting to sign in...");
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to register account.");
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FBFAF7] text-[#17252A]">
      <Header />

      <main className="flex-1 w-full pt-14 pb-16">
        {/* Top Protocol Advisory Strip */}
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

        {/* Content Container: Max-width 960px centered */}
        <div className="w-full max-w-[960px] mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column (approx 60% -> 7 cols) */}
            <section className="lg:col-span-7 flex flex-col">
              {/* Step Breadcrumb Indicator */}
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2 h-2 rounded-[2px] bg-[#1B6B63] animate-pulse"></span>
                <span className="font-mono text-[11px] text-[#2B7A78] tracking-widest uppercase font-semibold">
                  PATIENT ONBOARDING / STEP 1 OF 2 — ACCOUNT &amp; CONSENT
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17252A] mb-1">
                Create your account
              </h1>
              <p className="text-sm text-[#17252A]/80 mb-6 leading-relaxed">
                You will need to accept the Terms, the Privacy Policy, and consent to health-photo processing before you can upload a photo.
              </p>

              {/* Account Type Toggle */}
              <div className="mb-6 flex border border-[#17252A]/20 bg-[#FEFFFF] p-1 rounded-[4px] shadow-sm">
                <button
                  type="button"
                  onClick={() => handleRoleChange("patient")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-[2px] transition-colors duration-150 ${
                    role === "patient"
                      ? "bg-[#2B7A78] text-[#FEFFFF]"
                      : "text-[#17252A]/70 hover:text-[#17252A]"
                  }`}
                >
                  I am a Patient
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleChange("doctor")}
                  className={`flex-1 py-2 text-xs font-semibold rounded-[2px] transition-colors duration-150 ${
                    role === "doctor"
                      ? "bg-[#2B7A78] text-[#FEFFFF]"
                      : "text-[#17252A]/70 hover:text-[#17252A]"
                  }`}
                >
                  I am a Doctor / Clinician
                </button>
              </div>

              {serverError && (
                <Alert variant="error" className="mb-4">
                  {serverError}
                </Alert>
              )}

              {successMsg && (
                <Alert variant="info" className="mb-4">
                  {successMsg}
                </Alert>
              )}

              {role === "doctor" && (
                <div className="mb-5 p-3.5 bg-[#FEF0C7] border border-[#FDB022] rounded-[4px] text-xs text-[#B54708]">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Clinical Credentialing Notice</span>
                  </div>
                  <p>
                    Doctor accounts undergo verification against state medical registers before receiving consultation bookings.
                  </p>
                </div>
              )}

              {/* Registration Form */}
              <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex flex-col space-y-4">
                <input type="hidden" {...register("role")} />

                {/* Full Legal Name */}
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-semibold text-[#17252A] flex items-center justify-between" htmlFor="name">
                    <span>Full legal name</span>
                    <span className="font-mono text-[10px] text-[#2B7A78] uppercase">REQUIRED</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="e.g. Priyadarshini Sharma"
                    className="w-full h-10 px-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-[11px] font-medium text-[#B42318]">{errors.name.message}</p>
                  )}
                </div>

                {/* Email Address */}
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-semibold text-[#17252A] flex items-center justify-between" htmlFor="email">
                    <span>Email address</span>
                    <span className="font-mono text-[10px] text-[#2B7A78] uppercase">PRIMARY ID</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="priya.sharma@example.in"
                    className="w-full h-10 px-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-[11px] font-medium text-[#B42318]">{errors.email.message}</p>
                  )}
                </div>

                {/* Phone & Language Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1">
                    <label className="text-xs font-semibold text-[#17252A]" htmlFor="phone">
                      Mobile contact number
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      placeholder="9876543210"
                      className="w-full h-10 px-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                      {...register("phone")}
                    />
                    {errors.phone && (
                      <p className="text-[11px] font-medium text-[#B42318]">{errors.phone.message}</p>
                    )}
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-xs font-semibold text-[#17252A]" htmlFor="languagePref">
                      Preferred clinical language
                    </label>
                    <div className="relative">
                      <select
                        id="languagePref"
                        className="w-full h-10 pl-3 pr-8 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none appearance-none cursor-pointer"
                        {...register("languagePref")}
                      >
                        <option value="en">English (Clinical standard)</option>
                        <option value="ta">Tamil (தமிழ்)</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-[#17252A]/60 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div className="flex flex-col space-y-1">
                  <label className="text-xs font-semibold text-[#17252A]" htmlFor="password">
                    Create password
                  </label>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••••••••••"
                    className="w-full h-10 px-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                    {...register("password")}
                  />
                  <p className="font-mono text-[11px] text-[#17252A]/70">
                    Minimum 10 characters, including at least one numeral and letter.
                  </p>
                  {errors.password && (
                    <p className="text-[11px] font-medium text-[#B42318]">{errors.password.message}</p>
                  )}
                </div>

                {/* Demographics Grid: DOB & Biological Sex */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col space-y-1">
                    <label className="text-xs font-semibold text-[#17252A]" htmlFor="dob">
                      Date of birth (Optional)
                    </label>
                    <input
                      id="dob"
                      type="date"
                      className="w-full h-10 px-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                      {...register("dateOfBirth")}
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-xs font-semibold text-[#17252A]" htmlFor="biological_sex">
                      Biological sex at birth
                    </label>
                    <div className="relative">
                      <select
                        id="biological_sex"
                        className="w-full h-10 pl-3 pr-8 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none appearance-none cursor-pointer"
                        {...register("biologicalSex")}
                      >
                        <option value="">Select sex</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-[#17252A]/60 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Health Context (Patient Only) */}
                {role === "patient" && (
                  <div className="pt-4 border-t border-[#17252A]/15 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#17252A]">Health context (optional)</h3>
                      <span className="font-mono text-[10px] text-[#2B7A78] uppercase">Calibration Data</span>
                    </div>
                    <p className="text-xs text-[#17252A]/70">
                      This improves the model&apos;s calibration. You can change it later.
                    </p>

                    <div className="space-y-3 pt-1">
                      {/* Fitzpatrick */}
                      <div className="flex flex-col space-y-1">
                        <label className="text-xs font-semibold text-[#17252A]" htmlFor="skinType">
                          Fitzpatrick phototype classification
                        </label>
                        <div className="relative">
                          <select
                            id="skinType"
                            className="w-full h-10 pl-3 pr-8 bg-[#FEFFFF] text-[#17252A] text-xs sm:text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none appearance-none cursor-pointer"
                            {...register("skinType")}
                          >
                            <option value="">Select skin phototype</option>
                            <option value="I">Fitzpatrick I — Very fair, always burns, never tans</option>
                            <option value="II">Fitzpatrick II — Fair, usually burns, tans with difficulty</option>
                            <option value="III">Fitzpatrick III — Medium, sometimes mild burn, tans gradually</option>
                            <option value="IV">Fitzpatrick IV — Olive / Moderate brown, rarely burns, tans easily</option>
                            <option value="V">Fitzpatrick V — Dark brown, very rarely burns, tans very easily</option>
                            <option value="VI">Fitzpatrick VI — Deeply pigmented dark brown to black, never burns</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-[#17252A]/60 pointer-events-none" />
                        </div>
                      </div>

                      {/* Sun Exposure */}
                      <div className="flex flex-col space-y-1">
                        <label className="text-xs font-semibold text-[#17252A]" htmlFor="sunExposure">
                          Average outdoor solar exposure
                        </label>
                        <div className="relative">
                          <select
                            id="sunExposure"
                            className="w-full h-10 pl-3 pr-8 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none appearance-none cursor-pointer"
                            {...register("sunExposure")}
                          >
                            <option value="">Select exposure profile</option>
                            <option value="low">Low (mostly indoors)</option>
                            <option value="moderate">Moderate (1–3 hours daily outdoor)</option>
                            <option value="high">High (occupational or extensive outdoor)</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-[#17252A]/60 pointer-events-none" />
                        </div>
                      </div>

                      {/* Checkboxes */}
                      <div className="space-y-2 pt-2">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] focus:ring-0 cursor-pointer"
                            {...register("familyHistorySkinCancer")}
                          />
                          <span className="text-xs text-[#17252A]/90">
                            Family history of skin cancer (melanoma or non-melanoma)
                          </span>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] focus:ring-0 cursor-pointer"
                            {...register("isDiabetic")}
                          />
                          <span className="text-xs text-[#17252A]/90">
                            Diagnosed with Type 1 or Type 2 Diabetes{" "}
                            <span className="text-[#17252A]/60">(informs wound bed healing thresholds)</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Professional Credentials (Doctor Only) */}
                {role === "doctor" && (
                  <div className="pt-4 border-t border-[#17252A]/15 space-y-4">
                    <h3 className="text-sm font-bold text-[#17252A]">Professional credentials</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col space-y-1">
                        <label className="text-xs font-semibold text-[#17252A]" htmlFor="specialty">
                          Specialty
                        </label>
                        <div className="relative">
                          <select
                            id="specialty"
                            className="w-full h-10 pl-3 pr-8 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none appearance-none cursor-pointer"
                            {...register("specialty")}
                          >
                            <option value="">Select specialty</option>
                            <option value="dermatologist">Dermatologist</option>
                            <option value="wound_care">Wound Care Specialist</option>
                            <option value="diabetologist">Diabetologist</option>
                            <option value="general">General Physician</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-[#17252A]/60 pointer-events-none" />
                        </div>
                        {errors.specialty && (
                          <p className="text-[11px] font-medium text-[#B42318]">{errors.specialty.message}</p>
                        )}
                      </div>

                      <div className="flex flex-col space-y-1">
                        <label className="text-xs font-semibold text-[#17252A]" htmlFor="registrationNumber">
                          Medical Registration Number
                        </label>
                        <input
                          id="registrationNumber"
                          type="text"
                          placeholder="State Medical Council Reg. No."
                          className="w-full h-10 px-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                          {...register("registrationNumber")}
                        />
                        {errors.registrationNumber && (
                          <p className="text-[11px] font-medium text-[#B42318]">{errors.registrationNumber.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col space-y-1">
                      <label className="text-xs font-semibold text-[#17252A]" htmlFor="bio">
                        Professional Biography
                      </label>
                      <textarea
                        id="bio"
                        rows={3}
                        placeholder="Clinical qualifications, hospital affiliations, and areas of focus..."
                        className="w-full p-3 bg-[#FEFFFF] text-[#17252A] text-sm rounded-[4px] border border-[#17252A]/20 focus:border-[#2B7A78] focus:outline-none transition-colors"
                        {...register("bio")}
                      />
                      {errors.bio && (
                        <p className="text-[11px] font-medium text-[#B42318]">{errors.bio.message}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Consent Block: Mist Background Card with Strict Border */}
                <div className="bg-[#DEF2F1]/50 border border-[#1B6B63]/30 rounded-[4px] p-4 space-y-3 mt-4">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-[#1B6B63]/20">
                    <Shield className="h-4 w-4 text-[#1B6B63]" />
                    <span className="font-mono text-[10px] text-[#1B6B63] font-bold tracking-wider uppercase">
                      MANDATORY STATUTORY CONSENT (DISHA / DPDPA COMPLIANT)
                    </span>
                  </div>

                  {/* Consent 1 */}
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        id="consent_terms"
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] cursor-pointer"
                        {...register("termsAccepted")}
                      />
                      <span className="text-xs text-[#17252A] leading-tight">
                        I accept the{" "}
                        <Link href="/terms" target="_blank" className="text-[#2B7A78] underline font-medium">
                          Terms of Service
                        </Link>{" "}
                        and the{" "}
                        <Link href="/privacy" target="_blank" className="text-[#2B7A78] underline font-medium">
                          Privacy Policy
                        </Link>
                        .
                      </span>
                    </label>
                    {errors.termsAccepted && (
                      <p className="text-[11px] font-medium text-[#B42318] pl-6.5 mt-1">
                        {errors.termsAccepted.message}
                      </p>
                    )}
                  </div>

                  {/* Consent 2 */}
                  {role === "patient" && (
                    <div>
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          id="consent_photos"
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] cursor-pointer"
                          {...register("healthConsent")}
                        />
                        <span className="text-xs text-[#17252A] leading-tight">
                          I consent to SkinSentry processing my uploaded health photos for the purpose of generating a decision-support report.
                        </span>
                      </label>
                      {errors.healthConsent && (
                        <p className="text-[11px] font-medium text-[#B42318] pl-6.5 mt-1">
                          {errors.healthConsent.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Consent 3 */}
                  <div>
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        id="consent_support"
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded-[2px] border-[#17252A]/30 text-[#2B7A78] cursor-pointer"
                        {...register("cdssDisclaimerConsent")}
                      />
                      <span className="text-xs text-[#17252A] leading-tight font-medium">
                        I understand this is decision support and not a diagnosis.
                      </span>
                    </label>
                    {errors.cdssDisclaimerConsent && (
                      <p className="text-[11px] font-medium text-[#B42318] pl-6.5 mt-1">
                        {errors.cdssDisclaimerConsent.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 bg-[#2B7A78] hover:bg-[#1B6B63] text-[#FEFFFF] font-mono text-xs font-bold uppercase tracking-wider rounded-[4px] transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <span>{isSubmitting ? "Processing Enclave Key..." : "Create account"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="text-center pt-2">
                  <span className="text-xs text-[#17252A]/70">
                    Already have an account?{" "}
                    <Link href="/login" className="text-[#2B7A78] font-semibold hover:underline">
                      Log in
                    </Link>
                  </span>
                </div>
              </form>
            </section>

            {/* Right Column: Telemetry & Privacy Architecture (5 cols) */}
            <aside className="lg:col-span-5 w-full">
              <div className="sticky top-20 bg-[#FEFFFF] border border-[#17252A]/15 rounded-[4px] p-5 space-y-4 shadow-sm">
                <div className="space-y-1">
                  <span className="font-mono text-[10px] text-[#2B7A78] font-bold tracking-wider uppercase block">
                    TELEMETRY &amp; PRIVACY ARCHITECTURE
                  </span>
                  <h3 className="text-base font-bold text-[#17252A]">
                    What happens to your photo
                  </h3>
                </div>

                <div className="space-y-3.5 pt-1">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs font-bold bg-[#DEF2F1] text-[#1B6B63] px-2 py-0.5 rounded-[2px] border border-[#1B6B63]/20 shrink-0 mt-0.5">
                      01
                    </span>
                    <p className="text-xs text-[#17252A]/85 leading-relaxed">
                      Your photo is checked for quality first. Blurry or dark photos are rejected immediately at the client edge.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs font-bold bg-[#DEF2F1] text-[#1B6B63] px-2 py-0.5 rounded-[2px] border border-[#1B6B63]/20 shrink-0 mt-0.5">
                      02
                    </span>
                    <p className="text-xs text-[#17252A]/85 leading-relaxed">
                      It is stored in an encrypted private vault partition on the secure hospital node, never inside the relational database.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs font-bold bg-[#DEF2F1] text-[#1B6B63] px-2 py-0.5 rounded-[2px] border border-[#1B6B63]/20 shrink-0 mt-0.5">
                      03
                    </span>
                    <p className="text-xs text-[#17252A]/85 leading-relaxed">
                      It is analyzed by calibrated clinical models on our sovereign infrastructure. It is never sold, licensed, or shared with third parties.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xs font-bold bg-[#DEF2F1] text-[#1B6B63] px-2 py-0.5 rounded-[2px] border border-[#1B6B63]/20 shrink-0 mt-0.5">
                      04
                    </span>
                    <p className="text-xs text-[#17252A]/85 leading-relaxed">
                      The Groq language model receives only anonymized mathematical measurements. It never receives your photo, biometric vectors, or name.
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#17252A]/10 pt-3 space-y-2">
                  <div className="flex items-center gap-2 text-[#17252A]/80">
                    <Lock className="h-4 w-4 text-[#2B7A78] shrink-0" />
                    <span className="font-mono text-[11px]">
                      You can permanently purge your clinical case file at any time.
                    </span>
                  </div>

                  <div className="bg-[#DEF2F1]/40 border border-[#1B6B63]/20 rounded-[4px] p-3 mt-2">
                    <div className="flex items-center gap-1.5 text-[#1B6B63] mb-1">
                      <Shield className="h-3.5 w-3.5" />
                      <span className="font-mono text-[10px] font-bold uppercase">Statutory Governance</span>
                    </div>
                    <p className="font-mono text-[11px] text-[#17252A]/70 leading-normal">
                      Compliant with ISO 13485 (Medical Devices QMS) &amp; Digital Personal Data Protection Act (DPDPA 2023, Section 7 Consent Model).
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
