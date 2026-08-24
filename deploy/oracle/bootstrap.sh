#!/usr/bin/env bash
# Run on a fresh Oracle Always Free VM (Ubuntu 22.04+ recommended).
# Usage (from repo root):
#   bash deploy/oracle/bootstrap.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing Docker (if needed)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin missing. Re-run after: sudo apt-get install -y docker-compose-plugin"
  exit 1
fi

ENV_FILE="deploy/oracle/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp deploy/oracle/.env.example "$ENV_FILE"
  JWT="$(openssl rand -base64 48 | tr -d '\n')"
  DBPASS="$(openssl rand -base64 24 | tr -d '\n=/+' | cut -c1-24)"
  # portable in-place edit
  sed -i.bak "s|CHANGE_ME_LONG_RANDOM|$JWT|" "$ENV_FILE"
  sed -i.bak "s|CHANGE_ME_DB_PASSWORD|$DBPASS|" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
  echo ""
  echo "Created $ENV_FILE with random JWT_SECRET and POSTGRES_PASSWORD."
  echo "EDIT IT NOW before starting:"
  echo "  - DOMAIN / FRONTEND_URL / VITE_API_URL  (your DuckDNS name)"
  echo "  - OPENAI_API_KEY"
  echo ""
  echo "Then re-run: bash deploy/oracle/bootstrap.sh"
  exit 0
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${OPENAI_API_KEY:-}" || "$OPENAI_API_KEY" == "your-groq-or-openai-key" ]]; then
  echo "Set OPENAI_API_KEY in $ENV_FILE first."
  exit 1
fi
if [[ -z "${DOMAIN:-}" ]]; then
  echo "DOMAIN is empty in $ENV_FILE"
  exit 1
fi

echo "==> Building and starting MindSprint (DOMAIN=$DOMAIN)"
sudo docker compose -f docker-compose.oracle.yml --env-file "$ENV_FILE" up -d --build

echo ""
echo "Done. Open: https://${DOMAIN}"
echo "API health via proxy: https://${DOMAIN}/api/health"
echo "Logs: sudo docker compose -f docker-compose.oracle.yml --env-file $ENV_FILE logs -f"
