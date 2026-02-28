"use client";

import { calcPanicScore, getPanicLabel } from "@/lib/panic";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Calendar, Flame, LayoutGrid, List, LogOut, Moon, Settings, Sun, Upload } from "lucide-react";
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
type ColorTheme = "default" | "green" | "sunset" | "midnight";

const COLOR_THEME_KEY = "colorTheme";
const COLOR_THEMES: ReadonlyArray<{ value: ColorTheme; label: string; swatch: string }> = [
  { value: "default", label: "Default", swatch: "#6366f1" },
  { value: "green", label: "Forest", swatch: "#10b981" },
  { value: "sunset", label: "Sunset", swatch: "#f59e0b" },
  { value: "midnight", label: "Midnight", swatch: "#e2e8f0" },
];

function isColorTheme(value: string | null): value is ColorTheme {
  return value === "default" || value === "green" || value === "sunset" || value === "midnight";
}

function formatConflictTitles(titles: string[]) {
  if (titles.length <= 1) {
    return titles[0] ?? "";
  }

  if (titles.length === 2) {
    return `${titles[0]} and ${titles[1]}`;
  }

  return `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
}

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
      return "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/50 dark:bg-rose-500/25 dark:text-rose-100";
    case "Low":
      return "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/50 dark:bg-emerald-500/25 dark:text-emerald-100";
    default:
      return "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/25 dark:text-amber-100";
  }
}

function getPanicBadgeClass(score: number) {
  if (score < 35) {
    return "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/50 dark:bg-emerald-500/25 dark:text-emerald-100";
  }

  if (score < 70) {
    return "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/25 dark:text-amber-100";
  }

  return "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/50 dark:bg-rose-500/25 dark:text-rose-100";
}

function getPanicCardAccentClass() {
  return "border-l-[3px] border-l-[color:var(--accent-soft-border)] dark:border-l-[color:var(--accent)]";
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
  const [studyPlan, setStudyPlan] = useState<string | Array<{ day: string; date?: string; tasks: string[] }> | null>(null);
  const [studyPlanLoading, setStudyPlanLoading] = useState(false);
  const [studyPlanError, setStudyPlanError] = useState<string | null>(null);
  const [surviveToday, setSurviveToday] = useState(false);
  const [streak, setStreak] = useState(0);
  const [roast, setRoast] = useState<string | null>(null);
  const [roastLoading, setRoastLoading] = useState(false);
  const [isRoastOpen, setIsRoastOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [dismissConflictBanner, setDismissConflictBanner] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("default");
  const [defaultPriority, setDefaultPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [defaultView, setDefaultView] = useState<"card" | "list">("card");
  const [compactMode, setCompactMode] = useState(false);
  const [tempDefaultPriority, setTempDefaultPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [tempDefaultView, setTempDefaultView] = useState<"card" | "list">("card");
  const [tempCompactMode, setTempCompactMode] = useState(false);
  const [sortBy, setSortBy] = useState<"deadline" | "panic" | "course" | "priority">("deadline");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "completed">("active");
  const badgeToneClass = colorTheme === "midnight" ? "saturate-[0.75]" : "";

  const deadlineConflict = useMemo(() => {
    const activeAssignments = assignments.filter((assignment) => !assignment.completed);

    if (activeAssignments.length < 2) {
      return { count: 0, groups: [] as string[][] };
    }

    const sortedByDeadline = [...activeAssignments].sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    );

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const connectedComponents: Assignment[][] = [];
    let componentStart = 0;

    for (let i = 1; i < sortedByDeadline.length; i += 1) {
      const previousDeadline = new Date(sortedByDeadline[i - 1].deadline).getTime();
      const currentDeadline = new Date(sortedByDeadline[i].deadline).getTime();

      if (currentDeadline - previousDeadline > ONE_DAY_MS) {
        connectedComponents.push(sortedByDeadline.slice(componentStart, i));
        componentStart = i;
      }
    }

    connectedComponents.push(sortedByDeadline.slice(componentStart));

    const groups: string[][] = [];

    connectedComponents.forEach((component) => {
      if (component.length < 2) {
        return;
      }

      const firstDeadline = new Date(component[0].deadline).getTime();
      const lastDeadline = new Date(component[component.length - 1].deadline).getTime();

      if (lastDeadline - firstDeadline <= ONE_DAY_MS) {
        groups.push(component.map((assignment) => assignment.title));
        return;
      }

      for (let i = 0; i < component.length - 1; i += 1) {
        const currentDeadline = new Date(component[i].deadline).getTime();
        const nextDeadline = new Date(component[i + 1].deadline).getTime();

        if (nextDeadline - currentDeadline <= ONE_DAY_MS) {
          groups.push([component[i].title, component[i + 1].title]);
        }
      }
    });

    const uniqueConflictingTitles = new Set(groups.flat());

    return { count: uniqueConflictingTitles.size, groups };
  }, [assignments]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.completed),
    [assignments]
  );

  const uniqueCourses = useMemo(() => {
    const courses = new Set(assignments.map((a) => a.course));
    return Array.from(courses).sort();
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    // Start with base filtering based on status
    let filtered = assignments;
    
    if (filterStatus === "active") {
      filtered = filtered.filter((a) => !a.completed);
    } else if (filterStatus === "completed") {
      filtered = filtered.filter((a) => a.completed);
    }

    // Apply survive today mode if active (only for non-completed assignments)
    if (surviveToday && filterStatus !== "completed") {
      const WINDOW_MS = 48 * 60 * 60 * 1000;
      filtered = filtered.filter((assignment) => {
        const diffMs = new Date(assignment.deadline).getTime() - nowMs;
        return diffMs > 0 && diffMs <= WINDOW_MS;
      });
    }

    // Filter by course
    if (filterCourse !== "all") {
      filtered = filtered.filter((a) => a.course === filterCourse);
    }

    // Sort the filtered assignments
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "deadline") {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      } else if (sortBy === "panic") {
        const panicA = calcPanicScore(a.deadline, a.estimated_hours, a.priority ?? "Medium");
        const panicB = calcPanicScore(b.deadline, b.estimated_hours, b.priority ?? "Medium");
        return panicB - panicA; // Highest first
      } else if (sortBy === "course") {
        return a.course.localeCompare(b.course);
      } else if (sortBy === "priority") {
        const priorityOrder = { High: 3, Medium: 2, Low: 1 };
        const priorityA = priorityOrder[a.priority ?? "Medium"];
        const priorityB = priorityOrder[b.priority ?? "Medium"];
        return priorityB - priorityA; // Highest first
      }
      return 0;
    });

    return sorted;
  }, [assignments, filterStatus, filterCourse, sortBy, surviveToday, nowMs]);

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

  const parsedStudyPlan = useMemo(() => {
    if (!studyPlan) return [];

    const dayStyleByName: Record<string, { bgColor: string; textColor: string; borderColor: string }> = {
      Monday: { bgColor: "bg-[var(--accent-soft-bg)] dark:bg-[var(--accent-soft-bg-dark)]", textColor: "text-[var(--accent-text)] dark:text-[var(--accent-text-dark)]", borderColor: "border-[color:var(--accent-soft-border)] dark:border-[color:var(--accent-soft-border-dark)]" },
      Tuesday: { bgColor: "bg-violet-50 dark:bg-violet-500/10", textColor: "text-violet-700 dark:text-violet-300", borderColor: "border-violet-200 dark:border-violet-500/30" },
      Wednesday: { bgColor: "bg-rose-50 dark:bg-rose-500/10", textColor: "text-rose-700 dark:text-rose-300", borderColor: "border-rose-200 dark:border-rose-500/30" },
      Thursday: { bgColor: "bg-emerald-50 dark:bg-emerald-500/10", textColor: "text-emerald-700 dark:text-emerald-300", borderColor: "border-emerald-200 dark:border-emerald-500/30" },
      Friday: { bgColor: "bg-amber-50 dark:bg-amber-500/10", textColor: "text-amber-700 dark:text-amber-300", borderColor: "border-amber-200 dark:border-amber-500/30" },
      Saturday: { bgColor: "bg-sky-50 dark:bg-sky-500/10", textColor: "text-sky-700 dark:text-sky-300", borderColor: "border-sky-200 dark:border-sky-500/30" },
      Sunday: { bgColor: "bg-orange-50 dark:bg-orange-500/10", textColor: "text-orange-700 dark:text-orange-300", borderColor: "border-orange-200 dark:border-orange-500/30" },
    };

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const orderedDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      const displayLabel = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      const style = dayStyleByName[dayName] ?? dayStyleByName.Monday;
      return {
        dayName,
        displayLabel,
        ...style,
      };
    });

    // If studyPlan is already structured (array format from API)
    if (Array.isArray(studyPlan)) {
      return orderedDays.map((dayInfo, index) => {
        const dayData = studyPlan[index];
        return {
          ...dayInfo,
          tasks: Array.isArray(dayData?.tasks) ? dayData.tasks : [],
        };
      });
    }

    // Legacy: Parse string format
    const lines = studyPlan.split("\n").map((line) => line.trim()).filter(Boolean);
    const tasksByDay = Array.from({ length: 7 }, () => [] as string[]);
    let currentDayIndex = -1;

    for (const line of lines) {
      const matchedIndex = orderedDays.findIndex((day) =>
        line.toLowerCase().startsWith(day.dayName.toLowerCase())
      );

      if (matchedIndex >= 0) {
        currentDayIndex = matchedIndex;
      } else if (currentDayIndex >= 0 && line) {
        const cleanTask = line.replace(/^[-•*]\s*/, "").trim();
        if (cleanTask) {
          tasksByDay[currentDayIndex].push(cleanTask);
        }
      }
    }

    return orderedDays.map((dayInfo, index) => ({
      ...dayInfo,
      tasks: tasksByDay[index],
    }));
  }, [studyPlan]);

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

  const applyColorTheme = useCallback((nextTheme: ColorTheme) => {
    setColorTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem(COLOR_THEME_KEY, nextTheme);
  }, []);

  useEffect(() => {
    const savedColorTheme = window.localStorage.getItem(COLOR_THEME_KEY);
    if (isColorTheme(savedColorTheme)) {
      setColorTheme(savedColorTheme);
      document.documentElement.setAttribute("data-theme", savedColorTheme);
      return;
    }

    document.documentElement.setAttribute("data-theme", "default");
    window.localStorage.setItem(COLOR_THEME_KEY, "default");
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
    const savedDefaultPriority = window.localStorage.getItem("duesense:defaultPriority");
    if (savedDefaultPriority === "Low" || savedDefaultPriority === "Medium" || savedDefaultPriority === "High") {
      setDefaultPriority(savedDefaultPriority);
      setTempDefaultPriority(savedDefaultPriority);
    }

    const savedDefaultView = window.localStorage.getItem("duesense:defaultView");
    if (savedDefaultView === "list" || savedDefaultView === "card") {
      setDefaultView(savedDefaultView);
      setTempDefaultView(savedDefaultView);
      setViewMode(savedDefaultView);
    }

    const savedCompactMode = window.localStorage.getItem("duesense:compactMode");
    if (savedCompactMode === "true") {
      setCompactMode(true);
      setTempCompactMode(true);
    }
  }, []);

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
    setPriority(defaultPriority);
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
        body: JSON.stringify({
          assignments: studyPlanAssignments,
          todayIso: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const result: { plan?: string | Array<{ day: string; date?: string; tasks: string[] }>; error?: string } = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok || !result.plan) {
        throw new Error(result.error || "Failed to generate study plan.");
      }

      // Handle both string (legacy) and structured array responses
      if (typeof result.plan === "string") {
        setStudyPlan(result.plan.trim());
      } else {
        setStudyPlan(result.plan);
      }
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
      <main className="flex min-h-screen items-center justify-center bg-white px-4 text-[#4a4a4a] dark:bg-[#111318] dark:text-slate-300">
        Loading dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-[#1a1a1a] md:px-8 dark:bg-[#111318] dark:text-slate-100">
      <Link
        href="/"
        className="fixed left-4 top-4 z-50 rounded-lg border border-slate-300 bg-white/90 px-2.5 py-1.5 text-xs text-slate-600 shadow-sm backdrop-blur transition hover:bg-white dark:border-slate-700 dark:bg-[#161a22]/90 dark:text-slate-300 dark:hover:bg-[#1b202b]"
      >
        ← Back
      </Link>
      {surviveToday ? (
        <div className="fixed right-4 top-4 z-50">
          <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
            Filtering: due in 48h
          </span>
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="relative overflow-hidden rounded-3xl border border-slate-300/90 bg-slate-50/80 p-7 shadow-lg shadow-slate-200/30 md:p-8 dark:border-slate-800 dark:bg-[#161a22] dark:shadow-black/25">
          <div className="pointer-events-none absolute inset-0 bg-[image:var(--header-overlay-light)] dark:bg-[image:var(--header-overlay-dark)]" />
          <div className="pointer-events-none absolute inset-0 bg-[image:var(--header-radial-light)] dark:bg-[image:var(--header-radial-dark)]" />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="bg-[image:var(--header-title-gradient-light)] bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl dark:bg-[image:var(--header-title-gradient-dark)]">Wrap It Up Dashboard</h1>
                {FREEMIUM_ENABLED && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                      subscriptionStatus === "premium"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/50 dark:bg-emerald-500/25 dark:text-emerald-100"
                        : "border-slate-300 bg-slate-100 text-[#4a4a4a] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {subscriptionStatus === "premium" ? "PREMIUM" : "FREE"}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-[#2f2f2f] md:text-base dark:text-slate-200">Plan your work with clarity and stay ahead of every deadline.</p>
              <p className="text-xs text-[#3f3f3f] dark:text-slate-300">Live deadline tracking with calm, readable priorities.</p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-3 md:w-auto md:items-end">
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <button
                  type="button"
                  onClick={() => handleOpenDraftModal()}
                  disabled={activeAssignments.length === 0}
                  className="w-full rounded-xl border border-[color:var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-[var(--accent-soft-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto dark:border-[color:var(--accent-soft-border-dark)] dark:bg-[var(--accent-soft-bg-dark)] dark:text-slate-100 dark:hover:bg-[var(--accent-soft-bg-dark-hover)]"
                >
                  Draft Email
                </button>
                <button
                  type="button"
                  onClick={() => void handleRoast()}
                  disabled={roastLoading}
                  className="w-full rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-slate-100 dark:hover:bg-rose-500/20"
                >
                  {roastLoading ? "Roasting..." : "Roast Me"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleStudyPlan()}
                  disabled={studyPlanLoading || activeAssignments.length === 0}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[#111111] transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-slate-100 dark:hover:bg-emerald-500/20"
                >
                  {studyPlanLoading ? "Planning..." : "Study Plan"}
                </button>
                <button
                  type="button"
                  onClick={() => setSurviveToday((prev) => !prev)}
                  className={`w-full rounded-xl border px-4 py-3 text-sm font-semibold transition md:w-auto ${
                    surviveToday
                      ? "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/25"
                      : "border-slate-400 bg-white text-[#111111] hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
                  className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-[var(--accent-shadow)] transition hover:bg-[var(--accent-hover)] md:w-auto"
                >
                  + Add Assignment
                </button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center rounded-lg border border-slate-500 bg-white/85 p-1 dark:border-slate-600 dark:bg-transparent">
                  <button
                    type="button"
                    onClick={() => setViewMode("card")}
                    className={`rounded-md p-1.5 transition ${
                      viewMode === "card"
                        ? "bg-slate-300 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-700 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
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
                        ? "bg-slate-300 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-700 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
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
                    className="rounded-lg border border-slate-500 bg-white/85 p-2.5 text-slate-800 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label="Toggle theme"
                    title="Toggle theme"
                  >
                    {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTempDefaultPriority(defaultPriority);
                    setTempDefaultView(defaultView);
                    setTempCompactMode(compactMode);
                    setIsSettingsOpen(true);
                  }}
                  className="rounded-lg border border-slate-500 bg-white/85 p-2.5 text-slate-800 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-700"
                  aria-label="Settings"
                  title="Settings"
                >
                  <Settings size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    setUploadFile(null);
                    setIsUploadModalOpen(true);
                  }}
                  className="rounded-lg border border-slate-500 bg-white/85 p-2.5 text-slate-800 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-700"
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
                  className="rounded-lg border border-slate-500 bg-white/85 p-2.5 text-slate-800 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-700"
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
                  className="rounded-lg border border-slate-400 bg-white px-2.5 py-1.5 text-xs text-[#1a1a1a] transition hover:border-rose-400 hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-200"
                >
                  {clearAllLoading ? "Clearing..." : "Clear All"}
                </button>
              </div>
              {streak > 1 ? (
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-500/50 dark:bg-gradient-to-r dark:from-amber-600/30 dark:to-orange-600/30 dark:text-amber-100">
                    <Flame size={14} />
                    {streak}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {deadlineConflict.count > 0 && !dismissConflictBanner ? (
          <div className="relative rounded-lg border border-amber-300 bg-amber-100 px-4 py-3 text-amber-900 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200">
            <button
              type="button"
              onClick={() => setDismissConflictBanner(true)}
              className="absolute right-3 top-3 rounded px-2 py-0.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200 dark:text-amber-100 dark:hover:bg-amber-500/20"
              aria-label="Dismiss conflict warning"
            >
              ×
            </button>
            <p className="text-sm font-semibold">
              Heads up — these groups are due within 24 hours:
            </p>
            <div className="mt-1 space-y-1 text-sm text-amber-800 dark:text-amber-100">
              {deadlineConflict.groups.map((groupTitles, index) => (
                <p key={`${groupTitles.join("-")}-${index}`}>
                  • {formatConflictTitles(groupTitles)}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-300 bg-rose-100 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        {/* Sort and Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-[#1b202b]">
          {/* Sort By */}
          <div className="flex items-center gap-2">
            <label htmlFor="sort-by" className="text-xs font-medium text-[#555555] dark:text-slate-400">
              Sort:
            </label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "deadline" | "panic" | "course" | "priority")}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-600 dark:bg-[#161a22] dark:text-slate-200"
            >
              <option value="deadline">Deadline (soonest)</option>
              <option value="panic">Panic Score (highest)</option>
              <option value="course">Course (A-Z)</option>
              <option value="priority">Priority (highest)</option>
            </select>
          </div>

          {/* Filter by Course */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-course" className="text-xs font-medium text-[#555555] dark:text-slate-400">
              Course:
            </label>
            <select
              id="filter-course"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-600 dark:bg-[#161a22] dark:text-slate-200"
            >
              <option value="all">All Courses</option>
              {uniqueCourses.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#555555] dark:text-slate-400">Status:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterStatus === "all"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-white text-[#555555] hover:bg-slate-100 dark:bg-[#161a22] dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("active")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterStatus === "active"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-white text-[#555555] hover:bg-slate-100 dark:bg-[#161a22] dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("completed")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterStatus === "completed"
                    ? "bg-[var(--accent)] text-white"
                    : "bg-white text-[#555555] hover:bg-slate-100 dark:bg-[#161a22] dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Completed
              </button>
            </div>
          </div>
        </div>

        <section className="space-y-8">
          {filteredAssignments.length > 0 && viewMode === "card" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAssignments.map((assignment) => {
            const priorityLabel = assignment.priority ?? "Medium";

            // Render completed assignments differently
            if (assignment.completed) {
              return (
                <article
                  key={assignment.id}
                  className={`rounded-2xl border border-slate-300 bg-slate-100 shadow-sm opacity-65 dark:border-slate-800 dark:bg-[#161a22]/70 ${compactMode ? "space-y-3 p-4" : "space-y-4 p-5"}`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={`font-semibold text-[#111111] line-through dark:text-white ${compactMode ? "text-lg" : "text-xl"}`}>{assignment.title}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                          priorityLabel
                        )} ${badgeToneClass}`}
                      >
                        {priorityLabel}
                      </span>
                    </div>
                    <p className={`text-[#555555] line-through dark:text-slate-400 ${compactMode ? "text-xs" : "text-sm"}`}>{assignment.course}</p>
                  </div>

                  <div className={`rounded-lg border border-slate-300 bg-slate-50 px-3 dark:border-slate-700 dark:bg-[#1b202b] ${compactMode ? "py-1.5" : "py-2"}`}>
                    <p className="text-xs uppercase tracking-wide text-[#777777] dark:text-slate-500">Deadline</p>
                    <p className="mt-1 text-sm text-slate-700 line-through dark:text-slate-300">{new Date(assignment.deadline).toLocaleString()}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUndoAssignment(assignment.id)}
                      className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(assignment.id)}
                      className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            }

            // Render active assignments with panic scores and full functionality
            const { label } = formatCountdown(assignment.deadline, nowMs);
            const panicScore = calcPanicScore(
              assignment.deadline,
              assignment.estimated_hours,
              assignment.priority ?? "Medium"
            );
            const panicLabel = getPanicLabel(panicScore);
              const pacingText = getPacingText(assignment.deadline, assignment.estimated_hours, nowMs);

            return (
              <article
                key={assignment.id}
                className={`rounded-2xl border border-slate-300 bg-white shadow-md shadow-slate-200/35 dark:border-slate-800 dark:bg-[#161a22] dark:shadow-black/25 ${getPanicCardAccentClass()} ${compactMode ? "space-y-3 p-4" : "space-y-4 p-6"}`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={`font-semibold text-[#111111] dark:text-white ${compactMode ? "text-lg" : "text-xl"}`}>{assignment.title}</h2>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                        priorityLabel
                      )} ${badgeToneClass}`}
                    >
                      {priorityLabel}
                    </span>
                  </div>
                  <p className={`text-[#555555] dark:text-slate-400 ${compactMode ? "text-xs" : "text-sm"}`}>{assignment.course}</p>
                </div>

                <div className={`rounded-lg border border-slate-300 bg-slate-50 px-3 dark:border-slate-700 dark:bg-[#1b202b] ${compactMode ? "py-1.5" : "py-2"}`}>
                  <p className="text-xs uppercase tracking-wide text-[#777777] dark:text-slate-500">Countdown</p>
                  <p className={`mt-1 font-semibold text-[var(--accent-text)] dark:text-[var(--accent-text-dark)] ${compactMode ? "text-base" : "text-lg"}`}>{label}</p>
                </div>

                <div
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${getPanicBadgeClass(
                    panicScore
                  )} ${badgeToneClass}`}
                >
                  {panicLabel} · {panicScore}
                </div>

                {pacingText ? (
                  <p className="text-xs text-[#555555] dark:text-slate-400">{pacingText}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {diagnoseLimitReached[assignment.id] ? (
                    <button
                      type="button"
                      onClick={() => void startUpgradeCheckout()}
                      disabled={upgradeLoading}
                      className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-[var(--accent-shadow)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {upgradeLoading ? "Redirecting..." : "Upgrade"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVibe(assignment)}
                      disabled={vibeLoading[assignment.id]}
                      className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-[var(--accent-shadow)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {vibeLoading[assignment.id] ? "Thinking..." : "Diagnose"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEditAssignment(assignment)}
                    className="rounded-lg bg-slate-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCompleteAssignment(assignment.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(assignment.id)}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
                  >
                    Delete
                  </button>
                </div>

                {vibes[assignment.id] ? (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-[#1a1a1a] dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-200">
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
                  <p className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200">
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
                const priorityLabel = assignment.priority ?? "Medium";

                // Render completed assignments differently
                if (assignment.completed) {
                  return (
                    <div
                      key={assignment.id}
                      className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-sm opacity-70 dark:border-slate-800 dark:bg-[#161a22]/70"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-semibold text-[#111111] line-through dark:text-white">{assignment.title}</h2>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                  priorityLabel
                                )} ${badgeToneClass}`}
                              >
                                {priorityLabel}
                              </span>
                            </div>
                            <p className="text-xs text-[#555555] line-through dark:text-slate-400">{assignment.course}</p>
                          </div>
                          <div className="text-sm text-slate-700 line-through dark:text-slate-300">{new Date(assignment.deadline).toLocaleString()}</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUndoAssignment(assignment.id)}
                            className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                          >
                            Undo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(assignment.id)}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Render active assignments with panic scores and full functionality
                const { label } = formatCountdown(assignment.deadline, nowMs);
                const panicScore = calcPanicScore(
                  assignment.deadline,
                  assignment.estimated_hours,
                  assignment.priority ?? "Medium"
                );
                const panicLabel = getPanicLabel(panicScore);

                return (
                  <div
                    key={assignment.id}
                    className={`rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm shadow-slate-200/25 dark:border-slate-800 dark:bg-[#161a22] dark:shadow-black/20 ${getPanicCardAccentClass()}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-[#111111] dark:text-white">{assignment.title}</h2>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                priorityLabel
                              )} ${badgeToneClass}`}
                            >
                              {priorityLabel}
                            </span>
                          </div>
                          <p className="text-xs text-[#555555] dark:text-slate-400">{assignment.course}</p>
                        </div>
                        <div className="text-sm font-semibold text-[var(--accent-text)] dark:text-[var(--accent-text-dark)]">{label}</div>
                        <div
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getPanicBadgeClass(
                            panicScore
                          )} ${badgeToneClass}`}
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
                            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[var(--accent-shadow)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {upgradeLoading ? "Redirecting..." : "Upgrade"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleVibe(assignment)}
                            disabled={vibeLoading[assignment.id]}
                            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[var(--accent-shadow)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {vibeLoading[assignment.id] ? "Thinking..." : "Diagnose"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditAssignment(assignment)}
                          className="rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCompleteAssignment(assignment.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(assignment.id)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
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
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-100 p-6 text-center text-sm text-amber-900 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200">
              Nothing due in the next 48 hours. Go outside.
            </div>
          ) : null}

          {assignments.filter((a) => a.completed).length > 0 && viewMode === "card" && filterStatus === "active" && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-[#4a4a4a] dark:text-slate-400">Completed</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {assignments
                  .filter((a) => a.completed)
                  .map((assignment) => {
                    const priorityLabel = assignment.priority ?? "Medium";
                    return (
                      <article
                        key={assignment.id}
                        className={`rounded-2xl border border-slate-300 bg-slate-100 shadow-sm opacity-65 dark:border-slate-800 dark:bg-[#161a22]/70 ${compactMode ? "space-y-3 p-4" : "space-y-4 p-5"}`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className={`font-semibold text-[#111111] line-through dark:text-white ${compactMode ? "text-lg" : "text-xl"}`}>{assignment.title}</h2>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                priorityLabel
                              )} ${badgeToneClass}`}
                            >
                              {priorityLabel}
                            </span>
                          </div>
                          <p className={`text-[#555555] line-through dark:text-slate-400 ${compactMode ? "text-xs" : "text-sm"}`}>{assignment.course}</p>
                        </div>

                        <div className={`rounded-lg border border-slate-300 bg-slate-50 px-3 dark:border-slate-700 dark:bg-[#1b202b] ${compactMode ? "py-1.5" : "py-2"}`}>
                          <p className="text-xs uppercase tracking-wide text-[#777777] dark:text-slate-500">Deadline</p>
                          <p className="mt-1 text-sm text-slate-700 line-through dark:text-slate-300">{new Date(assignment.deadline).toLocaleString()}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUndoAssignment(assignment.id)}
                            className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                          >
                            Undo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(assignment.id)}
                            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
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

          {assignments.filter((a) => a.completed).length > 0 && viewMode === "list" && filterStatus === "active" && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-[#4a4a4a] dark:text-slate-400">Completed</h3>
              <div className="space-y-3">
                {assignments
                  .filter((a) => a.completed)
                  .map((assignment) => {
                    const { label } = formatCountdown(assignment.deadline, nowMs);
                    const priorityLabel = assignment.priority ?? "Medium";

                    return (
                      <div
                        key={assignment.id}
                        className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-sm opacity-70 dark:border-slate-800 dark:bg-[#161a22]/70"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-[#111111] line-through dark:text-white">{assignment.title}</h2>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPriorityBadgeClass(
                                    priorityLabel
                                  )} ${badgeToneClass}`}
                                >
                                  {priorityLabel}
                                </span>
                              </div>
                              <p className="text-xs text-[#555555] line-through dark:text-slate-400">{assignment.course}</p>
                            </div>
                            <div className="text-sm font-semibold text-[var(--accent-text)] dark:text-[var(--accent-text-dark)]">{label}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUndoAssignment(assignment.id)}
                              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                            >
                              Undo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(assignment.id)}
                              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
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
          <div className="rounded-2xl border border-dashed border-slate-400 bg-slate-100 p-8 text-center text-[#4a4a4a] dark:border-slate-700 dark:bg-[#161a22] dark:text-slate-400">
            No assignments yet. Add your first deadline.
          </div>
        ) : null}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 dark:bg-slate-950/65">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-xl shadow-slate-200/35 dark:border-slate-700/70 dark:bg-[#161a22] dark:shadow-black/35">
            <h2 className="mb-4 text-xl font-semibold text-[#111111] dark:text-white">{editingId ? "Edit Assignment" : "New Assignment"}</h2>

            <form onSubmit={handleAddAssignment} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm text-[#4a4a4a] dark:text-slate-300">
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="course" className="text-sm text-[#4a4a4a] dark:text-slate-300">
                  Course
                </label>
                <input
                  id="course"
                  type="text"
                  required
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="deadline" className="text-sm text-[#4a4a4a] dark:text-slate-300">
                  Deadline
                </label>
                <input
                  id="deadline"
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="estimatedHours" className="text-sm text-[#4a4a4a] dark:text-slate-300">
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="priority" className="text-sm text-[#4a4a4a] dark:text-slate-300">
                  Priority
                </label>
                <select
                  id="priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as "Low" | "Medium" | "High")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
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
                  className="rounded-lg bg-slate-200 px-4 py-2 text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isUploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 dark:bg-slate-950/65">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-xl shadow-slate-200/35 dark:border-slate-700/70 dark:bg-[#161a22] dark:shadow-black/35">
            <h2 className="mb-4 text-xl font-semibold text-[#111111] dark:text-white">Upload Syllabus</h2>

            <form onSubmit={handleUploadSyllabus} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="syllabus" className="text-sm text-[#4a4a4a] dark:text-slate-300">
                  Syllabus file
                </label>
                <input
                  id="syllabus"
                  type="file"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                />
              </div>

              {uploadError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm text-rose-800 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-200">
                  {uploadError}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-lg bg-slate-200 px-4 py-2 text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadLoading ? "Processing..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAssignmentLimitModalOpen && FREEMIUM_ENABLED ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 dark:bg-slate-950/65">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-xl shadow-slate-200/35 dark:border-slate-700/70 dark:bg-[#161a22] dark:shadow-black/35">
            <p className="text-base text-[#1a1a1a] dark:text-slate-100">
              Free plan is limited to 5 assignments. Upgrade to Premium for $2.99/month for unlimited.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAssignmentLimitModalOpen(false)}
                className="rounded-lg bg-slate-200 px-4 py-2 text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void startUpgradeCheckout()}
                disabled={upgradeLoading}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {upgradeLoading ? "Redirecting..." : "Upgrade"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStudyPlanOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 dark:bg-slate-950/65">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-xl shadow-slate-200/35 dark:border-slate-700/70 dark:bg-[#161a22] dark:shadow-black/35">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
              <div className="rounded-lg border border-[color:var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-2 dark:border-[color:var(--accent-soft-border-dark)] dark:bg-[var(--accent-soft-bg-dark)]">
                <Calendar className="h-5 w-5 text-[var(--accent-text)] dark:text-[var(--accent-text-dark)]" />
              </div>
              <h2 className="text-2xl font-semibold text-[#111111] dark:text-white">7-Day Study Plan</h2>
            </div>

            {studyPlanLoading ? (
              <p className="text-sm text-[#4a4a4a] dark:text-slate-300">Generating your plan...</p>
            ) : studyPlanError ? (
              <p className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm text-rose-800 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-200">
                {studyPlanError}
              </p>
            ) : parsedStudyPlan.length > 0 ? (
              <div className="space-y-4">
                {parsedStudyPlan.map((day, index) => (
                  <div key={day.displayLabel}>
                    <div className={`rounded-xl border p-4 ${day.borderColor} ${day.bgColor}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        {/* Day Label */}
                        <div className="flex-shrink-0 sm:w-32">
                          <span className={`text-sm font-bold ${day.textColor}`}>
                            {day.displayLabel}
                          </span>
                        </div>
                        
                        {/* Tasks */}
                        <div className="flex-1">
                          {day.tasks.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {day.tasks.map((task, taskIndex) => (
                                <span
                                  key={`${day.dayName}-${taskIndex}`}
                                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-[#1a1a1a] dark:border-slate-600 dark:bg-[#1b202b] dark:text-slate-200"
                                >
                                  {task}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-[#777777] dark:text-slate-500">Rest day 🎉</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {index < parsedStudyPlan.length - 1 && (
                      <div className="my-3 border-t border-slate-200 dark:border-slate-700/50" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#4a4a4a] dark:text-slate-300">No study plan available yet.</p>
            )}

            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsStudyPlanOpen(false)}
                className="w-full rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isRoastOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 dark:bg-slate-950/65">
          <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-xl shadow-slate-200/35 dark:border-slate-700/70 dark:bg-[#161a22] dark:shadow-black/35">
            <h2 className="mb-4 text-xl font-semibold text-[#111111] dark:text-white">Roast Me</h2>

            {roastLoading ? (
              <p className="text-sm text-[#4a4a4a] dark:text-slate-300">Generating roast...</p>
            ) : roast ? (
              <p className="text-sm text-[#1a1a1a] dark:text-slate-200">{roast}</p>
            ) : (
              <p className="text-sm text-[#4a4a4a] dark:text-slate-300">No roast available yet.</p>
            )}

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsRoastOpen(false)}
                className="rounded-lg bg-slate-200 px-4 py-2 text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDraftModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 dark:bg-slate-950/65">
          <div className="w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-xl shadow-slate-200/35 dark:border-slate-700/70 dark:bg-[#161a22] dark:shadow-black/35">
            <h2 className="mb-4 text-xl font-semibold text-[#111111] dark:text-white">Extension Email Draft</h2>

            {activeAssignments.length === 0 ? (
              <p className="text-sm text-[#4a4a4a] dark:text-slate-300">No active assignments to draft.</p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="draftAssignment" className="text-sm text-[#4a4a4a] dark:text-slate-300">
                    Assignment
                  </label>
                  <select
                    id="draftAssignment"
                    value={draftAssignmentId}
                    onChange={(event) => setDraftAssignmentId(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
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
                  className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {draftLoading ? "Generating..." : "Generate"}
                </button>
              </div>
            )}

            {draftSubject && draftBody ? (
              <div className="mt-4 space-y-3 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-[#1a1a1a] dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-200">
                <p>
                  <span className="font-semibold">Subject:</span> {draftSubject}
                </p>
                <p className="whitespace-pre-wrap">{draftBody}</p>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              {copySuccess ? (
                <p className="mr-auto text-xs text-emerald-700 dark:text-emerald-200">Copied to clipboard</p>
              ) : null}
              <button
                type="button"
                onClick={() => setIsDraftModalOpen(false)}
                className="rounded-lg bg-slate-200 px-4 py-2 text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleCopyDraft()}
                disabled={!draftSubject || !draftBody}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Settings Modal */}
      {isSettingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-slate-700/70 dark:bg-[#161a22]">
            <h2 className="text-2xl font-semibold text-[#111111] dark:text-white">Settings</h2>

            {/* Appearance Section */}
            <div className="mt-6">
              <h3 className="text-base font-semibold text-[#1a1a1a] dark:text-slate-100">Appearance</h3>
              <p className="mt-1 text-sm text-[#555555] dark:text-slate-400">Choose your preferred theme</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    theme === "light"
                      ? "border-[color:var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-text)] dark:border-[color:var(--accent)] dark:bg-[var(--accent-soft-bg-dark)] dark:text-[var(--accent-text-dark)]"
                      : "border-slate-300 bg-white text-[#1a1a1a] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <Sun size={16} className="mx-auto" />
                  <span className="mt-1 block">Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    theme === "dark"
                      ? "border-[color:var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-text)] dark:border-[color:var(--accent)] dark:bg-[var(--accent-soft-bg-dark)] dark:text-[var(--accent-text-dark)]"
                      : "border-slate-300 bg-white text-[#1a1a1a] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <Moon size={16} className="mx-auto" />
                  <span className="mt-1 block">Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    theme === "system"
                      ? "border-[color:var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-text)] dark:border-[color:var(--accent)] dark:bg-[var(--accent-soft-bg-dark)] dark:text-[var(--accent-text-dark)]"
                      : "border-slate-300 bg-white text-[#1a1a1a] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <Settings size={16} className="mx-auto" />
                  <span className="mt-1 block">System</span>
                </button>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-[#1a1a1a] dark:text-slate-200">Color Scheme</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {COLOR_THEMES.map((option) => {
                    const active = colorTheme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => applyColorTheme(option.value)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                          active
                            ? "border-[color:var(--accent)] bg-[var(--accent-soft-bg)] text-[var(--accent-text)] dark:border-[color:var(--accent)] dark:bg-[var(--accent-soft-bg-dark)] dark:text-[var(--accent-text-dark)]"
                            : "border-slate-300 bg-white text-[#1a1a1a] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                        aria-label={`Use ${option.label} theme`}
                      >
                        <span
                          className={`mx-auto block h-5 w-5 rounded-full border ${active ? "border-white/70" : "border-black/10"}`}
                          style={{ backgroundColor: option.swatch }}
                        />
                        <span className="mt-1 block">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Task Defaults Section */}
            <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
              <h3 className="text-base font-semibold text-[#1a1a1a] dark:text-slate-100">Task Defaults</h3>
              <p className="mt-1 text-sm text-[#555555] dark:text-slate-400">Set default values for new assignments</p>
              
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="default-priority" className="block text-sm font-medium text-[#1a1a1a] dark:text-slate-200">
                    Default Priority
                  </label>
                  <select
                    id="default-priority"
                    value={tempDefaultPriority}
                    onChange={(e) => setTempDefaultPriority(e.target.value as "Low" | "Medium" | "High")}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="default-view" className="block text-sm font-medium text-[#1a1a1a] dark:text-slate-200">
                    Default View
                  </label>
                  <select
                    id="default-view"
                    value={tempDefaultView}
                    onChange={(e) => setTempDefaultView(e.target.value as "card" | "list")}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none ring-[color:var(--accent-ring)] transition focus:border-[color:var(--accent)] focus:ring dark:border-slate-700 dark:bg-[#1b202b] dark:text-slate-100"
                  >
                    <option value="card">Card View</option>
                    <option value="list">List View</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Preferences Section */}
            <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700">
              <h3 className="text-base font-semibold text-[#1a1a1a] dark:text-slate-100">Preferences</h3>
              <p className="mt-1 text-sm text-[#555555] dark:text-slate-400">Customize your dashboard experience</p>
              
              <div className="mt-4">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="block text-sm font-medium text-[#1a1a1a] dark:text-slate-200">Compact Mode</span>
                    <span className="mt-0.5 block text-xs text-[#555555] dark:text-slate-400">Make assignment cards smaller and tighter</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTempCompactMode(!tempCompactMode)}
                    className={`relative ml-4 h-6 w-11 flex-shrink-0 rounded-full transition ${
                      tempCompactMode ? "bg-[var(--accent)]" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        tempCompactMode ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex items-center justify-end gap-3 border-t border-slate-200 pt-6 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setTempDefaultPriority(defaultPriority);
                  setTempDefaultView(defaultView);
                  setTempCompactMode(compactMode);
                  setIsSettingsOpen(false);
                }}
                className="rounded-lg bg-slate-200 px-5 py-2 text-sm font-medium text-[#1a1a1a] transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDefaultPriority(tempDefaultPriority);
                  setDefaultView(tempDefaultView);
                  setCompactMode(tempCompactMode);
                  setViewMode(tempDefaultView);
                  
                  window.localStorage.setItem("duesense:defaultPriority", tempDefaultPriority);
                  window.localStorage.setItem("duesense:defaultView", tempDefaultView);
                  window.localStorage.setItem("duesense:compactMode", String(tempCompactMode));
                  
                  setIsSettingsOpen(false);
                }}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}