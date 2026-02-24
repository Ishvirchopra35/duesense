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

    const prompt = `Generate a 7-day study plan based on these assignments. Return ONLY a valid JSON array with exactly 7 objects, one per day. Each object should have: day (string, e.g. "Monday"), tasks (array of strings, each task as a short sentence). If no tasks are needed for a day, return an empty array for tasks. Return nothing except the JSON array.

Assignments:
${assignmentList}

Rules:
- Include time estimates per task
- Make sure the workload fits the deadlines
- Spread work intelligently across days
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
      const validatedPlan = parsedPlan.map((dayPlan) => ({
        day: String(dayPlan.day || ""),
        tasks: Array.isArray(dayPlan.tasks) ? dayPlan.tasks.map(String) : [],
      }));

      return NextResponse.json({ plan: validatedPlan });
    } catch (parseError) {
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
