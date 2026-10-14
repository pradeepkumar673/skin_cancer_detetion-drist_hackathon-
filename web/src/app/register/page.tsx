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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

import { legalMeta } from "@/content/legalMeta";

const registerSchema = z
  .object({
    role: z.enum(["patient", "doctor"]),
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().email("Please enter a valid clinical email"),
    phone: z.string().trim().min(8, "Phone number must be at least 8 digits"),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters")
      .regex(/[A-Za-z]/, "Must contain at least one letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    languagePref: z.enum(["en", "ta", "hi"]).default("en"),
    // Patient specific
    skinType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["I", "II", "III", "IV", "V", "VI"]).optional()),
    sunExposure: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
    isDiabetic: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().default(false)),
    familyHistorySkinCancer: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().default(false)),
    // Doctor specific
    specialty: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["dermatologist", "wound_care", "diabetologist", "general"]).optional()),
    registrationNumber: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
    bio: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
    // Consent
    termsAccepted: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().refine((val) => val === true, {
      message: "You must accept the Terms and Conditions and Privacy Policy to register",
    })),
    healthConsent: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean().optional()),
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["specialty"], message: "Specialty is required" });
      }
      if (!data.registrationNumber || data.registrationNumber.trim().length < 3) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationNumber"], message: "Medical registration number is required" });
      }
      if (!data.bio || data.bio.trim().length < 10) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bio"], message: "Bio must be at least 10 characters" });
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
      setServerError(`Incomplete form: ${firstMsg}`);
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
    <div className="flex min-h-screen flex-col bg-[#FEFFFF]">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <Card className="border-[#17252A]/20">
            <CardHeader>
              <CardTitle>Create an Account</CardTitle>
              <CardDescription>
                Register as a patient for personal skin monitoring or as a licensed doctor.
              </CardDescription>
            </CardHeader>

            <CardContent>
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

              {/* Role selection tabs */}
              <div className="mb-6 flex border border-[#17252A]/15 p-1" style={{ borderRadius: "4px" }}>
                <button
                  type="button"
                  onClick={() => handleRoleChange("patient")}
                  style={{ borderRadius: "2px" }}
                  className={`flex-1 py-1.5 text-xs font-semibold transition-colors duration-150 ${
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
                  style={{ borderRadius: "2px" }}
                  className={`flex-1 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    role === "doctor"
                      ? "bg-[#2B7A78] text-[#FEFFFF]"
                      : "text-[#17252A]/70 hover:text-[#17252A]"
                  }`}
                >
                  I am a Doctor
                </button>
              </div>

              {role === "doctor" && (
                <Alert variant="warning" className="mb-4">
                  Clinical Verification Notice: Doctor accounts must be verified by an administrator
                  before appearing to patients in the consultation directory.
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                <input type="hidden" {...register("role")} />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Full Name" htmlFor="name" error={errors.name?.message} required>
                    <Input id="name" placeholder="Dr. Jane Smith" {...register("name")} />
                  </FormField>

                  <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
                    <Input id="email" type="email" placeholder="jane@clinic.org" {...register("email")} />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Phone Number" htmlFor="phone" error={errors.phone?.message} required>
                    <Input id="phone" placeholder="9876543210" {...register("phone")} />
                  </FormField>

                  <FormField label="Preferred Language" htmlFor="languagePref">
                    <Select id="languagePref" {...register("languagePref")}>
                      <option value="en">English (en)</option>
                      <option value="ta">Tamil (ta)</option>
                      <option value="hi">Hindi (hi)</option>
                    </Select>
                  </FormField>
                </div>

                <FormField
                  label="Password"
                  htmlFor="password"
                  hint="At least 10 characters with at least one letter and one number"
                  error={errors.password?.message}
                  required
                >
                  <Input id="password" type="password" {...register("password")} />
                </FormField>

                {/* Patient Profile Fields */}
                {role === "patient" && (
                  <div className="space-y-4 border-t border-[#17252A]/10 pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#17252A]/60">
                      Medical Profile (Optional)
                    </h4>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Fitzpatrick Skin Type" htmlFor="skinType">
                        <Select id="skinType" {...register("skinType")}>
                          <option value="">Select skin type</option>
                          <option value="I">Type I (Pale, always burns)</option>
                          <option value="II">Type II (Fair, usually burns)</option>
                          <option value="III">Type III (Medium, sometimes burns)</option>
                          <option value="IV">Type IV (Olive, rarely burns)</option>
                          <option value="V">Type V (Brown, very rarely burns)</option>
                          <option value="VI">Type VI (Dark brown / black, never burns)</option>
                        </Select>
                      </FormField>

                      <FormField label="Typical Sun Exposure" htmlFor="sunExposure">
                        <Select id="sunExposure" {...register("sunExposure")}>
                          <option value="">Select exposure</option>
                          <option value="low">Low (mostly indoors)</option>
                          <option value="moderate">Moderate (daily outdoor commutes)</option>
                          <option value="high">High (outdoor occupation / sports)</option>
                        </Select>
                      </FormField>
                    </div>

                    <div className="space-y-2 pt-1 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 border-[#17252A]/20 text-[#2B7A78] focus:ring-[#2B7A78]"
                          {...register("familyHistorySkinCancer")}
                        />
                        <span>Family history of skin cancer or melanoma</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 border-[#17252A]/20 text-[#2B7A78] focus:ring-[#2B7A78]"
                          {...register("isDiabetic")}
                        />
                        <span>Diagnosed with diabetes or diabetic wound history</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Doctor Profile Fields */}
                {role === "doctor" && (
                  <div className="space-y-4 border-t border-[#17252A]/10 pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#17252A]/60">
                      Professional Credentials
                    </h4>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        label="Specialty"
                        htmlFor="specialty"
                        error={errors.specialty?.message}
                        required
                      >
                        <Select id="specialty" {...register("specialty")}>
                          <option value="">Select specialty</option>
                          <option value="dermatologist">Dermatologist</option>
                          <option value="wound_care">Wound Care Specialist</option>
                          <option value="diabetologist">Diabetologist</option>
                          <option value="general">General Physician</option>
                        </Select>
                      </FormField>

                      <FormField
                        label="Medical Registration Number"
                        htmlFor="registrationNumber"
                        error={errors.registrationNumber?.message}
                        required
                      >
                        <Input
                          id="registrationNumber"
                          placeholder="State Medical Council Reg. No."
                          {...register("registrationNumber")}
                        />
                      </FormField>
                    </div>

                    <FormField
                      label="Professional Biography"
                      htmlFor="bio"
                      hint="At least 10 characters summarizing clinical qualifications and practice."
                      error={errors.bio?.message}
                      required
                    >
                      <Textarea
                        id="bio"
                        rows={3}
                        placeholder="Clinical qualifications, hospital affiliations, and areas of focus..."
                        {...register("bio")}
                      />
                    </FormField>
                  </div>
                )}

                {/* Consent Checkboxes */}
                <div className="space-y-3 pt-3 border-t border-[#17252A]/10">
                  <div>
                    <div className="flex items-start gap-2.5">
                      <input
                        id="termsAccepted"
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded-[4px] border-[#17252A]/30 text-[#2B7A78] focus:ring-2 focus:ring-[#2B7A78]"
                        {...register("termsAccepted")}
                      />
                      <label htmlFor="termsAccepted" className="text-xs text-[#17252A]/85 leading-relaxed cursor-pointer select-none">
                        I have read and agree to the{" "}
                        <Link href="/terms" target="_blank" className="font-semibold text-[#2B7A78] underline">
                          Terms and Conditions
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" target="_blank" className="font-semibold text-[#2B7A78] underline">
                          Privacy Policy
                        </Link>
                        .
                      </label>
                    </div>
                    {errors.termsAccepted && (
                      <p className="mt-1 text-[11px] font-medium text-[#B42318] pl-6.5">
                        {errors.termsAccepted.message}
                      </p>
                    )}
                  </div>

                  {role === "patient" && (
                    <div>
                      <div className="flex items-start gap-2.5">
                        <input
                          id="healthConsent"
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded-[4px] border-[#17252A]/30 text-[#2B7A78] focus:ring-2 focus:ring-[#2B7A78]"
                          {...register("healthConsent")}
                        />
                        <label htmlFor="healthConsent" className="text-xs text-[#17252A]/85 leading-relaxed cursor-pointer select-none">
                          I explicitly consent to the processing of my health information and skin photos for automated screening and decision-support analysis.
                        </label>
                      </div>
                      {errors.healthConsent && (
                        <p className="mt-1 text-[11px] font-medium text-[#B42318] pl-6.5">
                          {errors.healthConsent.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {serverError && (
                  <Alert variant="error" className="mt-3">
                    {serverError}
                  </Alert>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full mt-4"
                  isLoading={isSubmitting}
                >
                  Create {role === "doctor" ? "Doctor" : "Patient"} Account
                </Button>
              </form>

              <div className="mt-4 border-t border-[#17252A]/10 pt-4 text-center text-xs text-[#17252A]/70">
                Already registered?{" "}
                <Link href="/login" className="font-semibold text-[#2B7A78] underline">
                  Sign in here
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
