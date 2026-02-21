import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { panicScore, title, hoursLeft } = await req.json()

  const prompt = `You're a smart friend giving real talk about this assignment.
Assignment: "${title}"
Panic score: ${panicScore}/100
Hours left: ${hoursLeft}

CRITICAL: Your response MUST be MAXIMUM 2 sentences. Not 3. Not 4. Exactly 1 or 2 sentences only. Short, punchy, dry humor. No quotes. If you write more than 2 sentences, you failed.`

  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150
      })
    }
  )

  const data = await response.json()
  
  if (!response.ok) {
    return NextResponse.json({ message: JSON.stringify(data) })
  }

  const message = data?.choices?.[0]?.message?.content
  return NextResponse.json({ message: message?.trim() ?? 'Stay focused!' })
}