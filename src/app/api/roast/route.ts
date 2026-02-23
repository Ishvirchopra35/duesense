import { NextResponse } from "next/server";

type RoastAssignment = {
  title: string;
  course: string;
  deadline: string;
  estimated_hours: number;
  priority?: "Low" | "Medium" | "High";
  panic_score: number;
};

type RoastRequest = {
  assignments?: RoastAssignment[];
};

export async function POST(request: Request) {
  try {
    const { assignments } = (await request.json()) as RoastRequest;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
    }

    const safeAssignments = Array.isArray(assignments) ? assignments : [];
    const hasAssignments = safeAssignments.length > 0;

    const assignmentList = safeAssignments
      .map(
        (assignment, index) =>
          `${index + 1}. ${assignment.title} (${assignment.course}) — due ${new Date(assignment.deadline).toLocaleString()}, est ${assignment.estimated_hours}h, priority ${assignment.priority ?? "Medium"}, panic ${assignment.panic_score}/100`
      )
      .join("\n");

    const prompt = hasAssignments
      ? `You are roasting a student's current workload in 2-3 sentences.

Assignments:
${assignmentList}

Rules:
- Brutally honest, dry, funny, but not mean-spirited.
- 2-3 sentences total.
- No profanity or insults.
- Focus on workload situation.`
      : `The student has no assignments.

Rules:
- 2-3 sentences total.
- Roast them for having nothing to do, dry and funny but not mean-spirited.
- No profanity or insults.`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!groqResponse.ok) {
      const fallbackText = await groqResponse.text();
      return NextResponse.json({ error: fallbackText || "Groq request failed." }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const roast = groqData?.choices?.[0]?.message?.content?.trim();

    if (!roast || typeof roast !== "string") {
      return NextResponse.json({ error: "Empty response from Groq." }, { status: 502 });
    }

    return NextResponse.json({ roast });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate roast." },
      { status: 500 }
    );
  }
}
