# Local Development Setup

## Prerequisites

- Node.js 18+
- Python 3.8+
- Supabase account
- OpenAI account with GPT-4 access

## Supabase Setup

Create project, get credentials from **Settings** > **API**:
- Project URL
- anon public key
- service_role key

**Database:** Run `scripts/setup-all.sql` in SQL Editor

**Storage:** Create public bucket named `item-photos`

**Auth:** Enable email auth, set Site URL to `http://localhost:3000`

## OpenAI Setup

Get API key from [platform.openai.com](https://platform.openai.com) > **API Keys**

## Installation

```bash
git clone [repo-url]
cd outfit-generator
npm install

cd agents_service
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cd ..
```

## Configuration

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
AGENTS_SERVICE_URL=http://localhost:8081
```

Copy environment to Python service:
```bash
cp .env.local agents_service/.env
```

## Running

Terminal 1:
```bash
npm run dev  # http://localhost:3000
```

Terminal 2:
```bash
cd agents_service
source venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8081 --reload
```

## Verification

- Frontend: `http://localhost:3000`
- AI Service: `http://localhost:8081` should return health status
- Test flow: signup → add item → analyze/generate outfit

## Commands

```bash
npm run dev          # Development server
npm run build        # Production build
npm run lint         # Linting
uvicorn app:app --reload  # Python service with reload
```

## Common Issues

- **Module errors:** Activate Python venv, reinstall requirements
- **Supabase errors:** Verify credentials, check RLS policies
- **OpenAI errors:** Check API key and credits
- **Upload errors:** Verify storage bucket setup

## Project Structure

```
outfit-generator/
├── agents_service/          # Python FastAPI service
│   ├── app.py              # Main AI service
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Python environment vars
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   ├── auth/              # Auth pages
│   └── layout.tsx         # Root layout
├── src/                    # React components and utilities
│   ├── app.tsx            # Main app logic
│   ├── components/        # UI components
│   ├── lib/               # Utilities and data layer
│   └── types/             # TypeScript types
├── scripts/               # Database setup scripts
│   ├── setup-all.sql      # Complete database setup
│   └── 01-06-*.sql        # Individual setup scripts
├── .env.local             # Environment variables
└── LOCAL_SETUP.md         # This file
```