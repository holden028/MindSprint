# MindSprint - ADHD FocusFlow AI

A Dockerized web platform that helps users with ADHD or executive dysfunction stay focused, break down big projects into small steps, and improve personal productivity through adaptive learning.

## Features

- **AI-Powered Task Breakdown**: Upload text, emails, or screenshots to automatically generate microtasks
- **Adaptive Focus Sessions**: Pomodoro timer with ADHD mode (8-15 min bursts)
- **Personalized Learning**: AI learns your optimal focus conditions over time
- **Environment Tracking**: Track what conditions help you focus best
- **Progress Dashboard**: Visual progress tracking with streaks and achievements
- **Reflection System**: Post-session surveys to improve recommendations

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with pgvector
- **AI**: OpenAI API (GPT-4o-mini + Vision)
- **Queue**: Redis + BullMQ
- **Containerization**: Docker + docker-compose

## Deploy on Railway

See **[RAILWAY.md](./RAILWAY.md)** for step-by-step deployment (API + Worker + Web + Postgres + Redis).

Quick summary: connect GitHub → add Postgres & Redis → create 3 services (api, worker, web) with **Root Directory left empty** and config files in each app folder.

## Quick Start (Local Docker)

1. **Clone and setup**:
   ```bash
   cd MindSprint
   cp .env.example .env
   ```

2. **Configure environment**:
   Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-key-here
   ```

3. **Start the application**:
   ```bash
   npm run dev
   ```

4. **Access the app**:
   - Frontend: http://localhost:5174
   - API: http://localhost:8080
   - Database: localhost:5432

## Usage

1. **Login**: Enter your email to create an account
2. **Add Tasks**: Use the "Add Tasks (AI)" button to upload text or screenshots
3. **Start Focus**: Select a task and start a focus session
4. **Track Environment**: Toggle music, lighting, and other conditions
5. **Reflect**: Complete post-session surveys to improve AI recommendations
6. **View Progress**: Check your dashboard and reflection insights

## API Endpoints

- `POST /auth/login` - User authentication
- `GET /dashboard/today` - Get today's focus plan
- `POST /ingest/text` - Process text with AI
- `POST /ingest/screenshot` - Process images with AI
- `POST /sessions/start` - Start focus session
- `POST /sessions/end` - End session with reflection
- `GET /profile/recommendations` - Get AI insights

## Development

- **Backend**: `apps/api/` - Express.js API server
- **Frontend**: `apps/web/` - React application
- **Worker**: `workers/ai/` - AI processing worker
- **Database**: `sql/init.sql` - Database schema

## Docker Services

- `postgres` - PostgreSQL with pgvector
- `redis` - Redis for job queue
- `api` - Express.js API server
- `web` - React frontend
- `worker` - AI processing worker

## Environment Variables

See `.env.example` for all required environment variables.

## License

MIT License - see LICENSE file for details.

