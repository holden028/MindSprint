# Deploy MindSprint on Railway

This app runs as **4 Railway services** from one GitHub repo:

| Service | Config file | Purpose |
|---------|-------------|---------|
| **api** | `apps/api/railway.toml` | Express API + auto-migrations |
| **worker** | `workers/ai/railway.toml` | Reminders, recurring tasks, schedule checks |
| **web** | `apps/web/railway.toml` | React frontend |
| **postgres** | Railway plugin | Database |
| **redis** | Railway plugin | Job queue |

## 1. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your `MindSprint` repository

## 2. Add Postgres + Redis

In the project:

1. **+ New** → **Database** → **PostgreSQL**
2. **+ New** → **Database** → **Redis**

## 3. Create the API service

1. **+ New** → **GitHub Repo** → same repo (or duplicate the repo service)
2. Rename to `api`
3. **Settings**:
   - **Root Directory**: leave **empty** (repo root — required so `sql/migrations` is available)
   - **Config file path**: `apps/api/railway.toml`
4. **Variables** (reference Postgres/Redis from plugins):

```
NODE_ENV=production
JWT_SECRET=<generate: openssl rand -base64 48>
OPENAI_API_KEY=<your groq or openai key>
OPENAI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
FRONTEND_URL=https://<your-web-service>.up.railway.app
```

5. **Networking** → **Generate Domain** (e.g. `mindsprint-api.up.railway.app`)

## 4. Create the Worker service

1. **+ New** → same repo
2. Rename to `worker`
3. **Settings**:
   - **Root Directory**: empty
   - **Config file path**: `workers/ai/railway.toml`
4. **Variables**:

```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
OPENAI_API_KEY=${{api.OPENAI_API_KEY}}
OPENAI_BASE_URL=${{api.OPENAI_BASE_URL}}
AI_MODEL=${{api.AI_MODEL}}
FRONTEND_URL=${{api.FRONTEND_URL}}
```

No public domain needed for the worker.

## 5. Create the Web service

1. **+ New** → same repo
2. Rename to `web`
3. **Settings**:
   - **Root Directory**: empty
   - **Config file path**: `apps/web/railway.toml`
4. **Variables** (VITE_ vars must be set before build):

```
VITE_API_URL=https://<your-api-domain>.up.railway.app
```

5. **Networking** → **Generate Domain**
6. Go back to **api** and update `FRONTEND_URL` to the web domain, then redeploy api.

## 6. Slack webhooks (optional)

In Slack app settings, set Request URLs to your API domain:

- Slash commands: `https://<api-domain>/slack/commands`
- Interactivity: `https://<api-domain>/slack/interactions`

## 7. Verify

- API health: `https://<api-domain>/health` → `{ "status": "OK", "db": "up" }`
- Open web URL, register/login, create a task with a deadline
- Check Settings → add Slack bot token for DM notifications

## iPhone home screen

Open the **web** URL in Safari → Share → **Add to Home Screen**.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| API crashes on start | Check `JWT_SECRET` and `OPENAI_API_KEY` are set |
| DB connection failed | Ensure `DATABASE_URL` references Postgres plugin; SSL is auto-enabled in production |
| Frontend can't reach API | Set `VITE_API_URL` on web service, then **redeploy web** (build-time var) |
| Reminders not firing | Ensure worker service is running and shares `REDIS_URL` |
| Migrations failed | Check api logs; fresh DB runs `000_base_schema.sql` then migrations 001–007 |

## Local Docker (unchanged)

```bash
cp .env.example .env
npm run dev
```

Frontend: http://localhost:5174 · API: http://localhost:8080
