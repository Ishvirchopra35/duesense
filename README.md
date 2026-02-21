# DueSense

A Next.js student deadline tracker with panic intelligence and AI-powered motivational vibes.

## Features

- 🔐 Supabase email/password authentication
- 📊 Live countdown timers for all assignments
- 🎯 Panic score calculation (red/orange/green zones)
- 🤖 AI-powered motivational messages via Groq API (Llama 3.3)
- 🌙 Dark theme with Space Mono font
- ✨ Clean, minimal UI with Tailwind CSS

## Setup

1. Clone the repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file with:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
```

4. Set up your Supabase database with an `assignments` table:
```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  course TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  estimated_hours INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_user_id ON assignments(user_id);
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Auth & Database**: Supabase
- **AI**: Groq API (Llama 3.3 70B)
- **Font**: Space Mono (Google Fonts)

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `GROQ_API_KEY` - Your Groq API key (get it from [Groq Console](https://console.groq.com/keys))

