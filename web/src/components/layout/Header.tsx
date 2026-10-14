"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();

  const isDoctor = user?.role === "doctor";
  const isAdmin = user?.role === "admin";

  const navLinks = [
    { href: "/", label: "Overview" },
    ...(isAuthenticated
      ? isAdmin
        ? [
            { href: "/admin", label: "Admin Console" },
            { href: "/performance", label: "Model Metrics" },
          ]
        : isDoctor
        ? [
            { href: "/doctor/dashboard", label: "Dashboard" },
            { href: "/doctor/availability", label: "Schedule" },
            { href: "/doctor/fees", label: "Fees" },
            { href: "/appointments", label: "Appointments" },
            { href: "/cases", label: "Case Reviews" },
          ]
        : [
            { href: "/cases", label: "My Cases" },
            { href: "/cases/new", label: "New Screening" },
            { href: "/doctors", label: "Find Specialists" },
            { href: "/appointments", label: "Appointments" },
          ]
      : [
          { href: "/how-it-works", label: "How It Works" },
          { href: "/performance", label: "Model Metrics" },
        ]),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#17252A]/15 bg-[#FEFFFF]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center gap-2 text-base font-bold tracking-tight text-[#17252A] hover:text-[#2B7A78]"
            >
              <span className="border-b-2 border-[#1B6B63] pb-[2px] text-[17px] font-semibold text-[#0E1F1E]">SkinSentry</span>
            </Link>
            <span className="ml-3 px-1.5 py-0.5 text-[11px] font-mono tracking-wider text-[#5A6B69] border border-[#D8DDDB] bg-[#FFFFFF] rounded-[2px] uppercase">
              CDS-v2.4
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors duration-150 py-1 ${
                    active
                      ? "border-b-2 border-[#1B6B63] font-semibold text-[#1B6B63]"
                      : "text-[#5A6B69] hover:text-[#0E1F1E]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-[#0E1F1E]">{user.name}</span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#5A6B69]">
                  {user.role}
                </span>
              </div>
              <Link href="/cases/new">
                <Button variant="primary" size="sm">
                  Start a check
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => logout()}
                className="flex items-center gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log out</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="text" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/cases/new">
                <Button variant="primary" size="sm">
                  Start a check
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
