import { NextResponse } from "next/server";

type DraftEmailRequest = {
  title?: string;
  course?: string;
  deadline?: string;
};

function parseEmailDraft(raw: string) {
  const cleaned = raw.trim().replace(/^```[\s\S]*?\n/, "").replace(/```$/, "").trim();
  const subjectMatch = cleaned.match(/Subject\s*:\s*(.+)/i);
  const bodyMatch = cleaned.match(/Body\s*:\s*([\s\S]+)/i);

  if (subjectMatch?.[1] && bodyMatch?.[1]) {
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  }

  const lines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  const subject = lines[0]?.replace(/^subject\s*:\s*/i, "") || "Extension request for assignment deadline";
  const body = lines.slice(1).join("\n").trim() || cleaned;

  return { subject, body };
}

export async function POST(request: Request) {
  try {
    const { title, course, deadline } = (await request.json()) as DraftEmailRequest;

    if (!title || !course || !deadline) {
      return NextResponse.json(
        { error: "Missing assignment title, course, or deadline." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
    }

    const deadlineText = new Date(deadline).toLocaleString();

    const prompt = `Write a polite, professional (not overly formal) email from a college student to a professor asking for a short extension.

Assignment title: ${title}
Course: ${course}
Deadline: ${deadlineText}

Requirements:
- Keep it concise and respectful.
- Explain the request clearly without over-sharing.
- Include a specific, reasonable extension ask.
- Tone should be sincere and accountable.
- Do not sound robotic.

Return output in exactly this format:
Subject: <one line>
Body:
<email body with greeting, 1-3 short paragraphs, and sign-off>`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!groqResponse.ok) {
      const fallbackText = await groqResponse.text();
      return NextResponse.json(
        { error: fallbackText || "Groq request failed." },
        { status: 502 }
      );
    }

    const groqData = await groqResponse.json();
    const content = groqData?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Empty response from Groq." }, { status: 502 });
    }

    const parsed = parseEmailDraft(content);
    return NextResponse.json({ subject: parsed.subject, body: parsed.body });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate draft email." },
      { status: 500 }
    );
  }
}
