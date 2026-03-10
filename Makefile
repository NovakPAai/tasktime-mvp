.PHONY: dev backend frontend infra stop clean seed test lint setup

# --- First time setup ---
setup:
	./setup.sh

# --- Infrastructure (Postgres + Redis) ---
infra:
	docker compose up -d postgres redis
	@echo "Waiting for PostgreSQL..."
	@until docker compose exec -T postgres pg_isready -U tasktime >/dev/null 2>&1; do sleep 1; done
	@echo "PostgreSQL ready on :5432, Redis ready on :6379"

# --- Dev servers ---
backend: infra
	cd backend && npm run dev

frontend:
	cd frontend && npm run dev

# Start both backend and frontend (backend in background)
dev: infra
	@echo "Starting backend on :3000 and frontend on :5173..."
	@cd backend && npm run dev &
	@cd frontend && npm run dev

# --- Database ---
seed:
	cd backend && npm run db:seed

db-push:
	cd backend && npx prisma db push

db-reset:
	cd backend && npx prisma db push --force-reset && npm run db:seed

db-studio:
	cd backend && npx prisma studio

# --- Quality ---
test:
	cd backend && npm test

test-cov:
	cd backend && npm run test:coverage

lint:
	cd backend && npm run lint
	cd frontend && npm run lint

# --- Cleanup ---
stop:
	docker compose down
	@-pkill -f "tsx watch" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@echo "All services stopped"

clean: stop
	docker compose down -v
	rm -rf backend/node_modules frontend/node_modules
	@echo "Cleaned up volumes and node_modules"
