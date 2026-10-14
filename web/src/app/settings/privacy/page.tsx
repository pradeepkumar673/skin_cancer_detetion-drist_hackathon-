"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowLeft,
  XCircle,
  FileText,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";

interface ConsentItem {
  id: string;
  doctorId: string;
  doctorName?: string;
  caseId?: string;
  scope: string;
  createdAt: string;
}

export default function PrivacySettingsPage() {
  const { user, refreshUser, logout } = useAuth();

  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [loadingConsents, setLoadingConsents] = useState(true);
  const [exportPassword, setExportPassword] = useState("");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

  useEffect(() => {
    async function loadConsents() {
      try {
        setLoadingConsents(true);
        const res = await apiClient<{ consents: ConsentItem[] }>("consents");
        setConsents(res.consents || []);
      } catch {
        // Non-blocking fallback
      } finally {
        setLoadingConsents(false);
      }
    }
    if (user) {
      loadConsents();
    }
  }, [user]);

  async function handleExportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setExportError(null);
    setExportLoading(true);

    try {
      const res = await fetch("http://localhost:5000/me/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        credentials: "include",
        body: JSON.stringify({ password: exportPassword }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to authenticate export request");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skinsentry_personal_data_export_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportModalOpen(false);
      setExportPassword("");
      setStatusMessage("Personal data archive downloaded successfully.");
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDeleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    setDeleteLoading(true);

    try {
      await apiClient("me", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      setDeleteModalOpen(false);
      setDeletePassword("");
      await logout();
      window.location.href = "/login?notice=deletion_requested";
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to schedule account deletion");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCancelDeletion() {
    setCancellingDeletion(true);
    try {
      await apiClient("me/cancel-deletion", { method: "POST" });
      if (refreshUser) await refreshUser();
      setStatusMessage("Account deletion request has been cancelled.");
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to cancel deletion request");
    } finally {
      setCancellingDeletion(false);
    }
  }

  async function handleRevokeConsent(consentId: string) {
    try {
      await apiClient(`consents/${consentId}`, { method: "DELETE" });
      setConsents((prev) => prev.filter((c) => c.id !== consentId));
      setStatusMessage("Physician case access revoked.");
    } catch (err: unknown) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to revoke consent");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FEFFFF] text-[#17252A]">
      <Header />

      <main className="flex-1">
        <div className="border-b border-[#17252A]/10 bg-[#DEF2F1]/60 py-2.5">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <PermanentDisclaimer />
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
          <div className="space-y-1 border-b border-[#17252A]/10 pb-4">
            <Link
              href="/cases"
              className="inline-flex items-center gap-1.5 text-xs text-[#2B7A78] hover:underline font-semibold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-[#17252A] flex items-center gap-2">
              <Shield className="h-6 w-6 text-[#2B7A78]" />
              <span>Privacy Tools & Data Management</span>
            </h1>
            <p className="text-xs text-[#17252A]/80 max-w-2xl">
              Inspect your stored personal information, export a full structured archive, manage
              clinical access permissions, or schedule permanent account erasure.
            </p>
          </div>

          {/* Pending Deletion Warning Banner */}
          {user?.deletionRequestedAt && (
            <div className="p-4 border border-[#B42318] bg-red-50 text-[#17252A] rounded-[4px] space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-[#B42318] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="font-bold text-sm text-[#B42318]">Account Deletion Scheduled</h2>
                  <p className="text-xs text-[#17252A]/90">
                    You requested account deletion on{" "}
                    {new Date(user.deletionRequestedAt).toLocaleDateString()}. Your data will be
                    permanently expunged once the statutory grace window concludes. You can cancel
                    this request at any time prior to that date.
                  </p>
                </div>
              </div>
              <div className="pl-8">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCancelDeletion}
                  disabled={cancellingDeletion}
                  className="bg-[#2B7A78] text-[#FEFFFF]"
                >
                  {cancellingDeletion ? "Cancelling..." : "Cancel Deletion Request"}
                </Button>
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 border border-[#2B7A78] bg-[#DEF2F1]/60 text-[#17252A] rounded-[4px] text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#2B7A78]" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Section 1: Data Held Overview */}
          <Card className="border border-[#17252A]/15 bg-[#FEFFFF]">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-[#2B7A78]">
                Personal & Medical Information Held
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <p className="text-[#17252A]/80">
                SkinSentry stores only the data strictly necessary for computer vision screening,
                clinical audit trails, and consultation scheduling:
              </p>
              <ul className="grid sm:grid-cols-2 gap-2 list-disc pl-5 text-[#17252A]/90 font-mono text-[11px]">
                <li>Account profile (Name, email, verified phone)</li>
                <li>Demographics (Age bracket, Fitzpatrick skin type)</li>
                <li>Submitted photographs & segmentation masks</li>
                <li>Extracted ABCDE metrics & confidence ranges</li>
                <li>Consultation scheduling & message transcripts</li>
                <li>Statutory payment timestamps & transaction IDs</li>
              </ul>
              <div className="pt-2 border-t border-[#17252A]/10 flex items-center justify-between text-xs text-[#17252A]/70">
                <span>
                  Accepted Terms Version:{" "}
                  <strong className="text-[#17252A]">
                    {user?.termsVersionAccepted || "v1.0"}
                  </strong>
                </span>
                <Link href="/privacy" className="text-[#2B7A78] hover:underline">
                  Read Full Privacy Policy &rarr;
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Data Rights Actions (Export & Delete) */}
          <div className="grid sm:grid-cols-2 gap-6">
            <Card className="border border-[#17252A]/15 bg-[#FEFFFF] flex flex-col justify-between">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#17252A] flex items-center gap-2">
                  <Download className="h-4 w-4 text-[#2B7A78]" />
                  <span>Download My Data (Portability)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <p className="text-[#17252A]/80 leading-relaxed">
                  Export a complete machine-readable JSON archive containing all cases, calibrated
                  feature matrices, consultations, and audit logs associated with your account.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExportModalOpen(true)}
                  className="w-full border-[#2B7A78] text-[#2B7A78] hover:bg-[#DEF2F1]"
                >
                  Download Data Archive
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-[#B42318]/30 bg-[#FEFFFF] flex flex-col justify-between">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#B42318] flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-[#B42318]" />
                  <span>Permanent Account Erasure</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <p className="text-[#17252A]/80 leading-relaxed">
                  Permanently deletes all photographs, case records, and consultation histories after
                  a 30-day grace period. Statutory financial transaction records are anonymised.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteModalOpen(true)}
                  className="w-full"
                >
                  Request Account Deletion
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Section 3: Active Case Sharing Consents */}
          <Card className="border border-[#17252A]/15 bg-[#FEFFFF]">
            <CardHeader className="pb-3 border-b border-[#17252A]/10">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-[#2B7A78]">
                Physician Record Sharing Consents
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              <p className="text-[#17252A]/80">
                You retain complete control over physician record visibility. Revoking access
                immediately prevents the doctor from viewing your photos and measurements.
              </p>

              {loadingConsents ? (
                <div className="py-6 flex items-center justify-center">
                  <Spinner size="sm" />
                </div>
              ) : consents.length === 0 ? (
                <div className="p-4 border border-[#17252A]/10 bg-[#DEF2F1]/20 rounded-[4px] text-center text-xs text-[#17252A]/70">
                  No active physician consents recorded. Your medical records are private to you.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#17252A]/15 rounded-[4px]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#17252A]/15 bg-[#DEF2F1]/40 font-semibold text-[#17252A]">
                        <th className="p-2.5">Physician</th>
                        <th className="p-2.5">Access Scope</th>
                        <th className="p-2.5">Granted On</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#17252A]/10">
                      {consents.map((consent) => (
                        <tr key={consent.id} className="hover:bg-[#DEF2F1]/10">
                          <td className="p-2.5 font-medium">
                            {consent.doctorName || `Physician #${consent.doctorId.slice(-6)}`}
                          </td>
                          <td className="p-2.5 font-mono text-[11px]">
                            {consent.caseId ? `Case #${consent.caseId.slice(-6)}` : "All Cases"}
                          </td>
                          <td className="p-2.5 text-[#17252A]/70">
                            {new Date(consent.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => handleRevokeConsent(consent.id)}
                              className="px-2 py-1 border border-[#B42318] text-[#B42318] rounded-[4px] hover:bg-red-50 text-[11px] font-semibold"
                            >
                              Withdraw Consent
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Export Confirmation Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#17252A]/50 flex items-center justify-center p-4">
          <div className="bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#17252A]/10 pb-2">
              <h2 className="font-bold text-sm text-[#17252A] flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#2B7A78]" />
                <span>Confirm Password for Export</span>
              </h2>
              <button
                onClick={() => setExportModalOpen(false)}
                className="text-[#17252A]/60 hover:text-[#17252A]"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-[#17252A]/80 leading-relaxed">
              Exporting contains confidential health and consultation records. Please confirm your
              account password to verify your identity.
            </p>

            {exportError && (
              <div className="p-2.5 bg-red-50 border border-red-300 text-red-900 rounded-[4px] text-xs">
                {exportError}
              </div>
            )}

            <form onSubmit={handleExportSubmit} className="space-y-4">
              <input
                type="password"
                required
                placeholder="Enter current password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className="w-full px-3 py-2 border border-[#17252A]/20 rounded-[4px] text-xs focus:outline-none focus:border-[#2B7A78]"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-[#17252A]/10">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setExportModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={exportLoading}
                  className="bg-[#2B7A78] text-[#FEFFFF]"
                >
                  {exportLoading ? "Generating..." : "Download JSON"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#17252A]/50 flex items-center justify-center p-4">
          <div className="bg-[#FEFFFF] border border-[#B42318] rounded-[4px] max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#17252A]/10 pb-2">
              <h2 className="font-bold text-sm text-[#B42318] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Confirm Account Erasure</span>
              </h2>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="text-[#17252A]/60 hover:text-[#17252A]"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-[#17252A]/80 leading-relaxed">
              This action will schedule permanent deletion of your profile, submitted photographs,
              segmentation artifacts, and consultation messages. Confirm your password to proceed:
            </p>

            {deleteError && (
              <div className="p-2.5 bg-red-50 border border-red-300 text-red-900 rounded-[4px] text-xs">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteSubmit} className="space-y-4">
              <input
                type="password"
                required
                placeholder="Enter password to confirm deletion"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 border border-[#B42318]/40 rounded-[4px] text-xs focus:outline-none focus:border-[#B42318]"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-[#17252A]/10">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeleteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Scheduling..." : "Confirm Deletion Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
