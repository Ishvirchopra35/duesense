import { NextResponse } from "next/server";

type StudyPlanAssignment = {
  title: string;
  course: string;
  deadline: string;
  estimated_hours: number;
};

type StudyPlanRequest = {
  assignments?: StudyPlanAssignment[];
};

export async function POST(request: Request) {
  try {
    const { assignments } = (await request.json()) as StudyPlanRequest;

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
          `${index + 1}. ${assignment.title} (${assignment.course}) — due ${new Date(assignment.deadline).toLocaleString()}, est ${assignment.estimated_hours}h`
      )
      .join("\n");

    const prompt = `Create a 7-day study plan starting today for the student. Use the assignments below.

Assignments:
${assignmentList}

Format strictly as a simple list grouped by day, one line per day:
Monday: ...
Tuesday: ...
Wednesday: ...
Thursday: ...
Friday: ...
Saturday: ...
Sunday: ...

Rules:
- Plain English, concise.
- Include time estimates per task.
- Make sure the workload fits the deadlines.
- No extra commentary, no markdown, no bullets.`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!groqResponse.ok) {
      const fallbackText = await groqResponse.text();
      return NextResponse.json({ error: fallbackText || "Groq request failed." }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const plan = groqData?.choices?.[0]?.message?.content?.trim();

    if (!plan || typeof plan !== "string") {
      return NextResponse.json({ error: "Empty response from Groq." }, { status: 502 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate study plan." },
      { status: 500 }
    );
  }
}
