# StockInsight Production Guide

This guide documents the productionization implementation that was added to this repository.

## 1) Testing Strategy

### Backend testing

- Framework: pytest + pytest-asyncio + pytest-cov
- Linting: ruff
- Coverage threshold: 80% (enforced in Backend/pyproject.toml)

Added test structure:

- Backend/tests/conftest.py
- Backend/tests/unit/test_gemini.py
- Backend/tests/unit/test_yahoo_finance.py
- Backend/tests/integration/test_health.py
- Backend/tests/integration/test_stocks_endpoint.py

External API mocking examples:

- Gemini mocked in unit tests by forcing _genai_available=False
- TradingView mocked in integration tests via monkeypatch on fetch_tv_egx_quotes
- Yahoo Finance logic unit-tested in pure helper functions

Run backend checks:

```bash
cd Backend
pip install -r requirements.txt
ruff check .
pytest
```

### Frontend testing

- Framework: Vitest
- Component testing: React Testing Library
- Coverage threshold: lines 80, branches 70, functions 80, statements 80

Added test structure:

- Frontend/src/test/setup.ts
- Frontend/src/components/__tests__/TopNav.test.tsx

Run frontend checks:

```bash
cd Frontend
npm ci
npm run lint
npm run typecheck
npm test
```

## 2) Containerization

Added Docker assets:

- Backend/Dockerfile (production)
- Backend/Dockerfile.dev (development with reload)
- Backend/.dockerignore
- Frontend/Dockerfile (multi-stage build + nginx runtime)
- Frontend/nginx.conf
- Frontend/.dockerignore
- docker-compose.yml (local/dev stack)
- docker-compose.prod.yml (production stack with reverse proxy)

Services covered in compose:

- frontend
- backend
- mongodb
- redis
- nginx (prod compose)

Environment management:

- Backend/.env.example
- .env.example (root for compose)

## 3) CI/CD (GitHub Actions)

Added workflows:

- .github/workflows/ci.yml
- .github/workflows/cd.yml

### CI behavior

Triggers:

- push to any branch
- pull_request

Steps:

- Install dependencies (backend + frontend)
- Run linting (ruff + eslint)
- Run tests with coverage
- Run dependency vulnerability scans (pip-audit + npm audit)
- Build backend/frontend Docker images

### CD behavior

Trigger:

- push to main

Steps:

- Build and push images to GHCR
- Deploy to Kubernetes
- Update deployments with SHA tag
- Wait for rollout

Required GitHub secrets:

- KUBE_CONFIG (base64-encoded kubeconfig)
- GEMINI_API_KEY (for runtime secret creation process)
- JWT_SECRET
- MONGODB_URI

## 4) Infrastructure and Deployment

Both options are implemented. Recommendation: Kubernetes for scalability and safer rolling updates.

### Option A: VPS (simple)

Files:

- deploy/vps/nginx.prod.conf
- deploy/vps/init-letsencrypt.sh
- deploy/vps/deploy.sh
- docker-compose.prod.yml

Pros:

- Simpler setup
- Lower cost for small traffic

Cons:

- Manual scaling and failover
- Higher operational overhead as traffic grows

### Option B: Kubernetes (recommended)

Files:

- deploy/k8s/namespace.yaml
- deploy/k8s/configmap.yaml
- deploy/k8s/secrets.yaml
- deploy/k8s/backend-deployment.yaml
- deploy/k8s/frontend-deployment.yaml
- deploy/k8s/services.yaml
- deploy/k8s/ingress.yaml
- deploy/k8s/hpa.yaml

Pros:

- Horizontal scaling
- Rolling deployments and health probes
- Better long-term reliability

Cons:

- More complexity
- Higher baseline platform cost

## 5) Monitoring and Logging

Implemented observability stack:

- Structured JSON logging in FastAPI (python-json-logger)
- Prometheus metrics endpoint at /metrics
- Grafana + Prometheus + Loki + Promtail compose stack
- Alert rules for high error rate and high p95 latency

Files:

- deploy/monitoring/docker-compose.monitoring.yml
- deploy/monitoring/prometheus.yml
- deploy/monitoring/alert_rules.yml
- deploy/monitoring/loki-config.yml
- deploy/monitoring/promtail-config.yml
- deploy/monitoring/grafana/provisioning/datasources/datasources.yml
- deploy/monitoring/grafana/provisioning/dashboards/dashboards.yml
- deploy/monitoring/grafana/provisioning/dashboards/json/backend-overview.json

Start monitoring stack:

```bash
cd deploy/monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

## 6) Performance and Reliability

Implemented:

- Health endpoints: /healthz and /readyz
- API metrics via prometheus-fastapi-instrumentator
- Rate limiting via slowapi default limit (200/minute)
- Retry strategy for TradingView API calls using tenacity
- Redis service included for distributed caching/rate-limiting expansion

Modified files:

- Backend/main.py
- Backend/app/services/scraper.py
- Backend/requirements.txt

## 7) Security Best Practices

Implemented:

- Environment-variable based secrets management
- JWT auth preserved and production secret now documented
- Tightened CORS via configurable CORS_ORIGINS
- Dependency vulnerability scanning in CI
- Kubernetes secrets manifest scaffolded

Operational requirements:

- Do not commit real secrets
- Rotate JWT and API keys periodically
- Restrict ingress by host and TLS

## 8) Commands to Run

### Local development

```bash
cp .env.example .env
cp Backend/.env.example Backend/.env
docker compose up --build
```

App endpoints:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Metrics: http://localhost:8000/metrics

### CI-like local checks

```bash
cd Backend
ruff check .
pytest

cd ../Frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

### Kubernetes deployment

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secrets.yaml
kubectl apply -f deploy/k8s/backend-deployment.yaml
kubectl apply -f deploy/k8s/frontend-deployment.yaml
kubectl apply -f deploy/k8s/services.yaml
kubectl apply -f deploy/k8s/ingress.yaml
kubectl apply -f deploy/k8s/hpa.yaml
```

## Final Notes

- Kubernetes is the recommended target because this app has external dependencies and variable traffic, and benefits from autoscaling and rolling deployments.
- VPS option remains a valid lower-cost stepping stone for early production.
- Before first production release, run load tests and finalize backup/restore procedures for MongoDB.
