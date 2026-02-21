import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { panicScore, title, hoursLeft } = await req.json()

  const prompt = `You're a smart friend giving real talk about this assignment.
Assignment: "${title}"
Panic score: ${panicScore}/100
Hours left: ${hoursLeft}

Give 1-2 short punchy sentences. Dry humor. No motivational poster vibes. No quotes. Just straight talk.`

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
        max_tokens: 100
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