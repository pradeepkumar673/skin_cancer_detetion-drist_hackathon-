"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient, setAccessToken } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "patient" | "doctor" | "admin";
  phone?: string | null;
  languagePref?: string;
  isActive: boolean;
  verificationStatus?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Attempt silent refresh on initial mount
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const data = await apiClient<{
          accessToken: string;
          user: UserProfile;
          verificationStatus?: string;
        }>("/auth/refresh", {
          method: "POST",
          skipAuth: true,
        });

        if (mounted && data?.accessToken && data?.user) {
          setAccessToken(data.accessToken);
          setUser({
            ...data.user,
            verificationStatus: data.verificationStatus,
          });
        }
      } catch {
        if (mounted) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

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
      setAccessToken(null);
      setUser(null);
      disconnectSocket();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        register,
        logout,
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
