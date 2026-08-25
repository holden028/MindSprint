#!/usr/bin/env bash
# Pull latest main and rebuild the production stack.
# Run on the Oracle VM: bash deploy/oracle/update.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="deploy/oracle/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy deploy/oracle/.env.example first."
  exit 1
fi

git fetch origin main
git reset --hard origin/main
git submodule update --init --recursive 2>/dev/null || true

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  echo "Cannot talk to Docker. Add this user to the docker group or enable passwordless sudo docker."
  exit 1
fi

export VITE_BUILD_SHA="$(git rev-parse --short HEAD)"

"${DOCKER[@]}" compose -f docker-compose.oracle.yml --env-file "$ENV_FILE" up -d --build
"${DOCKER[@]}" compose -f docker-compose.oracle.yml --env-file "$ENV_FILE" ps
echo "Deployed $(git rev-parse --short HEAD)"
