# EGX Insights

A full-stack Egyptian Exchange (EGX) market intelligence platform combining stock data, AI-driven analysis, portfolio tracking, and watchlist management in a single interface.

**Backend** → [egx-insights.onrender.com](https://egx-insights.onrender.com) (Render)  
**Frontend** → [stockinsight-terminal.vercel.app](https://egx-insights.vercel.app/) (Vercel)

---

## Features

### Live Market Dashboard
All EGX-listed stocks with prices, fair-value estimates, upside %, P/E ratios, 52-week highs/lows, and technical sentiment scores. Primary quote data comes from the TradingView scanner; Yahoo Finance is used as an automatic per-ticker fallback. Server-side cache keeps API latency low.

### Stock Details
Click any stock for an interactive panel with:
- Historical price charts (1D / 1W / 1M / 1Y / ALL timeframes)
- Fundamentals: EPS, revenue, market cap, sector
- On-demand Gemini AI insight card summarising the stock's current position and outlook

### Market Scanners
Seven screener presets that filter the full EGX universe in real time:

| Scanner | Description |
|---|---|
| **Alpha Hunt** | Highest upside to fair value |
| **Deep Value** | Lowest P/E ratios (< 15) |
| **Near 52W High** | Within 10 % of yearly peak |
| **Value Floor** | Closest to 52-week lows |
| **Bullish Consensus** | Strongest technical buy signals (sentiment ≥ 62) |
| **Bearish Watch** | Weakest sentiment / risk zone (< 40) |
| **Overvalued** | Trading above estimated fair value |

Each scanner supports sector filtering and column-level sorting. The **AI Picks** tab calls Gemini to produce a ranked buy/sell recommendation list with High / Medium / Low conviction levels and a natural-language rationale per pick.

### AI Market Chat
A conversational interface backed by Gemini 2.5 Flash. Ask any question about EGX stocks or the broader market (e.g. *"Which banking stocks look undervalued right now?"*). The model receives a live snapshot of all stock data as context and keeps multi-turn conversation history. Suggested follow-up questions are returned with each reply.

### Portfolio Management *(requires login)*
- Add holdings by searching any EGX ticker, entering quantity and average purchase cost
- Edit or delete existing holdings
- Real-time P&L per holding: current value, cost basis, gain/loss in EGP and %
- Aggregate stats: total invested, current value, overall gain/loss

### Watchlist Analysis *(requires login)*
- Typeahead search to track any EGX ticker
- Each watched stock is enriched with live price, fair value, upside %, P/E, 52-week range, and sentiment score
- Sortable columns and sentiment bar (Bullish / Neutral / Bearish) per holding
- One-click removal

### Authentication
Email + password registration and login. Passwords hashed with bcrypt; sessions use signed 7-day JWTs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI (Python 3.13), Motor (async MongoDB driver) |
| Database | MongoDB Atlas |
| AI | Google Gemini 2.5 Flash (`google-generativeai`) |
| Auth | JWT via `python-jose`, bcrypt |
| CI/CD | GitHub Actions → Render (backend) + Vercel (frontend) |

---

## Project Structure

```
stockinsight-terminal/
├── Backend/                  # FastAPI app
│   ├── app/
│   │   ├── routes/           # auth, stocks, market, portfolio, watchlist
│   │   ├── services/         # scraper, yahoo_finance, gemini, cache
│   │   ├── data/             # EGX stock universe
│   │   ├── auth.py           # JWT + bcrypt helpers
│   │   ├── database.py       # Motor/MongoDB client
│   │   └── models.py         # Pydantic schemas
│   ├── tests/                # pytest unit + integration tests
│   ├── Dockerfile
│   └── requirements.txt
├── Frontend/                 # React / Vite app
│   ├── src/
│   │   ├── components/       # Dashboard, MarketScanners, Portfolio, Watchlist,
│   │   │                     # StockDetails, StockChat, auth/…
│   │   ├── context/          # AuthContext
│   │   └── data.ts           # API client (all fetch calls)
│   ├── Dockerfile
│   └── vite.config.ts
├── deploy/
│   ├── vps/                  # nginx + certbot config (Docker Compose / VPS)
│   ├── k8s/                  # Kubernetes manifests
│   └── monitoring/           # Prometheus + Grafana + Loki stack
└── .github/workflows/
    ├── ci.yml                # lint + test on every push
    └── cd.yml                # deploy to Render + Vercel on merge to main
```

---

## API Reference

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/stocks
GET    /api/stocks/{ticker}
GET    /api/stocks/{ticker}/history?range=1mo&interval=1d
GET    /api/stocks/{ticker}/insights
GET    /api/stocks/ai-recommendations
POST   /api/stocks/chat

GET    /api/market/summary
GET    /api/market/leaders
GET    /api/market/value-floor

GET    /api/portfolio
POST   /api/portfolio/holdings
PUT    /api/portfolio/holdings/{id}
DELETE /api/portfolio/holdings/{id}

GET    /api/watchlist
POST   /api/watchlist
DELETE /api/watchlist/{ticker}
```

---

## Local Development

```bash
# 1. Clone and enter the repo
git clone https://github.com/yousefwael02/EGX-Insights.git
cd EGX-Insights

# 2. Copy env files
cp .env.example .env
cp Backend/.env.example Backend/.env
# Fill in MONGODB_URI, JWT_SECRET, GEMINI_API_KEY

# 3. Start all services
docker compose up --build
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

### Without Docker

```bash
# Backend
cd Backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (separate terminal)
cd Frontend
npm install
npm run dev
```

---

## Deployment

### Continuous Deployment (automatic)

Every push to `main` triggers GitHub Actions:

1. **CI** — runs `ruff`, `pytest`, `eslint`, `vitest` and aborts on failure
2. **CD** — on success, triggers the Render deploy hook (backend) and runs `vercel deploy --prod` (frontend)

Required GitHub secrets:

| Secret | Where to find it |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render dashboard → service → Settings → Deploy Hook |
| `VERCEL_TOKEN` | vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `vercel link` → `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | same file → `projectId` |

### Required environment variables on Render

| Variable | Value |
|---|---|
| `ENV` | `production` |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB` | `stockinsight` |
| `JWT_SECRET` | Strong random secret |
| `GEMINI_API_KEY` | Google AI Studio key |
| `CORS_ORIGINS` | Frontend domain(s), comma-separated |

### Required environment variable on Vercel

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://egx-insights.onrender.com` |
