import { NextResponse } from "next/server";

type StudyPlanAssignment = {
  title: string;
  course: string;
  deadline: string;
  estimated_hours: number;
};

type StudyPlanRequest = {
  assignments?: StudyPlanAssignment[];
  todayIso?: string;
  timeZone?: string;
};

export async function POST(request: Request) {
  try {
    const { assignments, todayIso, timeZone } = (await request.json()) as StudyPlanRequest;

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

    const normalizedTimeZone = typeof timeZone === "string" && timeZone.trim().length > 0
      ? timeZone
      : "UTC";

    const startDate = todayIso ? new Date(todayIso) : new Date();
    const safeStartDate = Number.isNaN(startDate.getTime()) ? new Date() : startDate;

    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: normalizedTimeZone,
    });

    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: normalizedTimeZone,
    });

    const planningWindow = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(safeStartDate);
      date.setUTCDate(date.getUTCDate() + index);
      return {
        label: dayFormatter.format(date),
        isoDate: dateFormatter.format(date),
      };
    });

    const planningWindowText = planningWindow
      .map((entry, index) => `${index + 1}. ${entry.label} (${entry.isoDate})`)
      .join("\n");

    const prompt = `Generate a 7-day study plan based on these assignments.

Today's context:
- User timezone: ${normalizedTimeZone}
- Day 1 (today): ${planningWindow[0]?.label ?? "Unknown"} (${planningWindow[0]?.isoDate ?? "Unknown"})

Planning window (must stay in this exact order):
${planningWindowText}

Return ONLY a valid JSON array with exactly 7 objects, one per day in the exact order shown above.
Each object should have:
- day (string, e.g. "Wednesday")
- date (string, YYYY-MM-DD)
- tasks (array of strings, each task as a short sentence)

If no tasks are needed for a day, return an empty array for tasks.
Return nothing except the JSON array.

Assignments:
${assignmentList}

Rules:
- Include time estimates per task
- Make sure the workload fits the deadlines
- Spread work intelligently across days
- Day 1 must represent today, not Monday unless today is Monday
- Return ONLY valid JSON, no markdown, no code blocks, no extra text`;

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
    const planText = groqData?.choices?.[0]?.message?.content?.trim();

    if (!planText || typeof planText !== "string") {
      return NextResponse.json({ error: "Empty response from Groq." }, { status: 502 });
    }

    // Parse the JSON response from Groq
    try {
      // Remove markdown code blocks if present
      const cleanedText = planText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsedPlan = JSON.parse(cleanedText);

      // Validate the structure
      if (!Array.isArray(parsedPlan) || parsedPlan.length !== 7) {
        throw new Error("Invalid plan structure");
      }

      // Ensure each day has the correct structure
      const validatedPlan = parsedPlan.map((dayPlan, index) => ({
        day: String(dayPlan.day || ""),
        date: String(dayPlan.date || planningWindow[index]?.isoDate || ""),
        tasks: Array.isArray(dayPlan.tasks) ? dayPlan.tasks.map(String) : [],
      }));

      return NextResponse.json({ plan: validatedPlan });
    } catch {
      // If JSON parsing fails, return the raw text as fallback
      return NextResponse.json({ plan: planText });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to generate study plan." },
      { status: 500 }
    );
  }
}
