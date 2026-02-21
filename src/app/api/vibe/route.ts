import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { panicScore, title, hoursLeft } = await req.json()

  const prompt = `You are a slightly sarcastic but supportive student productivity coach. 
Generate a 1-2 sentence motivational message for a student.
Assignment: "${title}"
Panic score: ${panicScore}/100
Hours left: ${hoursLeft}
Be funny, real, and student-friendly. No corporate speak. Return only the message.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  )

  if (!response.ok) {
    console.error('Gemini API error:', response.status, await response.text())
    return NextResponse.json({ message: 'Stay focused! (API unavailable)' })
  }

  const data = await response.json()
  
  // Gemini API returns: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const message = data?.candidates?.[0]?.content?.parts?.[0]?.text
  
  if (!message) {
    console.error('Unexpected Gemini response structure:', JSON.stringify(data))
    return NextResponse.json({ message: 'Stay focused! You got this!' })
  }

  return NextResponse.json({ message: message.trim() })
}