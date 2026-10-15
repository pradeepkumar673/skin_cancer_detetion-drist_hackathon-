"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient, setAccessToken, refreshSession } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

export interface PatientProfile {
  id: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  skinType?: string | null;
  sunExposure?: string | null;
  familyHistorySkinCancer?: boolean;
  isDiabetic?: boolean;
}

export interface DoctorProfile {
  id: string;
  specialty?: string;
  registrationNumber?: string;
  verificationStatus?: string;
  bio?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "patient" | "doctor" | "admin";
  phone?: string | null;
  languagePref?: string;
  isActive: boolean;
  verificationStatus?: string;
  deletionRequestedAt?: string | null;
  termsVersionAccepted?: string | null;
  patient?: PatientProfile;
  doctor?: DoctorProfile;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const HAS_SESSION_KEY = "skinsentry_has_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const data = await refreshSession();
      if (data?.user) {
        if (typeof window !== "undefined") {
          localStorage.setItem(HAS_SESSION_KEY, "1");
        }
        setToken(data.accessToken);
        setUser({
          ...(data.user as unknown as UserProfile),
          verificationStatus: data.verificationStatus,
        });
      } else {
        if (typeof window !== "undefined") {
          localStorage.removeItem(HAS_SESSION_KEY);
        }
        setToken(null);
        setUser(null);
      }
    } catch {
      if (typeof window !== "undefined") {
        localStorage.removeItem(HAS_SESSION_KEY);
      }
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Attempt silent refresh on initial mount only if session hint exists
  useEffect(() => {
    let mounted = true;
    const hasSession =
      typeof window !== "undefined" &&
      localStorage.getItem(HAS_SESSION_KEY) === "1";

    if (!hasSession) {
      Promise.resolve().then(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
      return;
    }

    refreshSession()
      .then((data) => {
        if (!mounted) return;
        if (data?.user) {
          setToken(data.accessToken);
          setUser({
            ...(data.user as unknown as UserProfile),
            verificationStatus: data.verificationStatus,
          });
        } else {
          if (typeof window !== "undefined") {
            localStorage.removeItem(HAS_SESSION_KEY);
          }
          setToken(null);
          setUser(null);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        if (typeof window !== "undefined") {
          localStorage.removeItem(HAS_SESSION_KEY);
        }
        setToken(null);
        setUser(null);
        setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const data = await apiClient<{
      accessToken: string;
      user: UserProfile;
      verificationStatus?: string;
    }>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });

    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    if (typeof window !== "undefined") {
      localStorage.setItem(HAS_SESSION_KEY, "1");
    }
    const profile = {
      ...data.user,
      verificationStatus: data.verificationStatus,
    };
    setUser(profile);
    return profile;
  };

  const register = async (payload: Record<string, unknown>): Promise<void> => {
    await apiClient("/auth/register", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify(payload),
    });
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient("/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem(HAS_SESSION_KEY);
      }
      setAccessToken(null);
      setToken(null);
      setUser(null);
      disconnectSocket();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
