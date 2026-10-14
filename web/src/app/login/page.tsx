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
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid clinical email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      router.push("/cases");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to sign in. Please verify your credentials.");
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF]">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Card className="border-[#17252A]/20">
            <CardHeader>
              <CardTitle>Sign in to SkinSentry</CardTitle>
              <CardDescription>
                Access clinical decision-support screening and patient records.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {serverError && (
                <Alert variant="error" className="mb-4">
                  {serverError}
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  label="Email Address"
                  htmlFor="email"
                  error={errors.email?.message}
                  required
                >
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="physician@hospital.org"
                    hasError={Boolean(errors.email)}
                    {...register("email")}
                  />
                </FormField>

                <FormField
                  label="Password"
                  htmlFor="password"
                  error={errors.password?.message}
                  required
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your account password"
                    hasError={Boolean(errors.password)}
                    {...register("password")}
                  />
                </FormField>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  isLoading={isSubmitting}
                >
                  Sign in
                </Button>
              </form>

              <div className="mt-4 border-t border-[#17252A]/10 pt-4 text-center text-xs text-[#17252A]/70">
                Do not have an account?{" "}
                <Link href="/register" className="font-semibold text-[#2B7A78] underline">
                  Register here
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
