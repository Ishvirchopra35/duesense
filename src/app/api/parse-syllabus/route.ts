import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

type ParsedAssignment = {
  title?: string;
  course?: string;
  deadline?: string;
  estimated_hours?: number | string;
};

const PROMPT =
  "Extract all assignments, deadlines, and due dates from this document. Return a JSON array only, no other text. Each item should have: title (string), course (string, use the course name from the document or leave blank if unknown), deadline (ISO 8601 datetime string, if no time is found use 23:59 on that date), estimated_hours (number, default to 2 if not mentioned). Return only valid JSON, nothing else.";

function normalizeAssignments(items: ParsedAssignment[], userId: string) {
  return items
    .map((item) => {
      const title = item.title?.toString().trim() ?? "";
      const deadline = item.deadline?.toString().trim() ?? "";
      const estimated = Number(item.estimated_hours ?? 2);
      if (!title || !deadline) return null;
      return {
        user_id: userId,
        title,
        course: item.course?.toString().trim() ?? "",
        deadline,
        estimated_hours: Number.isFinite(estimated) ? estimated : 2,
        completed: false,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function cleanJsonPayload(raw: string) {
  return raw.replace(/```json/gi, "").replace(/```/g, "").trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const userId = formData.get("userId");

    if (!(file instanceof File) || typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Missing file or user." }, { status: 400 });
    }

    const mimeType = file.type || "application/octet-stream";
    const isImage = mimeType.startsWith("image/");

    let messages;

    if (isImage) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ];
    } else {
      const text = await file.text();

      messages = [
        {
          role: "user",
          content: `${PROMPT}\n\nDocument content:\n${text}`,
        },
      ];
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: isImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages,
      }),
    });

    if (!groqResponse.ok) {
      const fallbackText = await groqResponse.text();
      return NextResponse.json({ error: fallbackText || "Groq request failed." }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const content = groqData?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Empty response from Groq." }, { status: 502 });
    }

    const parsed = JSON.parse(cleanJsonPayload(content)) as ParsedAssignment[];
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: "Groq response was not an array." }, { status: 502 });
    }

    const assignments = normalizeAssignments(parsed, userId);
    if (assignments.length === 0) {
      return NextResponse.json({ error: "No assignments detected." }, { status: 422 });
    }

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: insertError } = await supabase.from("assignments").insert(assignments);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: assignments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to parse syllabus." },
      { status: 500 }
    );
  }
}