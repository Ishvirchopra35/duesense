import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { panicScore, title, hoursLeft } = await req.json()

  const prompt = `You are a slightly sarcastic but supportive student productivity coach. 
Generate a 1-2 sentence motivational message for a student.
Assignment: "${title}"
Panic score: ${panicScore}/100
Hours left: ${hoursLeft}
Be funny, real, and student-friendly. No corporate speak. Return only the message.`

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 80
    })
  })

  const data = await response.json()
  const message = data?.choices?.[0]?.message?.content
  return NextResponse.json({ message: message?.trim() ?? 'Stay focused!' })
}