{\rtf1\ansi\ansicpg1252\cocoartf2865
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # \uc0\u55358 \u56800  ADHD FocusFlow AI \'96 Full MVP (Dockerized, Scalable, Learning Platform)\
\
NAME: MindSprint\
\
## Product Vision\
\
Build a **Dockerized web platform** that helps users with ADHD or executive dysfunction stay focused, break down big projects into small steps, and improve personal productivity through adaptive learning.\
\
The system combines **AI-assisted task breakdown**, **Pomodoro-style focus sessions**, **post-task reflection**, and **behavioral learning**. Over time, the platform learns what conditions help the user focus best \'97 like music, lighting, or task type \'97 and automatically suggests optimal conditions for future sessions.\
\
---\
\
## 1\uc0\u65039 \u8419  Core Features\
\
### A. Intelligent Task Breakdown\
- Users can input **emails, plain text, or upload screenshots** of assigned work.\
- Managers can POST structured tasks directly via API.\
- OpenAI (text + vision) breaks the content into small, actionable microtasks with estimated times and priorities.\
- Microtasks feed into focus sessions and progress tracking.\
\
### B. Adaptive Focus Sessions\
- Built-in **Pomodoro timer** (configurable durations).\
- Optional **ADHD Mode**: random 8\'9615 min focus bursts to maintain novelty.\
- During setup, users can **log conditions** that help them focus (e.g., \'93dark room\'94, \'93music\'94, \'93no phone\'94).\
- App **learns correlations** between focus success and these environment tags.\
\
### C. Personalized Learning Engine\
- After each focus session, users complete a short **self-reflection survey**:\
  - What went well?\
  - What distracted you?\
  - How focused did you feel (1\'9610)?\
  - What environment did you use (checkbox: music, light, silence, etc.)?\
- This data trains a lightweight recommendation model (stored in DB) that personalizes future task setups and suggests focus conditions automatically.\
- Example: *\'93You tend to perform best in quiet, dim environments for writing tasks under 30 minutes.\'94*\
\
### D. Progress, Gamification & Feedback\
- XP and streak tracking.\
- Achievement unlocks (e.g., 3 sessions in a row, 10 tasks completed).\
- Visual dopamine triggers: progress rings, streak flames, color transitions.\
- Real-time dashboard showing:\
  - \'93Today\'92s Focus Plan\'94\
  - Project progress\
  - Personalized tip (from learned model)\
  - Last reflection summary\
\
### E. Multi-User Platform\
- Multiple user accounts supported.\
- Social + email authentication (via **Clerk.dev** or **Supabase Auth**).\
- Each user\'92s learning data, preferences, and insights remain isolated.\
- Ready for scaling to teams or therapists in future releases.\
\
---\
\
## 2\uc0\u65039 \u8419  Tech Stack\
\
| Layer | Tech |\
|-------|------|\
| **Frontend** | React + Vite + TailwindCSS |\
| **Backend** | Node.js + Express |\
| **AI Integration** | OpenAI API (text + vision + embeddings) |\
| **Database** | PostgreSQL (with `pgvector` for embeddings) |\
| **Job Queue** | Redis + BullMQ |\
| **Auth** | Clerk.dev (social + email) or Supabase Auth |\
| **Storage** | Local `/uploads` (S3-ready) |\
| **Containerization** | Docker + docker-compose |\
| **Hosting (optional)** | Vercel (web), Render (API/DB), Upstash (Redis) |\
\
---\
\
## 3\uc0\u65039 \u8419  Learning Mechanism Overview\
\
Each completed focus session feeds back into a **user_focus_profile** table.  \
The model uses these data points to **weight conditions** that lead to higher success and focus scores.\
\
**Input features:**\
- Task type/category (e.g., writing, admin, creative)\
- Duration\
- Time of day\
- Environment conditions (music, light, location)\
- User self-rating (focus 1\'9610)\
- Completion status (done / abandoned)\
\
**Output:**\
- Suggested best focus configuration for next similar task.\
\
---\
\
## 4\uc0\u65039 \u8419  Database Schema (PostgreSQL with pgvector)\
\
```sql\
CREATE EXTENSION IF NOT EXISTS vector;\
\
CREATE TABLE users (\
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\
  email TEXT UNIQUE NOT NULL,\
  display_name TEXT,\
  auth_provider TEXT, -- google, github, email, etc.\
  created_at TIMESTAMPTZ DEFAULT now()\
);\
\
CREATE TABLE projects (\
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,\
  title TEXT NOT NULL,\
  source_type TEXT CHECK (source_type IN ('manual','email','screenshot','manager_api')) DEFAULT 'manual',\
  source_ref TEXT,\
  progress NUMERIC DEFAULT 0,\
  created_at TIMESTAMPTZ DEFAULT now()\
);\
\
CREATE TABLE tasks (\
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,\
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,\
  title TEXT NOT NULL,\
  description TEXT,\
  est_minutes INT,\
  priority INT DEFAULT 3,\
  status TEXT CHECK (status IN ('todo','doing','done')) DEFAULT 'todo',\
  embedding vector(1536)\
);\
\
CREATE TABLE sessions (\
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,\
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,\
  started_at TIMESTAMPTZ,\
  ended_at TIMESTAMPTZ,\
  duration_sec INT,\
  focus_mode TEXT CHECK (focus_mode IN ('pomodoro','adhd')),\
  environment JSONB, -- \{"music":true,"dark_room":false,"notes":"cafe"\}\
  self_rating INT,\
  reflection TEXT,\
  completed BOOLEAN DEFAULT false\
);\
\
CREATE TABLE focus_profiles (\
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,\
  category TEXT, -- e.g. "creative","admin"\
  avg_focus_score NUMERIC DEFAULT 0,\
  best_conditions JSONB,\
  sample_count INT DEFAULT 0,\
  updated_at TIMESTAMPTZ DEFAULT now()\
);\
\
CREATE TABLE ingests (\
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,\
  type TEXT CHECK (type IN ('email','screenshot','text','manager_api')),\
  raw_text TEXT,\
  file_path TEXT,\
  status TEXT CHECK (status IN ('queued','processing','done','error')) DEFAULT 'queued',\
  created_at TIMESTAMPTZ DEFAULT now()\
);\
5\uc0\u65039 \u8419  AI Behavior Prompts\
Task Breakdown (text/email)\
You are an ADHD-friendly productivity coach.\
Your task is to break down incoming work into small, actionable microtasks (5\'9620 minutes each) that clearly describe an action and outcome.\
Each microtask should have:\
- a clear goal (verb + object)\
- estimated time (minutes)\
- priority (1\'965)\
- short positive description\
Output JSON in the following schema:\
\{ "projectTitle": "...", "tasks": [ \{ "title": "...", "description": "...", "estMinutes": 10, "priority": 2 \} ] \}\
Task Breakdown (vision)\
Analyze the attached screenshot.\
Extract any actionable items (deadlines, tasks, checklists, or assignments).\
Ignore decorative or interface text.\
Output strictly as JSON per schema.\
Post-Reflection Assistant\
Analyze the user's reflection for improvement suggestions.\
Return a short supportive message, e.g.:\
"Next time, try combining lo-fi music with a 15m burst for similar tasks\'97you perform best that way."\
6\uc0\u65039 \u8419  REST API (MVP)\
POST /auth/login                -> OAuth or email magic link\
GET  /dashboard/today           -> get personalized plan + recommendations\
POST /ingest/text               -> text breakdown via AI\
POST /ingest/screenshot         -> image upload + AI vision breakdown\
POST /sessions/start            -> begin focus session\
POST /sessions/end              -> submit reflection + rating\
GET  /profile/recommendations   -> get learned focus suggestions\
7\uc0\u65039 \u8419  docker-compose.yml\
version: "3.9"\
services:\
  postgres:\
    image: pgvector/pgvector:pg16\
    environment:\
      POSTGRES_USER: app\
      POSTGRES_PASSWORD: app\
      POSTGRES_DB: focusflow\
    ports: ["5432:5432"]\
    volumes: [pgdata:/var/lib/postgresql/data]\
\
  redis:\
    image: redis:7-alpine\
    ports: ["6379:6379"]\
\
  api:\
    build:\
      context: ./apps/api\
      dockerfile: ../../docker/api.Dockerfile\
    env_file: [.env]\
    depends_on:\
      - postgres\
      - redis\
    ports: ["8080:8080"]\
    volumes:\
      - ./uploads:/app/uploads\
\
  web:\
    build:\
      context: ./apps/web\
      dockerfile: ../../docker/web.Dockerfile\
    env_file: [.env]\
    depends_on:\
      - api\
    ports: ["5173:5173"]\
\
  worker:\
    build:\
      context: ./workers/ai\
      dockerfile: ../../docker/worker.Dockerfile\
    env_file: [.env]\
    depends_on:\
      - postgres\
      - redis\
\
volumes:\
  pgdata:\
8\uc0\u65039 \u8419  .env.example\
NODE_ENV=development\
PORT=8080\
JWT_SECRET=changeme\
DATABASE_URL=postgresql://app:app@postgres:5432/focusflow\
REDIS_URL=redis://redis:6379\
OPENAI_API_KEY=sk-...\
UPLOAD_DIR=/app/uploads\
VITE_API_BASE=http://localhost:8080\
CLERK_SECRET_KEY=...\
CLERK_PUBLISHABLE_KEY=...\
9\uc0\u65039 \u8419  AI Worker Behavior\
Job: ai.breakdown\
Receives \{ ingestId, text \}\
Calls OpenAI (o4-mini) using prompt above\
Parses JSON \uc0\u8594  inserts project + tasks into DB\
Embeds task titles/descriptions with text-embedding-3-small\
Marks ingest as done\
Job: ai.visionBreakdown\
Reads uploaded image path\
Calls gpt-4o-mini with image_url\
Processes result as structured tasks\
Persists data\
\uc0\u55357 \u56607  Frontend MVP (React + Tailwind)\
Pages\
Login/Register (Clerk Auth)\
Dashboard\
Displays \'93Today\'92s Focus Plan\'94\
Shows progress rings, streaks, personalized suggestion\
Button: \'93Start Focus Session\'94\
Project View\
Task list + subtask hierarchy\
Button: \'93Break down more (AI)\'94\
Focus Mode\
Timer + controls\
Environment toggles: \'93Dark Room\'94, \'93Music\'94, \'93Phone off\'94, \'93Quiet space\'94\
End-session survey popup (1\'9610 rating, what worked/didn\'92t, free text)\
Reflections\
Historical log of completed sessions\
Simple stats: \'93Focus strongest in mornings with music.\'94\
1\uc0\u65039 \u8419 1\u65039 \u8419  Personalized Recommendation Logic (Backend)\
// pseudo-code\
async function updateFocusProfile(userId, session) \{\
  const category = inferCategory(session.task_id);\
  const existing = await db.focus_profiles.find(\{ user_id: userId, category \});\
  const newAvg = (existing.avg_focus_score * existing.sample_count + session.self_rating) / (existing.sample_count + 1);\
  const mergedConditions = mergeEnvironmentStats(existing.best_conditions, session.environment, session.self_rating);\
  await db.focus_profiles.updateOrCreate(\{ userId, category \}, \{\
    avg_focus_score: newAvg,\
    best_conditions: mergedConditions,\
    sample_count: existing.sample_count + 1\
  \});\
\}\
The merged profile is queried whenever the user starts a new session, generating personalized advice:\
\'93You typically perform best in low-light, music-on environments for creative tasks. Let\'92s recreate that!\'94\
1\uc0\u65039 \u8419 2\u65039 \u8419  Learning Survey Schema (Client Side)\
\{\
  "self_rating": 8,\
  "what_went_well": "Stayed focused, used timer",\
  "distractions": "Phone pinged once",\
  "environment": \{\
    "music": true,\
    "dark_room": false,\
    "silence": true\
  \},\
  "reflection": "Felt good rhythm, will try shorter bursts next time."\
\}\
1\uc0\u65039 \u8419 3\u65039 \u8419  Deployment Notes\
Run locally with docker-compose up -d --build\
Frontend \uc0\u8594  localhost:5173\
API \uc0\u8594  localhost:8080\
DB \uc0\u8594  persistent via pgdata volume\
AI + embedding jobs handled asynchronously via worker container\
Add load balancing via Nginx or Traefik for scaling\
Optional: Push learning metrics to a dashboard (Superset or Power BI)\
1\uc0\u65039 \u8419 4\u65039 \u8419  Future Expansion Ideas\
Community templates (e.g. \'93Thesis writing plan\'94, \'93Small business admin\'94)\
Mobile PWA with offline sessions\
AI-generated Focus Playlists via Spotify API\
Chrome Extension for one-click \'93Send this email to FocusFlow\'94\
Team dashboard for ADHD-friendly workplaces\
\uc0\u9989  Expected MVP Deliverables\
Fully Dockerized stack (web/api/worker/db/redis)\
Auth via Clerk or Supabase (social/email)\
Ingest via email/text/screenshot\
AI-generated microtasks\
Focus session timer + reflection survey\
Personalized recommendation engine (based on session data)\
Learning dashboard with adaptive focus tips\
\
---\
\
Would you like me to **generate the base folder structure and starter files** (React, Express, SQL, Docker, and Worker scripts) so you can paste them directly into Cursor next?  \
That\'92ll give you an instantly runnable scaffold.}