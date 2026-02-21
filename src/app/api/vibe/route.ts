import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { panicScore, title, hoursLeft } = await req.json()

  const prompt = `You are a slightly sarcastic but supportive student productivity coach. 
Generate a 1-2 sentence motivational message for a student.
Assignment: "${title}"
Panic score: ${panicScore}/100
Hours left: ${hoursLeft}
Be funny, real, and student-friendly. No corporate speak. Return only the message.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 80,
  })

  return NextResponse.json({ message: completion.choices[0].message.content })
}