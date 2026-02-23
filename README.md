# Wrap It Up

A student deadline and workload intelligence dashboard that tells you exactly how stressed you should be about each assignment, not just what's due.

## Overview

Wrap It Up goes beyond a basic to-do list. It calculates a **Panic Score** for every assignment based on how much work you have versus how much time you have left, gives you AI-generated insights, and even reads your syllabus automatically.

Built as a full-stack SaaS web app with a freemium model.

## Screenshots

<div align="center">

**Dashboard — Card View**

<img width="1919" height="987" alt="image" src="https://github.com/user-attachments/assets/0ba586b7-fd1b-4701-a748-993393adf358" />

*Assignment cards with live countdowns, panic scores, and AI diagnosis*

**Dashboard — List View**

<img width="1919" height="987" alt="image" src="https://github.com/user-attachments/assets/3166b814-8e4b-4eb0-bc9c-50b132ea97ec" />

*Compact list view for when assignments pile up*

**Syllabus Upload**

<img width="557" height="274" alt="image" src="https://github.com/user-attachments/assets/3e1f6c4a-d302-46b6-b5e8-d7ce74e2ad84" />

*Drop in a PDF and watch it auto-populate all your assignments*

</div>

## Features

- **Panic Scoring** — each assignment gets a score from 0–100 based on estimated hours vs time remaining. Color coded All Good (green), Heating Up (orange), or Code Red (red)
- **Syllabus Upload** — upload any PDF, image, or document and AI automatically extracts all assignments and deadlines
- **AI Diagnose** — get a short, dry, brutally honest productivity message for any assignment
- **Smart Study Planner** — AI generates a personalized day-by-day study schedule based on everything you have due
- **Extension Email Drafts** — one click generates a ready-to-send professor email for any assignment
- **Deadline Conflict Detection** — automatically flags when multiple assignments are due within 24 hours of each other
- **Survive Today Mode** — filters the dashboard to only show assignments due in the next 48 hours
- **Priority System** — mark assignments as Low, Medium, or High priority, which factors into the panic score
- **Time Breakdown** — each card shows how many hours per day you need to spend to finish comfortably
- **Roast Me** — AI roasts your current workload situation. Use at your own risk
- **Streak Counter** — tracks consecutive days of activity
- **Card / List View Toggle** — switch between grid and compact list layout
- **Light / Dark Mode** — defaults to dark, preference saved across sessions
- **Done / Undo** — mark assignments complete and move them to a completed section
- **Freemium Model** — free tier with limits, premium tier via Stripe at $2.99/month

## Tech Stack

- **Frontend:** Next.js 16 (App Router), Tailwind CSS, Space Mono font
- **Backend:** Supabase (PostgreSQL database + authentication)
- **AI:** Groq API — llama-3.3-70b-versatile for text, llama-4-scout for image/document parsing
- **Payments:** Stripe
- **Hosting:** Vercel

## Architecture

```
User → Next.js App Router → Supabase (auth + database)
                         → Groq API (AI features)
                         → Stripe (payments)
```

## Database Schema

```sql
assignments
  id, user_id, title, course, deadline,
  estimated_hours, priority, completed, created_at

subscriptions
  id, user_id, stripe_customer_id,
  stripe_subscription_id, status, streak, last_active

diagnose_usage
  id, user_id, used_at
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Groq API key (free at console.groq.com)
- Stripe account (for payments)
- Vercel account (for deployment)

### Installation

```bash
git clone https://github.com/Ishvirchopra35/wrap-it-up.git
cd wrap-it-up
npm install
```

### Environment Variables

Create a `.env.local` file in the root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROQ_API_KEY=your_groq_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_PRICE_ID=your_stripe_price_id
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
NEXT_PUBLIC_ENABLE_FREEMIUM=false
```

### Database Setup

Run this in your Supabase SQL Editor:

```sql
create table assignments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  course text not null,
  deadline timestamptz not null,
  estimated_hours numeric not null,
  priority text default 'medium',
  completed boolean default false,
  created_at timestamptz default now()
);

create table subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'free',
  streak integer default 0,
  last_active date,
  created_at timestamptz default now()
);

create table diagnose_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  used_at timestamptz default now()
);

alter table assignments enable row level security;
alter table subscriptions enable row level security;
alter table diagnose_usage enable row level security;

create policy "Users can only see their own assignments" on assignments for all using (auth.uid() = user_id);
create policy "Users can see their own subscription" on subscriptions for all using (auth.uid() = user_id);
create policy "Users can see their own usage" on diagnose_usage for all using (auth.uid() = user_id);
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Panic Score Logic

```
Time Remaining = Deadline - Now (in hours)
Work Pressure  = Estimated Hours / Time Remaining
Priority Multiplier = 0.5 (Low) | 1.0 (Medium) | 1.5 (High)
Panic Score    = clamp(Work Pressure × 100 × Priority Multiplier, 0, 100)
```

If the deadline has already passed → Panic Score = 100.

## Deployment

The app is deployed on Vercel. Connect your GitHub repo, add all environment variables in Vercel project settings, and deploy.

For the Stripe webhook, set the endpoint to:
```
https://your-domain.vercel.app/api/stripe/webhook
```

## Roadmap

- [ ] Email notifications for upcoming deadlines
- [ ] End of semester summary report
- [ ] Mobile app
- [ ] Analytics dashboard for premium users
- [ ] Custom themes
- [ ] Google Calendar sync

## License

This project is open source and available for educational purposes.

---

**Author:** Ishvir Singh Chopra
**Contact:** ishvir.chopra@gmail.com
**Live App:** [wrapitupapp.vercel.app](https://wrapitupapp.vercel.app)
