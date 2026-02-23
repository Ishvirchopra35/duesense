import { NextRequest, NextResponse } from "next/server";

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY;

    if (!secret) {
      return NextResponse.json({ error: "Captcha is not configured." }, { status: 500 });
    }

    const { token } = (await request.json()) as { token?: string };

    if (!token) {
      return NextResponse.json({ error: "Captcha token is missing." }, { status: 400 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const remoteIp = forwardedFor?.split(",")[0]?.trim();

    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", token);

    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    const verificationData = (await verificationResponse.json()) as TurnstileResponse;

    if (!verificationResponse.ok || !verificationData.success) {
      return NextResponse.json(
        {
          error: "Captcha verification failed.",
          codes: verificationData["error-codes"] ?? [],
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to verify captcha." }, { status: 500 });
  }
}