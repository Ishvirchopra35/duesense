import { NextRequest, NextResponse } from "next/server";

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
  action?: string;
  cdata?: string;
  hostname?: string;
  challenge_ts?: string;
};

type VerifyCaptchaRequest = {
  token?: string;
};

type VerifyCaptchaFailure = {
  error: string;
  "error-codes"?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

    if (!secret) {
      return NextResponse.json({ error: "Captcha is not configured." }, { status: 500 });
    }

    const { token } = (await request.json()) as VerifyCaptchaRequest;
    const normalizedToken = token?.trim();

    if (!normalizedToken) {
      return NextResponse.json({ error: "Captcha token is missing." }, { status: 400 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const remoteIp = forwardedFor?.split(",")[0]?.trim();

    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", normalizedToken);

    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
        cache: "no-store",
      }
    );

    const verificationData = (await verificationResponse.json()) as TurnstileResponse | VerifyCaptchaFailure;
    const errorCodes = verificationData["error-codes"] ?? [];

    if (!verificationResponse.ok || !verificationData.success) {
      return NextResponse.json(
        {
          error: "Captcha verification failed.",
          codes: errorCodes,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to verify captcha." }, { status: 500 });
  }
}