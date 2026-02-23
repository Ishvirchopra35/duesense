"use client";

import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { FormEvent, useEffect, useMemo, useState } from "react";

export default function AuthPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/dashboard");
      }
    };

    void checkSession();
  }, [router, supabase]);

  useEffect(() => {
    (window as Window & { onTurnstileSuccess?: (token: string) => void }).onTurnstileSuccess = (
      token: string
    ) => {
      setCaptchaToken(token);
      setError(null);
    };

    (window as Window & { onTurnstileExpired?: () => void }).onTurnstileExpired = () => {
      setCaptchaToken("");
    };

    (window as Window & { onTurnstileError?: () => void }).onTurnstileError = () => {
      setCaptchaToken("");
      setError("Captcha failed to load. Please refresh and try again.");
    };

    return () => {
      delete (window as Window & { onTurnstileSuccess?: (token: string) => void }).onTurnstileSuccess;
      delete (window as Window & { onTurnstileExpired?: () => void }).onTurnstileExpired;
      delete (window as Window & { onTurnstileError?: () => void }).onTurnstileError;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!captchaToken) {
      setError("Please complete the captcha.");
      return;
    }

    setLoading(true);

    const captchaResponse = await fetch("/api/auth/verify-captcha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: captchaToken }),
    });

    if (!captchaResponse.ok) {
      setError("Captcha verification failed. Please try again.");
      setLoading(false);
      setCaptchaToken("");
      return;
    }

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        setCaptchaToken("");
        return;
      }
    } else {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        setCaptchaToken("");
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      {turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      ) : null}
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            ← Back
          </Link>
        </div>
        <div className="mb-6 space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Wrap It Up</h1>
          <p className="text-sm text-slate-400">Track deadlines. Kill panic.</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md px-3 py-2 text-sm transition ${
              mode === "login"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md px-3 py-2 text-sm transition ${
              mode === "signup"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Signup
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-indigo-500/50 transition focus:ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-slate-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-16 text-slate-100 outline-none ring-indigo-500/50 transition focus:ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {turnstileSiteKey ? (
            <div
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              data-callback="onTurnstileSuccess"
              data-expired-callback="onTurnstileExpired"
              data-error-callback="onTurnstileError"
            />
          ) : (
            <p className="rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
              Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY in environment.
            </p>
          )}

          {error ? (
            <p className="rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !turnstileSiteKey}
            className="w-full rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Log In"
                : "Create Account"}
          </button>
        </form>
      </section>
    </main>
  );
}