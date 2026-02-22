"use client";

import { calcPanicScore, getPanicColor, getPanicLabel } from "@/lib/panic";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Assignment = {
  id: string;
  title: string;
  course: string;
  deadline: string;
  estimated_hours: number;
};

type SubscriptionStatus = "free" | "premium";

function formatCountdown(deadline: string, nowMs: number) {
  const diffMs = new Date(deadline).getTime() - nowMs;

  if (diffMs <= 0) {
    return { label: "Overdue", hoursLeft: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    label: `${days}d ${hours.toString().padStart(2, "0")}h ${minutes
      .toString()
      .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`,
    hoursLeft: diffMs / (1000 * 60 * 60),
  };
}

const FREEMIUM_ENABLED = process.env.NEXT_PUBLIC_ENABLE_FREEMIUM === "true";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [nowMs, setNowMs] = useState(Date.now());
  const [userId, setUserId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vibes, setVibes] = useState<Record<string, string>>({});
  const [vibeLoading, setVibeLoading] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("free");
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignmentLimitModalOpen, setIsAssignmentLimitModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("1");
  const [saving, setSaving] = useState(false);
  const [diagnoseLimitReached, setDiagnoseLimitReached] = useState<Record<string, boolean>>({});

  const loadAssignments = useCallback(async (currentUserId: string) => {
    const { data, error: fetchError } = await supabase
      .from("assignments")
      .select("id, title, course, deadline, estimated_hours")
      .eq("user_id", currentUserId)
      .order("deadline", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setAssignments([]);
      return;
    }

    setAssignments((data ?? []) as Assignment[]);
  }, [supabase]);

  const loadSubscriptionStatus = useCallback(async (currentUserId: string) => {
    if (!FREEMIUM_ENABLED) {
      setSubscriptionStatus("premium");
      return;
    }

    const { data, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (subscriptionError) {
      setError(subscriptionError.message);
      return;
    }

    if (!data) {
      const { error: insertError } = await supabase
        .from("subscriptions")
        .insert({ user_id: currentUserId, status: "free" });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setSubscriptionStatus("free");
      return;
    }

    setSubscriptionStatus(data.status === "premium" ? "premium" : "free");
  }, [supabase]);

  const startUpgradeCheckout = useCallback(async () => {
    setUpgradeLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result: { url?: string; error?: string } = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok || !result.url) {
        const fallbackText = !contentType.includes("application/json") ? await response.text() : "";
        throw new Error(result.error || fallbackText || "Unable to start checkout.");
      }

      window.location.href = result.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout.");
      setUpgradeLoading(false);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        router.replace("/");
        return;
      }

      setUserId(user.id);
      await loadSubscriptionStatus(user.id);
      await loadAssignments(user.id);
      if (mounted) {
        setIsLoading(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAssignments, loadSubscriptionStatus, router, supabase]);

  const handleAddAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    if (FREEMIUM_ENABLED && subscriptionStatus === "free" && assignments.length >= 5) {
      setIsModalOpen(false);
      setIsAssignmentLimitModalOpen(true);
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("assignments")
      .insert({
        user_id: userId,
        title,
        course,
        deadline: new Date(deadline).toISOString(),
        estimated_hours: Number(estimatedHours),
      })
      .select("id, title, course, deadline, estimated_hours")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setAssignments((prev) => [...prev, data as Assignment].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()));
    setTitle("");
    setCourse("");
    setDeadline("");
    setEstimatedHours("1");
    setIsModalOpen(false);
    setSaving(false);
  };

  const handleDelete = async (assignmentId: string) => {
    if (!userId) return;

    const { error: deleteError } = await supabase
      .from("assignments")
      .delete()
      .eq("id", assignmentId)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
    setVibes((prev) => {
      const updated = { ...prev };
      delete updated[assignmentId];
      return updated;
    });
  };

  const handleVibe = async (assignment: Assignment) => {
    if (!userId) return;

    if (FREEMIUM_ENABLED && subscriptionStatus === "free") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const { count, error: usageCountError } = await supabase
        .from("diagnose_usage")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("used_at", startOfDay.toISOString())
        .lt("used_at", endOfDay.toISOString());

      if (usageCountError) {
        setError(usageCountError.message);
        return;
      }

      if ((count ?? 0) >= 5) {
        setDiagnoseLimitReached((prev) => ({ ...prev, [assignment.id]: true }));
        return;
      }

      const { error: usageInsertError } = await supabase.from("diagnose_usage").insert({
        user_id: userId,
        used_at: new Date().toISOString(),
      });

      if (usageInsertError) {
        setError(usageInsertError.message);
        return;
      }
    }

    setDiagnoseLimitReached((prev) => ({ ...prev, [assignment.id]: false }));

    const { hoursLeft } = formatCountdown(assignment.deadline, nowMs);
    const panicScore = calcPanicScore(assignment.deadline, assignment.estimated_hours);

    setVibeLoading((prev) => ({ ...prev, [assignment.id]: true }));
    setError(null);

    try {
      const response = await fetch("/api/vibe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panicScore,
          title: assignment.title,
          hoursLeft: Math.max(0, Number(hoursLeft.toFixed(1))),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch vibe");
      }

      const result: { message?: string } = await response.json();
      setVibes((prev) => ({ ...prev, [assignment.id]: result.message ?? "No vibe available right now." }));
    } catch {
      setError("Could not generate vibe right now.");
    } finally {
      setVibeLoading((prev) => ({ ...prev, [assignment.id]: false }));
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-300">
        Loading dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">DueSense Dashboard</h1>
              {FREEMIUM_ENABLED && (
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                    subscriptionStatus === "premium"
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-600 bg-slate-800 text-slate-300"
                  }`}
                >
                  {subscriptionStatus === "premium" ? "PREMIUM" : "FREE"}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">Live deadline tracking with panic intelligence.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400"
            >
              + Add Assignment
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/");
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <p className="rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((assignment) => {
            const { label } = formatCountdown(assignment.deadline, nowMs);
            const panicScore = calcPanicScore(assignment.deadline, assignment.estimated_hours);
            const panicColor = getPanicColor(panicScore);
            const panicLabel = getPanicLabel(panicScore);

            return (
              <article
                key={assignment.id}
                className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20"
              >
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white">{assignment.title}</h2>
                  <p className="text-sm text-slate-400">{assignment.course}</p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Countdown</p>
                  <p className="mt-1 text-lg font-bold text-cyan-300">{label}</p>
                </div>

                <div
                  className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold"
                  style={{ color: panicColor, borderColor: panicColor }}
                >
                  {panicLabel} · {panicScore}
                </div>

                <div className="flex items-center gap-2">
                  {diagnoseLimitReached[assignment.id] ? (
                    <button
                      type="button"
                      onClick={() => void startUpgradeCheckout()}
                      disabled={upgradeLoading}
                      className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {upgradeLoading ? "Redirecting..." : "Upgrade"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVibe(assignment)}
                      disabled={vibeLoading[assignment.id]}
                      className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {vibeLoading[assignment.id] ? "Thinking..." : "Diagnose"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(assignment.id)}
                    className="rounded-lg border border-rose-700 px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-950/40"
                  >
                    Delete
                  </button>
                </div>

                {vibes[assignment.id] ? (
                  <p className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-200">
                    {vibes[assignment.id]}
                  </p>
                ) : null}

                {diagnoseLimitReached[assignment.id] ? (
                  <p className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
                    Daily limit reached — upgrade for unlimited
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center text-slate-400">
            No assignments yet. Add your first deadline.
          </div>
        ) : null}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <h2 className="mb-4 text-xl font-bold text-white">New Assignment</h2>

            <form onSubmit={handleAddAssignment} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm text-slate-300">
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-indigo-500/50 transition focus:ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="course" className="text-sm text-slate-300">
                  Course
                </label>
                <input
                  id="course"
                  type="text"
                  required
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-indigo-500/50 transition focus:ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="deadline" className="text-sm text-slate-300">
                  Deadline
                </label>
                <input
                  id="deadline"
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-indigo-500/50 transition focus:ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="estimatedHours" className="text-sm text-slate-300">
                  Estimated Hours
                </label>
                <input
                  id="estimatedHours"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={estimatedHours}
                  onChange={(event) => setEstimatedHours(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-indigo-500/50 transition focus:ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAssignmentLimitModalOpen && FREEMIUM_ENABLED ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <p className="text-base text-slate-100">
              Free plan is limited to 5 assignments. Upgrade to Premium for $2.99/month for unlimited.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAssignmentLimitModalOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void startUpgradeCheckout()}
                disabled={upgradeLoading}
                className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {upgradeLoading ? "Redirecting..." : "Upgrade"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}