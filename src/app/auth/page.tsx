"use client";

import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Turnstile = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
};

type TurnstileWindow = Window & {
  turnstile?: Turnstile;
};

type CaptchaVerifyResponse = {
  success?: boolean;
  error?: string;
  codes?: string[];
};

const getCaptchaErrorMessage = (codes: string[] = []) => {
  if (codes.includes("timeout-or-duplicate")) {
    return "Captcha expired or was already used. Please complete it again and submit right away.";
  }

  if (codes.includes("invalid-input-response")) {
    return "Captcha response was invalid. Please retry the captcha.";
  }

  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
    return "Captcha is misconfigured on the server. Update TURNSTILE_SECRET_KEY and try again.";
  }

  if (codes.includes("invalid-input-sitekey") || codes.includes("missing-input-response")) {
    return "Captcha configuration is invalid. Please retry in a moment.";
  }

  return "Captcha verification failed. Please try again.";
};

const buildCaptchaFailureMessage = (payload: CaptchaVerifyResponse | null) => {
  const messageFromCode = getCaptchaErrorMessage(payload?.codes);

  if (!payload) {
    return messageFromCode;
  }

  if (payload.codes?.length) {
    return `${messageFromCode} (${payload.codes.join(", ")})`;
  }

  return payload.error ?? messageFromCode;
};

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
  const captchaTokenRef = useRef("");
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetIdRef = useRef<string | null>(null);

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

  const handleCaptchaSuccess = useCallback((token: string) => {
    captchaTokenRef.current = token;
    setCaptchaToken(token);
    setError(null);
  }, []);

  const handleCaptchaExpired = useCallback(() => {
    captchaTokenRef.current = "";
    setCaptchaToken("");
  }, []);

  const handleCaptchaError = useCallback(() => {
    captchaTokenRef.current = "";
    setCaptchaToken("");
    setError("Captcha failed to load. Please try again.");
  }, []);

  const renderCaptcha = useCallback(() => {
    if (!turnstileSiteKey || !captchaContainerRef.current) {
      return;
    }

    const turnstile = (window as TurnstileWindow).turnstile;

    if (!turnstile) {
      return;
    }

    if (captchaWidgetIdRef.current && turnstile.remove) {
      turnstile.remove(captchaWidgetIdRef.current);
      captchaWidgetIdRef.current = null;
      captchaContainerRef.current.innerHTML = "";
    }

    captchaWidgetIdRef.current = turnstile.render(captchaContainerRef.current, {
      sitekey: turnstileSiteKey,
      callback: handleCaptchaSuccess,
      "expired-callback": handleCaptchaExpired,
      "error-callback": handleCaptchaError,
    });
  }, [handleCaptchaError, handleCaptchaExpired, handleCaptchaSuccess, turnstileSiteKey]);

  const resetCaptcha = useCallback(() => {
    captchaTokenRef.current = "";
    setCaptchaToken("");
    const turnstile = (window as TurnstileWindow).turnstile;

    if (turnstile && captchaWidgetIdRef.current) {
      turnstile.reset(captchaWidgetIdRef.current);
    }
  }, []);

  useEffect(() => {
    renderCaptcha();

    return () => {
      const turnstile = (window as TurnstileWindow).turnstile;

      if (turnstile && captchaWidgetIdRef.current && turnstile.remove) {
        turnstile.remove(captchaWidgetIdRef.current);
      }

      captchaWidgetIdRef.current = null;
    };
  }, [renderCaptcha]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const tokenToVerify = captchaTokenRef.current;

    if (!tokenToVerify) {
      setError("Please complete the captcha.");
      return;
    }

    setLoading(true);

    const captchaResponse = await fetch("/api/auth/verify-captcha", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: tokenToVerify }),
    });

    const captchaPayload = (await captchaResponse.json().catch(() => null)) as CaptchaVerifyResponse | null;

    if (!captchaResponse.ok) {
      setError(buildCaptchaFailureMessage(captchaPayload));
      setLoading(false);
      resetCaptcha();
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
        resetCaptcha();
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
        resetCaptcha();
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          async
          defer
          onLoad={renderCaptcha}
        />
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
            <div ref={captchaContainerRef} className="min-h-[65px]" />
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
            disabled={loading || !turnstileSiteKey || !captchaToken}
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