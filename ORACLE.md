# Deploy MindSprint on Oracle Cloud (Always Free)

Run the **full stack** (web + api + worker + Postgres + Redis) on one Always Free ARM VM, with a **free HTTPS URL** via DuckDNS + Caddy.

**Cost:** $0 Oracle compute (Always Free) + free DuckDNS hostname + free Groq/OpenAI key usage within their free tiers.  
Oracle does **not** give you a branded domain — DuckDNS gives you `yourname.duckdns.org` for free.

There are two ways to create the VM:

| Path | Best when |
|------|-----------|
| **A) Terraform + OCI CLI** (below) | You want the VM/network created from your Mac |
| **B) Console click-ops** (section 1b) | You prefer the Oracle website UI |

---

## 0) One-time: OCI CLI + API key (for Terraform)

On your Mac:

```bash
# Install CLI (pick one)
brew install oci-cli
# or: bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# Create ~/.oci/config + key pair
oci setup config
```

When prompted:
- **User OCID** → Oracle Console → Profile → My profile → copy User OCID  
- **Tenancy OCID** → Profile → Tenancy → copy OCID  
- **Region** → e.g. `uk-london-1`  
- Generate a new API key (yes)

Then upload the **public** key:

1. Console → Profile → **API keys** → **Add API key** → paste `~/.oci/oci_api_key_public.pem`  
2. Save

Quick check:

```bash
oci iam region list --output table
```

Also ensure you have an SSH public key:

```bash
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
```

Install Terraform if needed:

```bash
brew install terraform
```

---

## 1a) Create the VM with Terraform (recommended)

From this repo on your Mac:

```bash
cd deploy/oracle/terraform
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars   # set compartment_id + region
```

`compartment_id` is usually your **tenancy OCID** (same as above).

```bash
terraform init
terraform plan
terraform apply
```

Note the **public_ip** from the output.

If create fails with “Out of capacity”, edit `terraform.tfvars`:

```hcl
availability_domain_index = 1   # try 1 or 2
# or reduce size:
# ocpus = 1
# memory_in_gbs = 6
```

Then `terraform apply` again.

Cloud-init installs Docker automatically (takes 1–2 minutes after the VM is RUNNING).

---

## 1b) Create the VM in the console (manual)

1. Sign up: [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/)
2. In the console: **Compute → Instances → Create instance**
3. Recommended shape (Always Free eligible):
   - **VM.Standard.A1.Flex** (Ampere ARM)
   - **2 OCPU**, **12 GB RAM** (plenty for MindSprint)
4. Image: **Ubuntu 22.04** (or 24.04)
5. Networking: assign a **public IP**
6. Upload/download your **SSH key**
7. Create the instance and note the **public IP**

### Open ports (required for console path)

If you used Terraform, ports **22 / 80 / 443** are already open.  
For console-created VMs, set **VCN → Security List** (or NSG) ingress:

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

# If Terraform cloud-init already installed Docker, skip apt docker install.
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

## Auto-deploy (GitHub → VM)

Pushes to `main` trigger `.github/workflows/deploy-oracle.yml`, which SSHs into the VM and rebuilds Docker.

GitHub secrets (already used for this project):

- `ORACLE_HOST` — e.g. `mindsprint0.duckdns.org`
- `ORACLE_SSH_KEY` — private key for `ubuntu@` on the VM

Manual run: GitHub → **Actions** → **Deploy Oracle** → **Run workflow**.

This stays on Always Free; a rebuild does not add a hosting bill.

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

### Destroy the Terraform VM (when you want it gone)

```bash
cd deploy/oracle/terraform
terraform destroy
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
| Out of capacity / shape unavailable | Change `availability_domain_index` or try another region |
| `oci` auth errors | Re-check API key upload + User/Tenancy OCIDs in `~/.oci/config` |
| SSH works, site doesn’t | Confirm `sudo docker compose ... ps` shows `caddy`, `web`, `api` healthy |

---

## Security notes

- Keep `deploy/oracle/.env` and `terraform.tfvars` private (never commit them)
- Prefer SSH from your IP only (`ssh_cidr = "x.x.x.x/32"`)
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
