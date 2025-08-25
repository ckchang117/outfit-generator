# Local Development Setup

This guide will help you set up and run the Outfit Generator application locally for development.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)
- **Python** (version 3.8 or higher)
- **pip** (Python package installer)
- A **Supabase** account (free tier available)
- An **OpenAI** account with API access

## 🗄️ Supabase Setup

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization and enter project details
4. Wait for the project to be created (2-3 minutes)

### 2. Get Your Supabase Credentials
1. Go to your project dashboard
2. Navigate to **Settings** > **API**
3. Copy the following values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public key** (starts with `eyJ`)
   - **service_role key** (starts with `eyJ` - keep this secret!)

### 3. Configure Database Tables
1. Go to **SQL Editor** in your Supabase dashboard
2. **Option A - Quick Setup (Recommended):**
   - Copy and paste the entire contents of `scripts/setup-all.sql` into the SQL Editor
   - Run the script to create all tables, indexes, and policies at once
3. **Option B - Step by Step:**
   - Run the following SQL scripts in order:
     - `scripts/01-base-tables.sql` (creates clothing_items and outfits tables)
     - `scripts/02-shopping-tables.sql` (creates shopping feature tables)
     - `scripts/03-assistant-tables.sql` (creates OpenAI assistant tables)
     - `scripts/04-indexes.sql` (creates performance indexes)
     - `scripts/05-rls-policies.sql` (sets up security policies)
     - `scripts/06-data-migrations.sql` (optional, for existing data cleanup)

### 4. Set Up Storage
1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket named `item-photos`
3. Set the bucket to **Public** for easier access during development

### 5. Configure Authentication
1. Go to **Authentication** > **Settings**
2. Enable **Email** auth provider
3. Set **Site URL** to `http://localhost:3000`
4. Add `http://localhost:3000/**` to **Redirect URLs**

## 🤖 OpenAI Setup

### 1. Get Your OpenAI API Key
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up/login to your account
3. Navigate to **API Keys**
4. Click **Create new secret key**
5. Copy the key (starts with `sk-`)

### 2. Add Credits (if needed)
- The application requires GPT-4 access
- Add billing information and credits to your OpenAI account
- Monitor usage through the OpenAI dashboard

## 💻 Installation

### 1. Clone the Repository
```bash
git clone [your-repo-url]
cd outfit-generator
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Set Up Python Environment
```bash
cd agents_service
python -m venv venv

# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cd ..
```

## ⚙️ Environment Configuration

### 1. Create Environment File
Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

### 2. Configure .env.local
Open `.env.local` and add your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key

# OpenAI Configuration
OPENAI_API_KEY=sk-...your-openai-key

# Optional: OpenAI Assistant IDs (will be auto-generated on first run)
OPENAI_CATALOG_ASSISTANT_ID=
OPENAI_STYLIST_ASSISTANT_ID=

# Agents Service URL (for local development)
AGENTS_SERVICE_URL=http://localhost:8081
```

### 3. Python Environment Variables
Create a `.env` file in the `agents_service` directory:

```bash
cd agents_service
cp ../.env.local .env
```

## 🚀 Running the Application

You'll need to run both services simultaneously:

### Terminal 1: Next.js Frontend
```bash
npm run dev
```
This starts the frontend at `http://localhost:3000`

### Terminal 2: Python AI Service
```bash
cd agents_service
# Activate virtual environment first
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate     # Windows

python -m uvicorn app:app --host 0.0.0.0 --port 8081 --reload
```
This starts the AI service at `http://localhost:8081`

## 🧪 Verify Setup

### 1. Check Frontend
- Open `http://localhost:3000`
- You should see the Outfit Generator homepage
- Try signing up with a test email

### 2. Check AI Service
- Open `http://localhost:8081` in your browser
- You should see: `{"status":"healthy","service":"Outfit Generator AI Service"}`

### 3. Test Full Flow
1. Sign up and login
2. Add a clothing item with a photo
3. Try analyzing the item (Shopping Buddy feature)
4. Generate an outfit
5. Run wardrobe analysis

## 🛠️ Development Commands

### Next.js Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run linting
npm run setup        # Setup environment (interactive)
```

### Python Service Commands
```bash
# In agents_service directory
python app.py                    # Start service directly
uvicorn app:app --reload         # Start with auto-reload
python -m pytest tests/         # Run tests (if available)
```

## 🐛 Common Issues & Solutions

### "Module not found" errors
- Ensure you've activated the Python virtual environment
- Run `pip install -r requirements.txt` again

### Supabase connection errors
- Verify your credentials in `.env.local`
- Check that your Supabase project is running
- Ensure RLS policies allow your operations

### OpenAI API errors
- Verify your API key is correct
- Check you have sufficient credits
- Ensure GPT-4 access is enabled

### Images not uploading
- Check Supabase storage bucket is created and public
- Verify storage policies allow uploads
- Check browser console for CORS errors

### AI analysis not working
- Ensure both services are running
- Check `AGENTS_SERVICE_URL` points to `http://localhost:8081`
- Verify OpenAI assistants are created (check console logs)

## 🔧 Development Tips

### Hot Reloading
- Next.js automatically reloads on frontend changes
- Use `--reload` flag for Python service auto-restart
- Database changes require manual refresh

### Debugging
- Check browser console for frontend errors
- Check terminal outputs for both services
- Use Supabase dashboard to inspect database data

### Database Changes
- Modify SQL files in `scripts/` directory
- Run SQL directly in Supabase dashboard
- Consider using Supabase migrations for production

### Testing New Features
- Use browser dev tools to test responsive design
- Test authentication flow in incognito mode
- Try different image sizes and formats

## 📁 Project Structure

```
outfit-generator/
├── agents_service/          # Python FastAPI service
│   ├── app.py              # Main AI service
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Python environment vars
├── app/                    # Next.js app router
├── src/                    # React components and utilities
├── scripts/               # Database setup scripts
├── .env.local             # Environment variables
└── LOCAL_SETUP.md         # This file
```

## 🎯 Next Steps

Once you have the application running locally:

1. **Explore the code** - Start with `src/app.tsx` for the main app logic
2. **Add features** - The codebase uses modern React patterns and TypeScript
3. **Test changes** - Add items to your wardrobe and generate outfits
4. **Deploy** - See `DEPLOYMENT.md` for production deployment options

## 🆘 Need Help?

If you encounter issues not covered here:

1. Check the browser console and terminal outputs for error messages
2. Verify all environment variables are set correctly
3. Ensure both services are running simultaneously
4. Check Supabase dashboard for database/auth issues
5. Verify OpenAI account has sufficient credits and API access

Happy coding! 🎨✨