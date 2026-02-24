"use client";

import {
  Brain,
  CalendarClock,
  FileUp,
  Gauge,
  Siren,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

const panicStates = [
  {
    label: "All Good",
    tone: "border-emerald-400/35 bg-emerald-500/12 text-emerald-200",
    summary: "Your workload looks manageable. Keep a steady rhythm this week.",
    preview: {
      title: "Lab Reflection",
      countdown: "2d 06h",
      badge: "All Good · 24",
    },
  },
  {
    label: "Heating Up",
    tone: "border-amber-400/35 bg-amber-500/12 text-amber-200",
    summary: "Deadlines are getting closer. Prioritize now to avoid last-minute stress.",
    preview: {
      title: "A6 Problem Set",
      countdown: "19h 40m",
      badge: "Heating Up · 58",
    },
  },
  {
    label: "Code Red",
    tone: "border-rose-400/35 bg-rose-500/12 text-rose-200",
    summary: "Your week is overloaded. Focus on highest-impact tasks first.",
    preview: {
      title: "Final Exam Review",
      countdown: "8h 12m",
      badge: "Code Red · 86",
    },
  },
];

const features = [
  {
    icon: Gauge,
    tint: "border-indigo-500/30 bg-indigo-500/10",
    layout: "lg:col-span-2",
    title: "Panic Scoring",
    description: "A quick score that tells you how much pressure is building.",
  },
  {
    icon: Sparkles,
    tint: "border-violet-500/30 bg-violet-500/10",
    layout: "",
    title: "AI Diagnose",
    description: "Get clear guidance on what to tackle first when everything feels urgent.",
  },
  {
    icon: FileUp,
    tint: "border-sky-500/30 bg-sky-500/10",
    layout: "",
    title: "Syllabus Upload",
    description: "Drop in a syllabus and auto-pull what actually matters.",
  },
  {
    icon: Brain,
    tint: "border-emerald-500/30 bg-emerald-500/10",
    layout: "",
    title: "Study Planner",
    description: "Convert chaos into focused blocks you can actually finish.",
  },
  {
    icon: CalendarClock,
    tint: "border-amber-500/30 bg-amber-500/10",
    layout: "",
    title: "Deadline Conflict Detection",
    description: "Catch stacked due dates before they slam into each other.",
  },
  {
    icon: Siren,
    tint: "border-rose-500/30 bg-rose-500/10",
    layout: "lg:col-span-2",
    title: "Survive Today Mode",
    description: "See only near-term deadlines so you can stay focused.",
  },
];

export default function LandingPage() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#111318] text-slate-100">
      {/* Navigation Bar */}
      <nav className="border-b border-slate-800/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <span className="text-lg font-semibold text-white">Wrap It Up</span>
          <Link
            href="/auth"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            Login
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-6xl overflow-hidden px-5 pb-12 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
        <div className="hero-gradient absolute inset-0 -z-10 rounded-3xl" />
        <div data-reveal className="reveal rounded-3xl border border-slate-700/60 bg-[#141923]/70 p-6 shadow-xl shadow-black/20 sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <p className="mb-4 inline-flex rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                Deadline planning for students
              </p>
              <h1 className="headline-glow max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                You&apos;ve got 6 things due this week. Which one&apos;s going to destroy you?
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Finally know which assignment should actually be stressing you out.
                Wrap It Up gives you a clear plan before panic takes over.
              </p>
              <Link
                href="/auth"
                className="button-shimmer mt-7 inline-flex rounded-xl bg-indigo-500 px-8 py-3.5 text-base font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-400"
              >
                Get Started
              </Link>
            </div>

            {/* Mock Assignment Card - Desktop Only */}
            <div className="hidden lg:block lg:flex-shrink-0">
              <div className="w-72 rounded-xl border border-rose-400/40 bg-[#1b202b] p-4 shadow-lg shadow-rose-500/10">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-400">MATH 128</p>
                    <h3 className="mt-1 text-base font-semibold text-white">Midterm Exam</h3>
                  </div>
                  <span className="rounded-full border border-rose-400/35 bg-rose-500/12 px-2 py-0.5 text-[11px] font-bold text-rose-200">
                    Code Red
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-[#11161f] px-3 py-2">
                  <p className="text-xs text-slate-400">Due in</p>
                  <p className="mt-0.5 text-lg font-semibold text-indigo-300">8h 42m</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-700">
                    <div className="h-1.5 w-[15%] rounded-full bg-rose-500"></div>
                  </div>
                  <span className="text-xs text-slate-400">15%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-20">
        <div data-reveal className="reveal rounded-2xl border border-slate-800/70 bg-[#161a22] p-5 shadow-lg shadow-black/20 sm:p-7">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Panic Score</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-300 sm:text-base">
            A simple status check so you can course-correct early and plan with confidence.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {panicStates.map((state, index) => (
              <article
                key={state.label}
                data-reveal
                className="reveal rounded-xl border border-slate-700/70 bg-[#1b202b] p-3.5"
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${state.tone}`}>
                  {state.label}
                </span>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{state.summary}</p>

                <div className="mt-3.5 rounded-lg border border-slate-700/70 bg-[#11161f] p-2.5">
                  <p className="text-sm font-semibold text-white">{state.preview.title}</p>
                  <p className="mt-1 text-xs text-indigo-300">{state.preview.countdown}</p>
                  <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${state.tone}`}>
                    {state.preview.badge}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-20">
        <div data-reveal className="reveal">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Everything you need in one place</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                data-reveal
                className={`reveal rounded-xl border p-4 shadow-sm shadow-black/20 ${feature.tint} ${feature.layout}`}
                style={{ transitionDelay: `${index * 70}ms` }}
              >
                <feature.icon className="mb-2.5 h-5 w-5 text-slate-200" />
                <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-20">
        <div data-reveal className="reveal rounded-2xl border border-slate-800/70 bg-[#161a22] p-5 shadow-lg shadow-black/20 sm:p-7">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">Students get it</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <blockquote className="rounded-xl border border-slate-700/70 bg-[#1b202b] p-4 text-sm text-slate-200">
              “I stopped doing random tasks and finally hit the ones that were actually dangerous.”
            </blockquote>
            <blockquote className="rounded-xl border border-slate-700/70 bg-[#1b202b] p-4 text-sm text-slate-200">
              “This app is basically my ‘don’t spiral before midnight’ button.”
            </blockquote>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-20">
        <div data-reveal className="reveal rounded-2xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-rose-500/10 p-7 text-center sm:p-9">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Stop guessing. Start wrapping.</h2>
          <p className="mx-auto mt-2.5 max-w-2xl text-sm text-slate-300 sm:text-base">
            Get a clear plan for your week before deadlines start stacking.
          </p>
          <Link
            href="/auth"
            className="button-shimmer mt-5 inline-flex rounded-xl bg-indigo-500 px-7 py-3 text-base font-semibold text-white shadow-sm shadow-indigo-500/25 transition hover:bg-indigo-400"
          >
            Get Started
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800">
        <div className="mx-auto max-w-6xl px-5 py-6 text-sm text-slate-400 sm:px-8">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">Wrap It Up</span>
            <span>Plan smarter. Feel calmer.</span>
          </div>
          <div className="mt-3 text-center text-xs text-slate-500">
            Made by{" "}
            <a
              href="https://www.linkedin.com/in/ishvir-chopra-23758b2a8/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 transition hover:text-slate-300"
            >
              Ishvir Chopra
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
