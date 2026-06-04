#!/usr/bin/env bash
set -euo pipefail

# Full deployment script for Metaverse 2D (single-process, Oracle VM)
# Run this on the Oracle VM after pulling latest code.
#
# Prerequisites:
#   - Node.js >= 18
#   - pnpm installed globally (npm i -g pnpm)
#   - PostgreSQL / Neon DATABASE_URL configured in apps/http/.env
#   - nginx configured from deploy/nginx.conf

META_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$META_DIR"

# ── 1. Swap (first deploy only) ──────────────────────────────────────────────
if [ ! -f /swapfile ]; then
    echo "=== Setting up swap ==="
    sudo bash deploy/setup-swap.sh
fi

# ── 2. PM2 ───────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    echo "=== Installing PM2 ==="
    npm install -g pm2
fi

# ── 3. Dependencies ──────────────────────────────────────────────────────────
echo "=== Installing dependencies ==="
pnpm install --frozen-lockfile

# ── 4. Prisma ────────────────────────────────────────────────────────────────
echo "=== Generating Prisma client ==="
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma

echo "=== Running database migrations ==="
for sql in packages/db/prisma/migrations/*/migration.sql; do
    echo "  Applying: $sql"
    psql "$DATABASE_URL" -f "$sql" 2>/dev/null || echo "  (may already be applied)"
done

echo "=== Seeding database ==="
pnpm --filter @repo/db seed

# ── 5. Build ─────────────────────────────────────────────────────────────────
echo "=== Building combined HTTP + WS server ==="
pnpm --filter http build

echo "=== Building frontend ==="
pnpm --filter frontend build

# ── 6. Start / restart via PM2 ───────────────────────────────────────────────
echo "=== Starting / restarting via PM2 ==="
pm2 startOrRestart ecosystem.config.js --env production

pm2 save
pm2 startup || true   # prints the command to run as root to enable PM2 on boot

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Next steps (first deploy only):"
echo "  1. Copy deploy/nginx.conf to /etc/nginx/sites-available/metaverse2d"
echo "  2. ln -s /etc/nginx/sites-available/metaverse2d /etc/nginx/sites-enabled/"
echo "  3. nginx -t && systemctl reload nginx"
echo "  4. Run the 'pm2 startup' command printed above (as root) to survive reboots"
echo ""
