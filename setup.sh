#!/usr/bin/env bash
set -euo pipefail

# TaskTime MVP — Local dev setup
# Usage: ./setup.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "========================================="
echo "  TaskTime MVP — Dev Environment Setup"
echo "========================================="
echo ""

# --- Check prerequisites ---
command -v node  >/dev/null 2>&1 || error "Node.js not found. Install Node 20+ (https://nodejs.org)"
command -v npm   >/dev/null 2>&1 || error "npm not found"
command -v docker >/dev/null 2>&1 || error "Docker not found. Install Docker Desktop"
docker compose version >/dev/null 2>&1 || docker-compose --version >/dev/null 2>&1 || error "Docker Compose not found"

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
  error "Node.js 20+ required, found $(node -v)"
fi
info "Node.js $(node -v)"

# --- Start infrastructure ---
echo ""
echo "Starting PostgreSQL and Redis..."
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

$COMPOSE up -d postgres redis
info "PostgreSQL 16 + Redis 7 started"

# Wait for Postgres to be ready
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U tasktime >/dev/null 2>&1; then
    info "PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "PostgreSQL failed to start after 30s"
  fi
  sleep 1
done

# --- Backend setup ---
echo ""
echo "Setting up backend..."
cd backend

if [ ! -f .env ]; then
  cp .env.example .env
  info "Created backend/.env from .env.example"
else
  warn "backend/.env already exists, skipping"
fi

npm install
info "Backend dependencies installed"

npx prisma generate
info "Prisma client generated"

npx prisma db push
info "Database schema pushed"

npm run db:seed 2>/dev/null && info "Database seeded" || warn "Seed skipped (already seeded?)"

cd ..

# --- Frontend setup ---
echo ""
echo "Setting up frontend..."
cd frontend

if [ ! -f .env ]; then
  cp .env.example .env
  info "Created frontend/.env from .env.example"
else
  warn "frontend/.env already exists, skipping"
fi

npm install
info "Frontend dependencies installed"

cd ..

# --- Done ---
echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "  Start dev servers:"
echo "    make dev        — backend + frontend"
echo "    make backend    — only backend  (port 3000)"
echo "    make frontend   — only frontend (port 5173)"
echo ""
echo "  Demo accounts (password: password123):"
echo "    admin@tasktime.ru   — Admin"
echo "    manager@tasktime.ru — Manager"
echo "    dev@tasktime.ru     — Developer"
echo "    viewer@tasktime.ru  — Viewer"
echo ""
echo "  Open http://localhost:5173 in your browser"
echo ""
