# Deploy MindSprint on Oracle Cloud (Always Free)

Run the **full stack** (web + api + worker + Postgres + Redis) on one Always Free ARM VM, with a **free HTTPS URL** via DuckDNS + Caddy.

**Cost:** $0 Oracle compute (Always Free) + free DuckDNS hostname + free Groq/OpenAI key usage within their free tiers.  
Oracle does **not** give you a branded domain — DuckDNS gives you `yourname.duckdns.org` for free.

---

## What you get

| Piece | How |
|--------|-----|
| App URL | `https://yourname.duckdns.org` |
| API (same host) | `https://yourname.duckdns.org/api/...` |
| TLS | Automatic via Caddy / Let’s Encrypt |
| DB + Redis | Containers on the same VM (not exposed publicly) |

---

## 1. Create an Always Free VM

1. Sign up: [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/)
2. In the console: **Compute → Instances → Create instance**
3. Recommended shape (Always Free eligible):
   - **VM.Standard.A1.Flex** (Ampere ARM)
   - **2 OCPU**, **12 GB RAM** (plenty for MindSprint)
4. Image: **Ubuntu 22.04** (or 24.04)
5. Networking: assign a **public IP**
6. Upload/download your **SSH key**
7. Create the instance and note the **public IP**

### Open ports (required)

**VCN → Security List** (or NSG) ingress:

| Port | Source | Why |
|------|--------|-----|
| 22 | your IP (or 0.0.0.0/0 if you must) | SSH |
| 80 | 0.0.0.0/0 | Let’s Encrypt + HTTP→HTTPS |
| 443 | 0.0.0.0/0 | App HTTPS |

Do **not** open 5432 / 6379 / 8080 to the internet.

---

## 2. Free hostname (DuckDNS)

1. Create an account at [https://www.duckdns.org](https://www.duckdns.org)
2. Create a subdomain, e.g. `mindsprint` → `mindsprint.duckdns.org`
3. Set the IP to your Oracle **public IP**
4. (Optional) install their update cron so the IP stays correct if it changes

---

## 3. SSH in and install MindSprint

```bash
ssh ubuntu@YOUR_PUBLIC_IP
# (Oracle Linux images may use opc@ instead of ubuntu@)

sudo apt-get update
sudo apt-get install -y git curl openssl

git clone https://github.com/holden028/MindSprint.git
cd MindSprint

bash deploy/oracle/bootstrap.sh
# First run creates deploy/oracle/.env with random secrets, then exits.
```

Edit the env file:

```bash
nano deploy/oracle/.env
```

Set at least:

```env
DOMAIN=mindsprint.duckdns.org
FRONTEND_URL=https://mindsprint.duckdns.org
VITE_API_URL=https://mindsprint.duckdns.org/api
OPENAI_API_KEY=your-real-key
```

(`JWT_SECRET` and `POSTGRES_PASSWORD` were auto-generated — leave them.)

Start:

```bash
bash deploy/oracle/bootstrap.sh
```

First build takes several minutes on ARM.

---

## 4. Verify

- App: `https://yourname.duckdns.org`
- Health: `https://yourname.duckdns.org/api/health`

In the app: **Settings → App URL** → save `https://yourname.duckdns.org` (for Slack links).

---

## Useful commands

```bash
cd ~/MindSprint   # or wherever you cloned

# Logs
sudo docker compose -f docker-compose.oracle.yml --env-file deploy/oracle/.env logs -f

# Restart after env changes (rebuild web if VITE_API_URL / DOMAIN changed)
sudo docker compose -f docker-compose.oracle.yml --env-file deploy/oracle/.env up -d --build

# Stop
sudo docker compose -f docker-compose.oracle.yml --env-file deploy/oracle/.env down
```

---

## Updating to a new GitHub version

```bash
cd ~/MindSprint
git pull
sudo docker compose -f docker-compose.oracle.yml --env-file deploy/oracle/.env up -d --build
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Can’t reach HTTPS | Security list missing 80/443; DuckDNS IP wrong; wait 1–2 min for cert |
| `CORS blocked` | `FRONTEND_URL` must be exactly `https://YOUR_DOMAIN` (no trailing slash) |
| Blank app / API errors | Rebuild web after changing `VITE_API_URL`; it is build-time |
| Worker / API crash on start | `OPENAI_API_KEY` missing in `deploy/oracle/.env` |
| Out of memory | Use A1 Flex with ≥8 GB RAM; avoid the tiny x86 micro shape for this stack |
| SSH works, site doesn’t | Confirm `sudo docker compose ... ps` shows `caddy`, `web`, `api` healthy |

---

## Security notes

- Keep `deploy/oracle/.env` private (never commit it)
- Prefer SSH from your IP only on port 22
- Postgres/Redis stay on the Docker network only
- Rotate `JWT_SECRET` / DB password if the VM is ever exposed

---

## vs Railway

| | Oracle Always Free | Railway Hobby |
|--|--------------------|---------------|
| Cost | ~$0 compute | ~$5+/mo |
| Domain | DuckDNS free subdomain | `*.up.railway.app` free |
| Ops | You manage the VM | Managed deploys |
| Best for | Always-on + cheapest | Least sysadmin work |
