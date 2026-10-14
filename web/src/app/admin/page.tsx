"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Users,
  CreditCard,
  Mail,
  Activity,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PermanentDisclaimer } from "@/components/ui/PermanentDisclaimer";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";

type AdminTab = "doctors" | "users" | "payments" | "emails" | "audit" | "jobs";

interface DoctorItem {
  id: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  specialty: string;
  registrationNumber: string;
  bio: string | null;
  verificationStatus: "pending" | "verified" | "rejected";
  verifiedBy: string | null;
  createdAt: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  languagePref: string;
  createdAt: string;
  deletionRequestedAt: string | null;
}

interface PaymentItem {
  id: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  patientName: string;
  patientEmail: string | null;
  appointmentId: string | null;
  mode: string | null;
  refundId: string | null;
  refundAmountPaise: number | null;
  createdAt: string;
}

interface EmailItem {
  id: string;
  to: string;
  template: string;
  status: string;
  messageId: string | null;
  error: string | null;
  at: string;
}

interface AuditItem {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

interface JobItem {
  name: string;
  description: string;
  schedule: string;
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("doctors");

  // Doctors State
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [doctorFilter, setDoctorFilter] = useState<string>("");
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // Users State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Payments State
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotalPages, setPaymentTotalPages] = useState(1);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [refundModal, setRefundModal] = useState<{ id: string; amountINR: number } | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);

  // Emails State
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [emailStatus, setEmailStatus] = useState("");
  const [emailPage, setEmailPage] = useState(1);
  const [emailTotalPages, setEmailTotalPages] = useState(1);
  const [loadingEmails, setLoadingEmails] = useState(false);

  // Audit State
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);

  // Jobs State
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobRunning, setJobRunning] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{ name: string; message: string } | null>(null);

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch Doctors
  const fetchDoctors = async () => {
    try {
      setLoadingDoctors(true);
      const query = doctorFilter ? `?status=${doctorFilter}` : "";
      const res = await apiClient<{ doctors: DoctorItem[] }>(`admin/doctors${query}`);
      setDoctors(res.doctors || []);
    } catch {
      // non-blocking
    } finally {
      setLoadingDoctors(false);
    }
  };

  // Fetch Users
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const params = new URLSearchParams();
      params.set("page", String(userPage));
      params.set("limit", "15");
      if (userQuery) params.set("q", userQuery);
      if (userRole) params.set("role", userRole);
      const res = await apiClient<{
        users: UserItem[];
        pagination: { totalPages: number };
      }>(`admin/users?${params.toString()}`);
      setUsers(res.users || []);
      setUserTotalPages(res.pagination?.totalPages || 1);
    } catch {
      // non-blocking
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch Payments
  const fetchPayments = async () => {
    try {
      setLoadingPayments(true);
      const params = new URLSearchParams();
      params.set("page", String(paymentPage));
      params.set("limit", "15");
      if (paymentStatus) params.set("status", paymentStatus);
      const res = await apiClient<{
        payments: PaymentItem[];
        pagination: { totalPages: number };
      }>(`admin/payments?${params.toString()}`);
      setPayments(res.payments || []);
      setPaymentTotalPages(res.pagination?.totalPages || 1);
    } catch {
      // non-blocking
    } finally {
      setLoadingPayments(false);
    }
  };

  // Fetch Emails
  const fetchEmails = async () => {
    try {
      setLoadingEmails(true);
      const params = new URLSearchParams();
      params.set("page", String(emailPage));
      params.set("limit", "15");
      if (emailStatus) params.set("status", emailStatus);
      const res = await apiClient<{
        emails: EmailItem[];
        pagination: { totalPages: number };
      }>(`admin/emails?${params.toString()}`);
      setEmails(res.emails || []);
      setEmailTotalPages(res.pagination?.totalPages || 1);
    } catch {
      // non-blocking
    } finally {
      setLoadingEmails(false);
    }
  };

  // Fetch Audit
  const fetchAudits = async () => {
    try {
      setLoadingAudits(true);
      const res = await apiClient<{ items: AuditItem[] }>("admin/audit?limit=25");
      setAudits(res.items || []);
    } catch {
      // non-blocking
    } finally {
      setLoadingAudits(false);
    }
  };

  // Fetch Jobs
  const fetchJobs = async () => {
    try {
      setLoadingJobs(true);
      const res = await apiClient<{ jobs: JobItem[] }>("admin/jobs");
      setJobs(res.jobs || []);
    } catch {
      // non-blocking
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      if (activeTab === "doctors") fetchDoctors();
      if (activeTab === "users") fetchUsers();
      if (activeTab === "payments") fetchPayments();
      if (activeTab === "emails") fetchEmails();
      if (activeTab === "audit") fetchAudits();
      if (activeTab === "jobs") fetchJobs();
    }
  }, [activeTab, user?.role, doctorFilter, userPage, userRole, paymentPage, paymentStatus, emailPage, emailStatus]);

  // Doctor Action
  const handleVerifyDoctor = async (id: string, status: "verified" | "rejected") => {
    try {
      await apiClient(`admin/doctors/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setActionMessage(`Physician status updated to ${status}.`);
      fetchDoctors();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Failed to update physician");
    }
  };

  // User Status Toggle
  const handleToggleUserStatus = async (id: string, currentStatus: boolean) => {
    try {
      await apiClient(`admin/users/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      setActionMessage(`User account ${!currentStatus ? "activated" : "deactivated"}.`);
      fetchUsers();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Failed to update user status");
    }
  };

  // Payment Refund Action
  const handleExecuteRefund = async () => {
    if (!refundModal) return;
    try {
      setProcessingRefund(true);
      await apiClient(`admin/payments/${refundModal.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason: refundReason || "Administrator refund" }),
      });
      setActionMessage("Refund processed successfully via Razorpay.");
      setRefundModal(null);
      setRefundReason("");
      fetchPayments();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Refund execution failed");
    } finally {
      setProcessingRefund(false);
    }
  };

  // Run Job
  const handleRunJob = async (jobName: string) => {
    try {
      setJobRunning(jobName);
      setJobResult(null);
      const res = await apiClient<{ job: string; result: unknown }>(`admin/jobs/${jobName}/run`, {
        method: "POST",
      });
      setJobResult({
        name: jobName,
        message: JSON.stringify(res.result, null, 2),
      });
      setActionMessage(`Job ${jobName} executed successfully.`);
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : `Job ${jobName} execution failed`);
    } finally {
      setJobRunning(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FEFFFF] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#FEFFFF] text-[#17252A] flex flex-col font-sans">
        <Header />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="p-8 border border-[#17252A]/20 bg-[#DEF2F1] rounded-[4px] max-w-md mx-auto">
            <Shield className="h-8 w-8 text-[#2B7A78] mx-auto mb-3" />
            <h1 className="text-lg font-bold text-[#17252A]">Access Restricted</h1>
            <p className="mt-2 text-xs text-[#17252A]/70">
              This console is restricted to authenticated system administrators only.
            </p>
            <div className="mt-4">
              <Link href="/login">
                <Button variant="primary" size="sm">
                  Sign in with Administrator Credentials
                </Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFFFF] text-[#17252A] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:px-6">
        <div className="mb-6">
          <PermanentDisclaimer />
        </div>

        {/* Console Header */}
        <div className="border-b border-[#17252A]/15 pb-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#2B7A78]" />
                <h1 className="text-xl font-bold tracking-tight text-[#17252A]">
                  System Administration Console
                </h1>
              </div>
              <p className="mt-0.5 text-xs text-[#17252A]/70">
                Manage practitioner credentials, user status, payment transactions, and background
                routines.
              </p>
            </div>
            <div className="text-xs font-mono text-[#17252A]/60">
              Admin: <span className="font-semibold text-[#17252A]">{user.email}</span>
            </div>
          </div>
        </div>

        {/* Global Action Message Banner */}
        {actionMessage && (
          <div className="mb-6 p-3 bg-[#DEF2F1] border border-[#2B7A78]/30 rounded-[4px] text-xs text-[#17252A] flex items-center justify-between">
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-[#17252A]/60 hover:text-[#17252A] font-bold ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-[#17252A]/15 overflow-x-auto mb-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab("doctors")}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "doctors"
                ? "border-[#2B7A78] text-[#2B7A78] font-bold"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Physician Verification</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "users"
                ? "border-[#2B7A78] text-[#2B7A78] font-bold"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>User Management</span>
          </button>

          <button
            onClick={() => setActiveTab("payments")}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "payments"
                ? "border-[#2B7A78] text-[#2B7A78] font-bold"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>Payment Audit</span>
          </button>

          <button
            onClick={() => setActiveTab("emails")}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "emails"
                ? "border-[#2B7A78] text-[#2B7A78] font-bold"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            <span>Email Audit Log</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "audit"
                ? "border-[#2B7A78] text-[#2B7A78] font-bold"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Clinical Audit Trail</span>
          </button>

          <button
            onClick={() => setActiveTab("jobs")}
            className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "jobs"
                ? "border-[#2B7A78] text-[#2B7A78] font-bold"
                : "border-transparent text-[#17252A]/70 hover:text-[#17252A]"
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            <span>Background Jobs</span>
          </button>
        </div>

        {/* TAB 1: DOCTOR VERIFICATION */}
        {activeTab === "doctors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#17252A]/70">Filter Status:</span>
                <select
                  value={doctorFilter}
                  onChange={(e) => setDoctorFilter(e.target.value)}
                  className="px-2 py-1 border border-[#17252A]/20 bg-[#FEFFFF] rounded-[4px] text-xs text-[#17252A]"
                >
                  <option value="">All Applications</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={fetchDoctors}
                className="flex items-center gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </Button>
            </div>

            {loadingDoctors ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : doctors.length === 0 ? (
              <div className="p-8 text-center border border-[#17252A]/10 rounded-[4px] text-xs text-[#17252A]/60">
                No physician profiles found matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#17252A]/15 rounded-[4px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#DEF2F1] border-b border-[#17252A]/15 font-semibold text-[#17252A]">
                    <tr>
                      <th className="px-3 py-2.5">Physician Name</th>
                      <th className="px-3 py-2.5">Email & Phone</th>
                      <th className="px-3 py-2.5">Specialty</th>
                      <th className="px-3 py-2.5">Registration Number</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                    {doctors.map((doc) => (
                      <tr key={doc.id} className="hover:bg-[#DEF2F1]/20">
                        <td className="px-3 py-2.5 font-medium">{doc.name || "Unnamed"}</td>
                        <td className="px-3 py-2.5 text-[#17252A]/70">
                          <div>{doc.email || "No email"}</div>
                          <div className="text-[11px] font-mono">{doc.phone || ""}</div>
                        </td>
                        <td className="px-3 py-2.5">{doc.specialty}</td>
                        <td className="px-3 py-2.5 font-mono">{doc.registrationNumber}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] uppercase font-mono rounded-[4px] ${
                              doc.verificationStatus === "verified"
                                ? "bg-[#DEF2F1] text-[#2B7A78] font-bold border border-[#2B7A78]/30"
                                : doc.verificationStatus === "rejected"
                                ? "bg-[#17252A]/10 text-[#17252A] font-bold border border-[#17252A]/20"
                                : "bg-[#DEF2F1] text-[#17252A] border border-[#17252A]/20"
                            }`}
                          >
                            {doc.verificationStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          {doc.verificationStatus !== "verified" && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleVerifyDoctor(doc.id, "verified")}
                              className="text-[11px] py-1 px-2"
                            >
                              Verify
                            </Button>
                          )}
                          {doc.verificationStatus !== "rejected" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleVerifyDoctor(doc.id, "rejected")}
                              className="text-[11px] py-1 px-2"
                            >
                              Reject
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#17252A]/50" />
                  <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
                    placeholder="Search by name or email..."
                    className="w-full pl-8 pr-3 py-1.5 border border-[#17252A]/20 bg-[#FEFFFF] rounded-[4px] text-xs text-[#17252A]"
                  />
                </div>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="px-2 py-1.5 border border-[#17252A]/20 bg-[#FEFFFF] rounded-[4px] text-xs text-[#17252A]"
                >
                  <option value="">All Roles</option>
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor</option>
                  <option value="admin">Admin</option>
                </select>
                <Button variant="secondary" size="sm" onClick={fetchUsers} className="text-xs">
                  Filter
                </Button>
              </div>
            </div>

            {loadingUsers ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center border border-[#17252A]/10 rounded-[4px] text-xs text-[#17252A]/60">
                No users found.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#17252A]/15 rounded-[4px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#DEF2F1] border-b border-[#17252A]/15 font-semibold text-[#17252A]">
                    <tr>
                      <th className="px-3 py-2.5">Name</th>
                      <th className="px-3 py-2.5">Email</th>
                      <th className="px-3 py-2.5">Role</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Deletion Request</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#DEF2F1]/20">
                        <td className="px-3 py-2 font-medium">{u.name}</td>
                        <td className="px-3 py-2 text-[#17252A]/70 font-mono text-[11px]">
                          {u.email}
                        </td>
                        <td className="px-3 py-2 uppercase font-mono text-[10px]">{u.role}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono ${
                              u.isActive
                                ? "bg-[#DEF2F1] text-[#2B7A78] font-bold"
                                : "bg-[#17252A]/10 text-[#17252A]"
                            }`}
                          >
                            {u.isActive ? "Active" : "Deactivated"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[#17252A]/70">
                          {u.deletionRequestedAt ? (
                            <span className="text-[#17252A] font-medium bg-[#DEF2F1] px-1.5 py-0.5 rounded-[4px]">
                              Scheduled: {new Date(u.deletionRequestedAt).toLocaleDateString()}
                            </span>
                          ) : (
                            "None"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggleUserStatus(u.id, u.isActive)}
                            className="text-[11px] py-1 px-2"
                          >
                            {u.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {userTotalPages > 1 && (
              <div className="flex items-center justify-between text-xs pt-2">
                <span className="text-[#17252A]/60">
                  Page {userPage} of {userTotalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={userPage <= 1}
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={userPage >= userTotalPages}
                    onClick={() => setUserPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAYMENTS & REFUNDS */}
        {activeTab === "payments" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#17252A]/70">Status:</span>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="px-2 py-1 border border-[#17252A]/20 bg-[#FEFFFF] rounded-[4px] text-xs text-[#17252A]"
                >
                  <option value="">All Transactions</option>
                  <option value="paid">Paid</option>
                  <option value="created">Created</option>
                  <option value="refunded">Refunded</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={fetchPayments}
                className="flex items-center gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </Button>
            </div>

            {loadingPayments ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : payments.length === 0 ? (
              <div className="p-8 text-center border border-[#17252A]/10 rounded-[4px] text-xs text-[#17252A]/60">
                No payment transactions found.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#17252A]/15 rounded-[4px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#DEF2F1] border-b border-[#17252A]/15 font-semibold text-[#17252A]">
                    <tr>
                      <th className="px-3 py-2.5">Order / Payment ID</th>
                      <th className="px-3 py-2.5">Patient</th>
                      <th className="px-3 py-2.5">Mode</th>
                      <th className="px-3 py-2.5">Amount (INR)</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5 text-right">Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#DEF2F1]/20">
                        <td className="px-3 py-2 font-mono text-[11px]">
                          <div>{p.razorpayOrderId}</div>
                          <div className="text-[#17252A]/60">{p.razorpayPaymentId || "-"}</div>
                        </td>
                        <td className="px-3 py-2">{p.patientName}</td>
                        <td className="px-3 py-2 capitalize font-mono text-[10px]">
                          {p.mode || "-"}
                        </td>
                        <td className="px-3 py-2 font-bold font-mono">
                          ₹{Math.round(p.amountPaise / 100)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono ${
                              p.status === "paid"
                                ? "bg-[#DEF2F1] text-[#2B7A78] font-bold"
                                : p.status === "refunded"
                                ? "bg-[#17252A]/10 text-[#17252A]"
                                : "text-[#17252A]/70"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#17252A]/70 text-[11px]">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {p.status === "paid" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setRefundModal({
                                  id: p.id,
                                  amountINR: Math.round(p.amountPaise / 100),
                                })
                              }
                              className="text-[11px] py-1 px-2"
                            >
                              Issue Refund
                            </Button>
                          )}
                          {p.status === "refunded" && (
                            <span className="text-[11px] font-mono text-[#17252A]/60">
                              Ref: {p.refundId ? p.refundId.slice(0, 10) : "Refunded"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Refund Dialog */}
            {refundModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17252A]/40 p-4">
                <div className="bg-[#FEFFFF] border border-[#17252A]/20 rounded-[4px] max-w-sm w-full p-5 space-y-4 shadow-lg">
                  <h3 className="text-sm font-bold text-[#17252A]">Confirm Consultation Refund</h3>
                  <p className="text-xs text-[#17252A]/80 leading-relaxed">
                    Issue a full refund of ₹{refundModal.amountINR} via Razorpay? This will cancel
                    the appointment and notify the patient.
                  </p>
                  <div>
                    <label className="text-[11px] font-semibold text-[#17252A] block mb-1">
                      Reason for refund:
                    </label>
                    <input
                      type="text"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="e.g. Physician unavailable, Patient request"
                      className="w-full px-2.5 py-1.5 border border-[#17252A]/20 bg-[#FEFFFF] rounded-[4px] text-xs text-[#17252A]"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRefundModal(null)}
                      disabled={processingRefund}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleExecuteRefund}
                      disabled={processingRefund}
                    >
                      {processingRefund ? "Processing..." : "Confirm Refund"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: EMAIL AUDIT LOG */}
        {activeTab === "emails" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#17252A]/70">Status:</span>
                <select
                  value={emailStatus}
                  onChange={(e) => setEmailStatus(e.target.value)}
                  className="px-2 py-1 border border-[#17252A]/20 bg-[#FEFFFF] rounded-[4px] text-xs text-[#17252A]"
                >
                  <option value="">All Dispatches</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={fetchEmails}
                className="flex items-center gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </Button>
            </div>

            {loadingEmails ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : emails.length === 0 ? (
              <div className="p-8 text-center border border-[#17252A]/10 rounded-[4px] text-xs text-[#17252A]/60">
                No notification logs recorded.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#17252A]/15 rounded-[4px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#DEF2F1] border-b border-[#17252A]/15 font-semibold text-[#17252A]">
                    <tr>
                      <th className="px-3 py-2.5">Recipient</th>
                      <th className="px-3 py-2.5">Template</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Dispatched At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                    {emails.map((em) => (
                      <tr key={em.id} className="hover:bg-[#DEF2F1]/20">
                        <td className="px-3 py-2 font-mono text-[11px]">{em.to}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{em.template}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono ${
                              em.status === "sent"
                                ? "bg-[#DEF2F1] text-[#2B7A78] font-bold"
                                : "bg-[#17252A]/10 text-[#17252A]"
                            }`}
                          >
                            {em.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#17252A]/70 text-[11px]">
                          {new Date(em.at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUDIT LOG */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#17252A]/70">
                Latest 25 clinical and operational events:
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchAudits}
                className="flex items-center gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </Button>
            </div>

            {loadingAudits ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : audits.length === 0 ? (
              <div className="p-8 text-center border border-[#17252A]/10 rounded-[4px] text-xs text-[#17252A]/60">
                No audit events recorded.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#17252A]/15 rounded-[4px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#DEF2F1] border-b border-[#17252A]/15 font-semibold text-[#17252A]">
                    <tr>
                      <th className="px-3 py-2.5">Action</th>
                      <th className="px-3 py-2.5">Entity</th>
                      <th className="px-3 py-2.5">Actor</th>
                      <th className="px-3 py-2.5">Details</th>
                      <th className="px-3 py-2.5">IP</th>
                      <th className="px-3 py-2.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17252A]/10 text-[#17252A]">
                    {audits.map((a) => (
                      <tr key={a.id} className="hover:bg-[#DEF2F1]/20">
                        <td className="px-3 py-2 font-mono font-bold text-[11px] text-[#2B7A78]">
                          {a.action}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] uppercase">
                          {a.entityType}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-[#17252A]/70">
                          {a.actorId ? a.actorId.slice(-6) : "system"}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate text-[11px] font-mono text-[#17252A]/70">
                          {a.meta ? JSON.stringify(a.meta) : "-"}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-[#17252A]/60">
                          {a.ip || "-"}
                        </td>
                        <td className="px-3 py-2 text-[#17252A]/70 text-[11px]">
                          {new Date(a.at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: BACKGROUND JOBS */}
        {activeTab === "jobs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#17252A]/70">
                Registered cron tasks and operational maintenance routines:
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchJobs}
                className="flex items-center gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </Button>
            </div>

            {loadingJobs ? (
              <div className="py-12 flex justify-center">
                <Spinner size="md" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map((j) => (
                  <Card key={j.name} className="border border-[#17252A]/15 bg-[#FEFFFF]">
                    <CardHeader className="border-b border-[#17252A]/10 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold font-mono text-[#17252A]">
                          {j.name}
                        </CardTitle>
                        <span className="text-[10px] font-mono bg-[#DEF2F1] text-[#2B7A78] px-2 py-0.5 rounded-[4px] border border-[#2B7A78]/20">
                          {j.schedule}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3 space-y-3">
                      <p className="text-xs text-[#17252A]/70 leading-relaxed">{j.description}</p>
                      <div className="pt-2 flex justify-end">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleRunJob(j.name)}
                          disabled={jobRunning === j.name}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Play className="h-3 w-3" />
                          <span>{jobRunning === j.name ? "Executing..." : "Run Job Now"}</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {jobResult && (
              <div className="mt-4 p-4 border border-[#17252A]/20 bg-[#DEF2F1] rounded-[4px]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#17252A] mb-2">
                  <CheckCircle className="h-4 w-4 text-[#2B7A78]" />
                  <span>Execution Result for: {jobResult.name}</span>
                </div>
                <pre className="text-[11px] font-mono text-[#17252A] overflow-x-auto whitespace-pre-wrap">
                  {jobResult.message}
                </pre>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
