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

  const navLinks = [
    { href: "/", label: "Overview" },
    ...(isAuthenticated
      ? [
          { href: "/cases", label: "My Cases" },
          { href: "/cases/new", label: "New Screening" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#17252A]/15 bg-[#FEFFFF]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold tracking-tight text-[#17252A] hover:text-[#2B7A78]"
          >
            <span className="border-b-2 border-[#2B7A78] pb-0.5">SkinSentry</span>
          </Link>

          <nav className="hidden md:flex items-center gap-4 text-sm">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors duration-150 py-1 ${
                    active
                      ? "border-b-2 border-[#2B7A78] font-semibold text-[#2B7A78]"
                      : "text-[#17252A]/70 hover:text-[#17252A]"
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
                <span className="text-xs font-semibold text-[#17252A]">{user.name}</span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#17252A]/60">
                  {user.role}
                </span>
              </div>
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
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="text" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
