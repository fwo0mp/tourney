.PHONY: backend backend-mock frontend dev dev-mock install install-frontend find-port build-rust e2e-install e2e-snapshot e2e-regen e2e-test e2e-test-headed

# Find an available port starting from 8000
define find_port
$(shell python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')
endef

# Build Rust extension (clears uv cache to prevent stale versions)
# Run this after making changes to src/tourney_core/
build-rust:
	@echo "Clearing uv cache for tourney package..."
	@rm -rf ~/.cache/uv/sdists-v8/editable/e0de2fa0087c936d 2>/dev/null || true
	@echo "Building Rust extension..."
	uv run maturin develop --release

# Backend on fixed port 8000
backend:
	uv run uvicorn api.main:app --reload --port 8000

backend-mock:
	USE_MOCK_DATA=true uv run uvicorn api.main:app --reload --port 8000

# Frontend (assumes backend on port 8000)
frontend:
	cd web && BACKEND_PORT=8000 npm run dev

# Run both on dynamic port (use in single terminal)
dev:
	@PORT=$$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()'); \
	echo "Starting backend on port $$PORT"; \
	uv run uvicorn api.main:app --reload --port $$PORT & \
	sleep 2; \
	cd web && BACKEND_PORT=$$PORT npm run dev

dev-mock:
	@PORT=$$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()'); \
	echo "Starting backend (mock mode) on port $$PORT"; \
	USE_MOCK_DATA=true uv run uvicorn api.main:app --reload --port $$PORT & \
	sleep 2; \
	cd web && BACKEND_PORT=$$PORT npm run dev

# Install dependencies
install:
	uv sync

install-frontend:
	cd web && npm install

# Helper to just print an available port
find-port:
	@python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()'

# Install Playwright tooling and browser runtime
e2e-install:
	cd web && npm install
	cd web && npx -y @playwright/test@1.53.2 install chromium

# Create/refresh the canonical E2E DB snapshot
e2e-snapshot:
	uv run python scripts/e2e/create_db_snapshot.py

# Regenerate Playwright specs from markdown case definitions
e2e-regen:
	cd web && npm run e2e:regen

# Run E2E suite
e2e-test:
	cd web && npm run e2e:test

e2e-test-headed:
	cd web && npm run e2e:test:headed
