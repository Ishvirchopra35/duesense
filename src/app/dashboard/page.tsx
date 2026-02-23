"use client";

import { calcPanicScore, getPanicColor, getPanicLabel } from "@/lib/panic";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Flame, LayoutGrid, List, LogOut, Moon, Sun, Upload } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Assignment = {
  id: string;
  title: string;
  course: string;
  deadline: string;
  estimated_hours: number;
  priority?: "Low" | "Medium" | "High";
  completed?: boolean;
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

function getPacingText(deadline: string, estimatedHours: number, nowMs: number) {
  const diffMs = new Date(deadline).getTime() - nowMs;

  if (diffMs <= 0) {
    return null;
  }

  const daysRemaining = diffMs / (1000 * 60 * 60 * 24);

  if (daysRemaining < 1) {
    return "Due very soon — push through it";
  }

  const hoursPerDay = estimatedHours / daysRemaining;
  return `Spend ~${hoursPerDay.toFixed(1)} hrs/day to finish comfortably`;
}

function getUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getYesterdayUtcKey(date: Date) {
  const yesterday = new Date(date);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return getUtcDateKey(yesterday);
}

function getPriorityBadgeClass(priority: string) {
  switch (priority) {
    case "High":
      return "border-rose-400/80 bg-rose-100 text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-200";
    case "Low":
      return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "border-blue-400/80 bg-blue-100 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-200";
  }
}

const FREEMIUM_ENABLED = process.env.NEXT_PUBLIC_ENABLE_FREEMIUM === "true";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [nowMs, setNowMs] = useState(Date.now());
  const [userId, setUserId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [vibes, setVibes] = useState<Record<string, string>>({});
  const [vibeLoading, setVibeLoading] = useState<Record<string, boolean>>({});
  const [draftLoading, setDraftLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("free");
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignmentLimitModalOpen, setIsAssignmentLimitModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [isStudyPlanOpen, setIsStudyPlanOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("1");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [saving, setSaving] = useState(false);
  const [diagnoseLimitReached, setDiagnoseLimitReached] = useState<Record<string, boolean>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clearAllLoading, setClearAllLoading] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [draftAssignmentId, setDraftAssignmentId] = useState("");
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [studyPlanLoading, setStudyPlanLoading] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);
  const [surviveToday, setSurviveToday] = useState(false);
  const [streak, setStreak] = useState(0);
  const [roast, setRoast] = useState<string | null>(null);
  const [roastLoading, setRoastLoading] = useState(false);
  const [isRoastOpen, setIsRoastOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [dismissConflictBanner, setDismissConflictBanner] = useState(false);

  const deadlineConflict = useMemo(() => {
    const activeAssignments = assignments.filter((assignment) => !assignment.completed);

    if (activeAssignments.length < 2) {
      return { count: 0, titles: [] as string[] };
    }

    const sortedByDeadline = [...activeAssignments].sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    );

    const conflictingTitleSet = new Set<string>();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    for (let i = 0; i < sortedByDeadline.length; i += 1) {
      const currentDeadline = new Date(sortedByDeadline[i].deadline).getTime();

      for (let j = i + 1; j < sortedByDeadline.length; j += 1) {
        const comparisonDeadline = new Date(sortedByDeadline[j].deadline).getTime();

        if (comparisonDeadline - currentDeadline > ONE_DAY_MS) {
          break;
        }

        conflictingTitleSet.add(sortedByDeadline[i].title);
        conflictingTitleSet.add(sortedByDeadline[j].title);
      }
    }

    const titles = Array.from(conflictingTitleSet);
    return { count: titles.length, titles };
  }, [assignments]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.completed),
    [assignments]
  );

  const filteredAssignments = useMemo(() => {
    if (!surviveToday) {
      return activeAssignments;
    }

    const WINDOW_MS = 48 * 60 * 60 * 1000;
    return activeAssignments.filter((assignment) => {
      const diffMs = new Date(assignment.deadline).getTime() - nowMs;
      return diffMs > 0 && diffMs <= WINDOW_MS;
    });
  }, [activeAssignments, nowMs, surviveToday]);

  const studyPlanAssignments = useMemo(
    () =>
      activeAssignments.map((assignment) => ({
        title: assignment.title,
        course: assignment.course,
        deadline: assignment.deadline,
        estimated_hours: assignment.estimated_hours,
      })),
    [activeAssignments]
  );

  const roastAssignments = useMemo(
    () =>
      activeAssignments.map((assignment) => ({
        title: assignment.title,
        course: assignment.course,
        deadline: assignment.deadline,
        estimated_hours: assignment.estimated_hours,
        priority: assignment.priority ?? "Medium",
        panic_score: calcPanicScore(
          assignment.deadline,
          assignment.estimated_hours,
          assignment.priority ?? "Medium"
        ),
      })),
    [activeAssignments]
  );

  const studyPlanLines = useMemo(
    () => (studyPlan ? studyPlan.split("\n").map((line) => line.trim()).filter(Boolean) : []),
    [studyPlan]
  );

  const loadAssignments = useCallback(async (currentUserId: string) => {
    const { data, error: fetchError } = await supabase
      .from("assignments")
      .select("id, title, course, deadline, estimated_hours, priority, completed")
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
      .select("status, streak, last_active")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (subscriptionError) {
      setError(subscriptionError.message);
      return;
    }

    if (!data) {
      const { error: insertError } = await supabase
        .from("subscriptions")
        .insert({ user_id: currentUserId, status: "free", streak: 0, last_active: null });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setSubscriptionStatus("free");
      setStreak(0);
      return;
    }

    setSubscriptionStatus(data.status === "premium" ? "premium" : "free");
    setStreak(data.streak ?? 0);
  }, [supabase]);

  const updateStreak = useCallback(async (currentUserId: string) => {
    const { data, error: fetchError } = await supabase
      .from("subscriptions")
      .select("status, streak, last_active")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const now = new Date();
    const todayKey = getUtcDateKey(now);
    const yesterdayKey = getYesterdayUtcKey(now);

    if (!data) {
      const { error: insertError } = await supabase.from("subscriptions").insert({
        user_id: currentUserId,
        status: "free",
        streak: 1,
        last_active: `${todayKey}T00:00:00.000Z`,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setStreak(1);
      return;
    }

    const lastActiveKey = data.last_active ? getUtcDateKey(new Date(data.last_active)) : null;

    if (lastActiveKey === todayKey) {
      setStreak(data.streak ?? 0);
      return;
    }

    const nextStreak = lastActiveKey === yesterdayKey ? (data.streak ?? 0) + 1 : 1;
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ streak: nextStreak, last_active: `${todayKey}T00:00:00.000Z` })
      .eq("user_id", currentUserId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setStreak(nextStreak);
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
    setMounted(true);
  }, []);

  useEffect(() => {
    const savedView = window.localStorage.getItem("duesense:view");
    if (savedView === "list" || savedView === "card") {
      setViewMode(savedView);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("duesense:view", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (deadlineConflict.count === 0) {
      setDismissConflictBanner(false);
    }
  }, [deadlineConflict.count]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        router.replace("/auth");
        return;
      }

      setUserId(user.id);
      await loadSubscriptionStatus(user.id);
      await updateStreak(user.id);
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
        router.replace("/auth");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadAssignments, loadSubscriptionStatus, router, supabase, updateStreak]);


  const handleAddAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    const incompleteCount = assignments.filter((a) => !a.completed).length;
    if (FREEMIUM_ENABLED && subscriptionStatus === "free" && !editingId && incompleteCount >= 5) {
      setIsModalOpen(false);
      setIsAssignmentLimitModalOpen(true);
      return;
    }

    setSaving(true);
    setError(null);

    if (editingId) {
      const { error: updateError } = await supabase
        .from("assignments")
        .update({
          title,
          course,
          deadline: new Date(deadline).toISOString(),
          estimated_hours: Number(estimatedHours),
          priority,
        })
        .eq("id", editingId)
        .eq("user_id", userId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setAssignments((prev) =>
        prev
          .map((a) =>
            a.id === editingId
              ? {
                  ...a,
                  title,
                  course,
                  deadline: new Date(deadline).toISOString(),
                  estimated_hours: Number(estimatedHours),
                    priority,
                }
              : a
          )
          .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      );
    } else {
      const { data, error: insertError } = await supabase
        .from("assignments")
        .insert({
          user_id: userId,
          title,
          course,
          deadline: new Date(deadline).toISOString(),
          estimated_hours: Number(estimatedHours),
          priority,
          completed: false,
        })
        .select("id, title, course, deadline, estimated_hours, priority, completed")
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      setAssignments((prev) => [...prev, data as Assignment].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()));
    }

    setTitle("");
    setCourse("");
    setDeadline("");
    setEstimatedHours("1");
    setPriority("Medium");
    setEditingId(null);
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

  const handleCompleteAssignment = async (assignmentId: string) => {
    if (!userId) return;

    const { error: updateError } = await supabase
      .from("assignments")
      .update({ completed: true })
      .eq("id", assignmentId)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, completed: true } : a))
    );
    await updateStreak(userId);
  };

  const handleUndoAssignment = async (assignmentId: string) => {
    if (!userId) return;

    const { error: updateError } = await supabase
      .from("assignments")
      .update({ completed: false })
      .eq("id", assignmentId)
      .eq("user_id", userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, completed: false } : a))
    );
  };

  const handleEditAssignment = (assignment: Assignment) => {
    setEditingId(assignment.id);
    setTitle(assignment.title);
    setCourse(assignment.course);
    setDeadline(assignment.deadline.slice(0, 16));
    setEstimatedHours(assignment.estimated_hours.toString());
    setPriority(assignment.priority ?? "Medium");
    setIsModalOpen(true);
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
    const panicScore = calcPanicScore(
      assignment.deadline,
      assignment.estimated_hours,
      assignment.priority ?? "Medium"
    );

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

  const handleUploadSyllabus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    if (!uploadFile) {
      setUploadError("Please choose a file to upload.");
      return;
    }

    setUploadLoading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("userId", userId);

      const response = await fetch("/api/parse-syllabus", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result: { error?: string } = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok) {
        throw new Error(result.error || "Unable to parse syllabus.");
      }

      await loadAssignments(userId);
      setIsUploadModalOpen(false);
      setUploadFile(null);
    } catch (uploadError) {
      setUploadError(uploadError instanceof Error ? uploadError.message : "Unable to parse syllabus.");
    } finally {
      setUploadLoading(false);
    }
  };

  const handleStudyPlan = async () => {
    if (studyPlanAssignments.length === 0) {
      setStudyPlan(null);
      setStudyPlanError("No active assignments to plan yet.");
      setIsStudyPlanOpen(true);
      return;
    }

    setIsStudyPlanOpen(true);
    setStudyPlan(null);
    setStudyPlanError(null);
    setStudyPlanLoading(true);

    try {
      const response = await fetch("/api/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: studyPlanAssignments }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result: { plan?: string; error?: string } = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok || !result.plan) {
        throw new Error(result.error || "Failed to generate study plan.");
      }

      setStudyPlan(result.plan.trim());
    } catch (planError) {
      setStudyPlanError(planError instanceof Error ? planError.message : "Failed to generate study plan.");
    } finally {
      setStudyPlanLoading(false);
    }
  };

  const handleRoast = async () => {
    setIsRoastOpen(true);
    setRoast(null);
    setRoastLoading(true);

    try {
      const response = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: roastAssignments }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result: { roast?: string; error?: string } = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok || !result.roast) {
        throw new Error(result.error || "Failed to generate roast.");
      }

      setRoast(result.roast.trim());
    } catch (roastError) {
      setRoast(roastError instanceof Error ? roastError.message : "Failed to generate roast.");
    } finally {
      setRoastLoading(false);
    }
  };

  const handleOpenDraftModal = () => {
    setDraftSubject("");
    setDraftBody("");
    setCopySuccess(false);
    setDraftAssignmentId(activeAssignments[0]?.id ?? "");
    setIsDraftModalOpen(true);
  };

  const handleGenerateDraft = async () => {
    const assignment = activeAssignments.find((item) => item.id === draftAssignmentId);

    if (!assignment) {
      setError("Select an assignment to generate a draft.");
      return;
    }

    setDraftLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: assignment.title,
          course: assignment.course,
          deadline: assignment.deadline,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result: { subject?: string; body?: string; error?: string } = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok || !result.subject || !result.body) {
        throw new Error(result.error || "Could not generate extension draft right now.");
      }

      setDraftSubject(result.subject);
      setDraftBody(result.body);
      setCopySuccess(false);
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Could not generate extension draft right now.");
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCopyDraft = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftBody}`);
      setCopySuccess(true);
    } catch {
      setError("Could not copy draft to clipboard.");
    }
  };

  const handleClearAllAssignments = async () => {
    if (!userId) return;

    setClearAllLoading(true);
    setError(null);

    const { error: deleteError } = await supabase
      .from("assignments")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      setClearAllLoading(false);
      return;
    }

    setAssignments([]);
    setVibes({});
    setDiagnoseLimitReached({});
    setClearAllLoading(false);
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Loading dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 md:px-8 dark:bg-slate-950 dark:text-slate-100">
      <Link
        href="/"
        className="fixed left-4 top-4 z-50 rounded-lg border border-slate-300 bg-white/80 px-2.5 py-1.5 text-xs text-slate-600 shadow-sm backdrop-blur transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        ← Back
      </Link>
      {surviveToday ? (
        <div className="fixed right-4 top-4 z-50">
          <span className="rounded-full border border-amber-400/80 bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 shadow-sm shadow-amber-200/50 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200 dark:shadow-none">
            Filtering: due in 48h
          </span>
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="relative overflow-hidden rounded-3xl border border-slate-300/90 bg-gradient-to-br from-white/90 via-slate-50/80 to-indigo-50/70 p-7 shadow-2xl shadow-indigo-900/10 ring-1 ring-indigo-300/30 md:p-9 dark:border-slate-800 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-indigo-950/40 dark:shadow-black/30 dark:ring-indigo-500/20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_45%)]" />

          <div className="relative flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl dark:text-white">Wrap It Up Dashboard</h1>
                {FREEMIUM_ENABLED && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                      subscriptionStatus === "premium"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-slate-400 bg-slate-200 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {subscriptionStatus === "premium" ? "PREMIUM" : "FREE"}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 md:text-base dark:text-slate-400">Plan your work with clarity and stay ahead of every deadline.</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">Live deadline tracking with panic intelligence.</p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-3 md:w-auto md:items-end">
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <button
                  type="button"
                  onClick={() => handleOpenDraftModal()}
                  disabled={activeAssignments.length === 0}
                  className="w-full rounded-xl border border-sky-400/80 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto dark:border-sky-500/50 dark:text-sky-200 dark:hover:bg-sky-500/10"
                >
                  Draft Email
                </button>
                <button
                  type="button"
                  onClick={() => void handleRoast()}
                  disabled={roastLoading}
                  className="w-full rounded-xl border border-rose-400/80 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto dark:border-rose-500/50 dark:text-rose-200 dark:hover:bg-rose-500/10"
                >
                  {roastLoading ? "Roasting..." : "Roast Me"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleStudyPlan()}
                  disabled={studyPlanLoading || activeAssignments.length === 0}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {studyPlanLoading ? "Planning..." : "Study Plan"}
                </button>
                <button
                  type="button"
                  onClick={() => setSurviveToday((prev) => !prev)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition md:w-auto ${
                    surviveToday
                      ? "border-amber-500 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-500/60 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
                      : "border-amber-400/80 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/10"
                  }`}
                >
                  Survive Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setTitle("");
                    setCourse("");
                    setDeadline("");
                    setEstimatedHours("1");
                    setPriority("Medium");
                    setIsModalOpen(true);
                  }}
                  className="w-full rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 md:w-auto"
                >
                  + Add Assignment
                </button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center rounded-lg border border-slate-300 p-1 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setViewMode("card")}
                    className={`rounded-md p-1.5 transition ${
                      viewMode === "card"
                        ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                    aria-label="Card view"
                    title="Card view"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`rounded-md p-1.5 transition ${
                      viewMode === "list"
                        ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                    aria-label="List view"
                    title="List view"
                  >
                    <List size={16} />
                  </button>
                </div>
                {mounted && (
                  <button
                    type="button"
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    className="rounded-lg border border-slate-300 p-2.5 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label="Toggle theme"
                    title="Toggle theme"
                  >
                    {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    setUploadFile(null);
                    setIsUploadModalOpen(true);
                  }}
                  className="rounded-lg border border-slate-300 p-2.5 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Upload syllabus"
                  title="Upload syllabus"
                >
                  <Upload size={18} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    router.push("/auth");
                  }}
                  className="rounded-lg border border-slate-300 p-2.5 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Logout"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shouldClear = window.confirm("Clear all assignments? This cannot be undone.");
                    if (!shouldClear) return;
                    void handleClearAllAssignments();
                  }}
                  disabled={clearAllLoading || assignments.length === 0}
                  className="rounded-lg border border-rose-400/80 px-2.5 py-1.5 text-xs text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/60 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  {clearAllLoading ? "Clearing..." : "Clear All"}
                </button>
              </div>
              {streak > 1 ? (
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/70 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                    <Flame size={14} />
                    {streak}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {deadlineConflict.count > 0 && !dismissConflictBanner ? (
          <div className="relative rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
            <button
              type="button"
              onClick={() => setDismissConflictBanner(true)}
              className="absolute right-3 top-3 rounded px-2 py-0.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              aria-label="Dismiss conflict warning"
            >
              ×
            </button>
            <p className="text-sm font-semibold">
              Heads up — you have {deadlineConflict.count} assignments due within 24 hours of each other
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {deadlineConflict.titles.join(" • ")}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-300 bg-rose-100 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        <section className="space-y-8">
          {filteredAssignments.length > 0 && viewMode === "card" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAssignments.map((assignment) => {
            const { label } = formatCountdown(assignment.deadline, nowMs);
            const panicScore = calcPanicScore(
              assignment.deadline,
              assignment.estimated_hours,
              assignment.priority ?? "Medium"
            );
            const panicColor = getPanicColor(panicScore);
            const panicLabel = getPanicLabel(panicScore);
              const pacingText = getPacingText(assignment.deadline, assignment.estimated_hours, nowMs);
              const priorityLabel = assignment.priority ?? "Medium";

            return (
              <article
                key={assignment.id}
                className="space-y-4 rounded-2xl border border-slate-300 bg-white p-5 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-black/20"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{assignment.title}</h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                        priorityLabel
                      )}`}
                    >
                      {priorityLabel}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{assignment.course}</p>
                </div>

                <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                  <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-500">Countdown</p>
                  <p className="mt-1 text-lg font-bold text-cyan-600 dark:text-cyan-300">{label}</p>
                </div>

                <div
                  className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold"
                  style={{ color: panicColor, borderColor: panicColor }}
                >
                  {panicLabel} · {panicScore}
                </div>

                {pacingText ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{pacingText}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {diagnoseLimitReached[assignment.id] ? (
                    <button
                      type="button"
                      onClick={() => void startUpgradeCheckout()}
                      disabled={upgradeLoading}
                      className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                    >
                      {upgradeLoading ? "Redirecting..." : "Upgrade"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVibe(assignment)}
                      disabled={vibeLoading[assignment.id]}
                      className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                    >
                      {vibeLoading[assignment.id] ? "Thinking..." : "Diagnose"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEditAssignment(assignment)}
                    className="rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-600 transition hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCompleteAssignment(assignment.id)}
                    className="rounded-lg border border-emerald-500 px-3 py-2 text-sm text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(assignment.id)}
                    className="rounded-lg border border-rose-500 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    Delete
                  </button>
                </div>

                {vibes[assignment.id] ? (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-200">
                    <span>{vibes[assignment.id]}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setVibes((prev) => {
                          const updated = { ...prev };
                          delete updated[assignment.id];
                          return updated;
                        })
                      }
                      className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label="Clear diagnosis"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}

                {diagnoseLimitReached[assignment.id] ? (
                  <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                    Daily limit reached — upgrade for unlimited
                  </p>
                ) : null}
              </article>
            );
            })
          }
            </div>
          )}

          {filteredAssignments.length > 0 && viewMode === "list" && (
            <div className="space-y-3">
              {filteredAssignments.map((assignment) => {
                const { label } = formatCountdown(assignment.deadline, nowMs);
                const panicScore = calcPanicScore(
                  assignment.deadline,
                  assignment.estimated_hours,
                  assignment.priority ?? "Medium"
                );
                const panicColor = getPanicColor(panicScore);
                const panicLabel = getPanicLabel(panicScore);
                const priorityLabel = assignment.priority ?? "Medium";

                return (
                  <div
                    key={assignment.id}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-black/20"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{assignment.title}</h2>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                priorityLabel
                              )}`}
                            >
                              {priorityLabel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{assignment.course}</p>
                        </div>
                        <div className="text-sm font-semibold text-cyan-600 dark:text-cyan-300">{label}</div>
                        <div
                          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold"
                          style={{ color: panicColor, borderColor: panicColor }}
                        >
                          {panicLabel} · {panicScore}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {diagnoseLimitReached[assignment.id] ? (
                          <button
                            type="button"
                            onClick={() => void startUpgradeCheckout()}
                            disabled={upgradeLoading}
                            className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                          >
                            {upgradeLoading ? "Redirecting..." : "Upgrade"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleVibe(assignment)}
                            disabled={vibeLoading[assignment.id]}
                            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
                          >
                            {vibeLoading[assignment.id] ? "Thinking..." : "Diagnose"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditAssignment(assignment)}
                          className="rounded-lg border border-blue-500 px-3 py-1.5 text-xs text-blue-600 transition hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCompleteAssignment(assignment.id)}
                          className="rounded-lg border border-emerald-500 px-3 py-1.5 text-xs text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(assignment.id)}
                          className="rounded-lg border border-rose-500 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {surviveToday && filteredAssignments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-6 text-center text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              Nothing due in the next 48 hours. Go touch grass.
            </div>
          ) : null}

          {assignments.filter((a) => a.completed).length > 0 && viewMode === "card" && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-slate-600 dark:text-slate-400">Completed</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assignments
                  .filter((a) => a.completed)
                  .map((assignment) => {
                    const priorityLabel = assignment.priority ?? "Medium";
                    return (
                      <article
                        key={assignment.id}
                        className="space-y-4 rounded-2xl border border-slate-300 bg-slate-100 p-5 shadow-xl shadow-slate-200/30 opacity-60 dark:border-slate-800 dark:bg-slate-900/30 dark:shadow-black/20"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-bold text-slate-900 line-through dark:text-white">{assignment.title}</h2>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                priorityLabel
                              )}`}
                            >
                              {priorityLabel}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 line-through dark:text-slate-400">{assignment.course}</p>
                        </div>

                        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
                          <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-500">Deadline</p>
                          <p className="mt-1 text-sm text-slate-700 line-through dark:text-slate-300">{new Date(assignment.deadline).toLocaleString()}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUndoAssignment(assignment.id)}
                            className="rounded-lg border border-amber-500 px-3 py-2 text-sm text-amber-600 transition hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                          >
                            Undo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(assignment.id)}
                            className="rounded-lg border border-rose-500 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </div>
          )}

          {assignments.filter((a) => a.completed).length > 0 && viewMode === "list" && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-slate-600 dark:text-slate-400">Completed</h3>
              <div className="space-y-3">
                {assignments
                  .filter((a) => a.completed)
                  .map((assignment) => {
                    const { label } = formatCountdown(assignment.deadline, nowMs);
                    const priorityLabel = assignment.priority ?? "Medium";

                    return (
                      <div
                        key={assignment.id}
                        className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-lg shadow-slate-200/30 opacity-70 dark:border-slate-800 dark:bg-slate-900/30 dark:shadow-black/20"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-slate-900 line-through dark:text-white">{assignment.title}</h2>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                    priorityLabel
                                  )}`}
                                >
                                  {priorityLabel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 line-through dark:text-slate-400">{assignment.course}</p>
                            </div>
                            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUndoAssignment(assignment.id)}
                              className="rounded-lg border border-amber-500 px-3 py-1.5 text-xs text-amber-600 transition hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                            >
                              Undo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(assignment.id)}
                              className="rounded-lg border border-rose-500 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-400 bg-slate-100 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
            No assignments yet. Add your first deadline.
          </div>
        ) : null}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 dark:bg-slate-950/80">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">{editingId ? "Edit Assignment" : "New Assignment"}</h2>

            <form onSubmit={handleAddAssignment} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm text-slate-700 dark:text-slate-300">
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="course" className="text-sm text-slate-700 dark:text-slate-300">
                  Course
                </label>
                <input
                  id="course"
                  type="text"
                  required
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="deadline" className="text-sm text-slate-700 dark:text-slate-300">
                  Deadline
                </label>
                <input
                  id="deadline"
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="estimatedHours" className="text-sm text-slate-700 dark:text-slate-300">
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="priority" className="text-sm text-slate-700 dark:text-slate-300">
                  Priority
                </label>
                <select
                  id="priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as "Low" | "Medium" | "High")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isUploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 dark:bg-slate-950/80">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Upload Syllabus</h2>

            <form onSubmit={handleUploadSyllabus} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="syllabus" className="text-sm text-slate-700 dark:text-slate-300">
                  Syllabus file
                </label>
                <input
                  id="syllabus"
                  type="file"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                />
              </div>

              {uploadError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                  {uploadError}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                >
                  {uploadLoading ? "Processing..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAssignmentLimitModalOpen && FREEMIUM_ENABLED ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 dark:bg-slate-950/80">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
            <p className="text-base text-slate-900 dark:text-slate-100">
              Free plan is limited to 5 assignments. Upgrade to Premium for $2.99/month for unlimited.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAssignmentLimitModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void startUpgradeCheckout()}
                disabled={upgradeLoading}
                className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
              >
                {upgradeLoading ? "Redirecting..." : "Upgrade"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStudyPlanOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 dark:bg-slate-950/80">
          <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">7-Day Study Plan</h2>

            {studyPlanLoading ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Generating your plan...</p>
            ) : studyPlanError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {studyPlanError}
              </p>
            ) : studyPlanLines.length > 0 ? (
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
                {studyPlanLines.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">No study plan available yet.</p>
            )}

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsStudyPlanOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isRoastOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 dark:bg-slate-950/80">
          <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Roast Me</h2>

            {roastLoading ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Generating roast...</p>
            ) : roast ? (
              <p className="text-sm text-slate-700 dark:text-slate-200">{roast}</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">No roast available yet.</p>
            )}

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsRoastOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDraftModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 dark:bg-slate-950/80">
          <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Extension Email Draft</h2>

            {activeAssignments.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No active assignments to draft.</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="draftAssignment" className="text-sm text-slate-700 dark:text-slate-300">
                    Assignment
                  </label>
                  <select
                    id="draftAssignment"
                    value={draftAssignmentId}
                    onChange={(event) => setDraftAssignmentId(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-500/30 transition focus:ring dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:ring-indigo-500/50"
                  >
                    {activeAssignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.title} — {assignment.course}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => void handleGenerateDraft()}
                  disabled={draftLoading}
                  className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
                >
                  {draftLoading ? "Generating..." : "Generate"}
                </button>
              </div>
            )}

            {draftSubject && draftBody ? (
              <div className="mt-4 space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
                <p>
                  <span className="font-semibold">Subject:</span> {draftSubject}
                </p>
                <p className="whitespace-pre-wrap">{draftBody}</p>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              {copySuccess ? (
                <p className="mr-auto text-xs text-emerald-600 dark:text-emerald-300">Copied to clipboard</p>
              ) : null}
              <button
                type="button"
                onClick={() => setIsDraftModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleCopyDraft()}
                disabled={!draftSubject || !draftBody}
                className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-400"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}