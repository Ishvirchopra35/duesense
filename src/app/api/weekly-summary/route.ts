import { NextResponse } from "next/server";

type WeeklySummaryAssignment = {
  title: string;
  course: string;
  deadline: string;
  estimated_hours: number;
  panic_score: number;
};

type WeeklySummaryRequest = {
  assignments?: WeeklySummaryAssignment[];
};

export async function POST(request: Request) {
  try {
    const { assignments } = (await request.json()) as WeeklySummaryRequest;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: "No active assignments provided." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
    }

    const assignmentList = assignments
      .map(
        (assignment, index) =>
          `${index + 1}. ${assignment.title} (${assignment.course}) — due ${new Date(assignment.deadline).toLocaleString()}, est ${assignment.estimated_hours}h, panic ${assignment.panic_score}/100`
      )
      .join("\n");

    const prompt = `You are summarizing a student's week in plain English for a dashboard widget.

Active assignments:
${assignmentList}

Write exactly 2 to 3 sentences total:
- Mention the biggest threats/workload risks.
- Mention what is coming up soon.
- End with one dry humorous closing line.

Style constraints:
- Plain English, concise, practical.
- Not overly dramatic or alarmist.
- No bullets, no markdown, no labels.`;

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
      return NextResponse.json({ error: fallbackText || "Groq request failed." }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const summary = groqData?.choices?.[0]?.message?.content?.trim();

    if (!summary || typeof summary !== "string") {
      return NextResponse.json({ error: "Empty response from Groq." }, { status: 502 });
    }

    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate weekly summary." },
      { status: 500 }
    );
  }
}
