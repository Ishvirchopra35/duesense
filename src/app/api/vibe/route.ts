import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { panicScore, title, hoursLeft } = await req.json()

  const systemPrompt = `You are a blunt assignment hype voice.
Response must be 1 or 2 sentences only.
If you write more than 2 sentences, the output is wrong.
Each sentence should stay under 20 words.
Tone: punchy, witty, direct, and helpful.
Add concrete urgency or advice, but keep it concise.
No emojis or quotes.`

  const userPrompt = `Assignment: "${title}"
Panic score: ${panicScore}/100
Hours left: ${hoursLeft}`

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
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