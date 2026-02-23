"use client";

import Link from "next/link";
import { useEffect } from "react";

const panicStates = [
  {
    label: "All Good",
    tone: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    summary: "Your workload is under control. Keep cruising.",
  },
  {
    label: "Heating Up",
    tone: "border-orange-400/40 bg-orange-500/10 text-orange-200",
    summary: "Deadlines are tightening. Plan now, panic less.",
  },
  {
    label: "Code Red",
    tone: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    summary: "Critical stack. Focus your next hours or get buried.",
  },
];

const features = [
  {
    title: "Panic Scoring",
    description: "One number that tells you exactly how cooked you are.",
  },
  {
    title: "AI Diagnose",
    description: "Fast read on what to tackle first when everything feels urgent.",
  },
  {
    title: "Syllabus Upload",
    description: "Drop in a syllabus and auto-pull what actually matters.",
  },
  {
    title: "Study Planner",
    description: "Convert chaos into focused blocks you can actually finish.",
  },
  {
    title: "Deadline Conflict Detection",
    description: "Catch stacked due dates before they slam into each other.",
  },
  {
    title: "Survive Today Mode",
    description: "Only show what can wreck your next 48 hours.",
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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
        <div data-reveal className="reveal">
          <p className="mb-5 inline-flex rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
            Student productivity, no sugarcoating
          </p>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
            Your Deadlines Are Stacking. Are You?
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Wrap It Up turns assignment chaos into clear next moves. See what is urgent, what can wait,
            and exactly where your week goes off the rails.
          </p>
          <Link
            href="/auth"
            className="mt-8 inline-flex rounded-lg bg-indigo-500 px-7 py-3 text-base font-bold text-white transition hover:bg-indigo-400"
          >
            Get Started
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
        <div data-reveal className="reveal rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Panic Score</h2>
          <p className="mt-3 max-w-3xl text-slate-300">
            One glance, one verdict. Panic Score tells you how much pressure is building before it blows
            up your week.
          </p>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {panicStates.map((state, index) => (
              <article
                key={state.label}
                data-reveal
                className="reveal rounded-xl border border-slate-800 bg-slate-950/80 p-4"
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${state.tone}`}>
                  {state.label}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{state.summary}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24">
        <div data-reveal className="reveal">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Built for deadline pressure</h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                data-reveal
                className="reveal rounded-xl border border-slate-800 bg-slate-900/70 p-5"
                style={{ transitionDelay: `${index * 70}ms` }}
              >
                <h3 className="text-base font-bold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-sm text-slate-400 sm:px-8">
          <span className="font-bold text-slate-200">Wrap It Up</span>
          <span>Track deadlines. Kill panic.</span>
        </div>
      </footer>
    </main>
  );
}
