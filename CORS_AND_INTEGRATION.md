# Frontend-Backend Integration Guide

## Overview

This guide explains how to configure CORS on the backend and properly connect the frontend to the backend in both development and production environments.

## Development Setup

### Local Development (Same Machine)

**Backend:**
```bash
cd Backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd Frontend
npm run dev
```

The frontend will start at `http://localhost:5173` and automatically proxy API requests to the backend at `http://localhost:8000` via the Vite dev server configuration.

**Automatic CORS:** The backend detects `ENV != "production"` and allows all localhost origins:
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

No configuration needed for local development!

### Custom Backend URL (Development)

If your backend is on a different machine or port:

**Frontend/.env.local:**
```env
VITE_API_BASE_URL=http://192.168.1.100:8000
```

This tells the frontend to make direct API calls instead of going through the dev proxy.

**Backend/.env:**
```env
ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Production Setup

### Vercel Frontend + Render Backend + MongoDB Atlas

**Step 1: Backend on Render**

1. Push code to GitHub
2. Create Render Web Service:
   - Repository: `stockinsight-terminal`
   - Root directory: `Backend`
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables:
   ```
   ENV=production
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/stockinsight?retryWrites=true&w=majority
   MONGODB_DB=stockinsight
   JWT_SECRET=<generate-secure-random-string>
   GEMINI_API_KEY=<your-api-key>
   CORS_ORIGINS=https://your-app.vercel.app,https://your-domain.com
   ```
4. Copy the service URL: `https://your-backend.onrender.com`

**Step 2: Frontend on Vercel**

1. Create Vercel deployment:
   - Repository: `stockinsight-terminal`
   - Framework preset: Vite
   - Root directory: `Frontend`
   - Build: `npm run build`
   - Output: `dist`
2. Set environment variable:
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com
   ```
3. Deploy! Your app will be at `https://your-app.vercel.app`

**Step 3: Update CORS**

The backend now has `CORS_ORIGINS=https://your-app.vercel.app`, so requests from the frontend will be allowed.

### Docker Compose Deployment

For VPS or self-hosted deployments:

**docker-compose.yml:**
```yaml
services:
  backend:
    build: ./Backend
    environment:
      ENV: production
      MONGODB_URI: mongodb://mongo:27017
      MONGODB_DB: stockinsight
      JWT_SECRET: your-secret
      GEMINI_API_KEY: your-key
      CORS_ORIGINS: https://your-domain.com
    ports:
      - "8000:8000"
  
  frontend:
    build: ./Frontend
    environment:
      VITE_API_BASE_URL: https://your-domain.com/api
    ports:
      - "3000:80"
  
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

Run:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## CORS Configuration Details

### How It Works

The backend checks the `ENV` variable:

**Development Mode** (`ENV != production`):
- Automatically allows all localhost origins
- Perfect for development on same or different machines
- No configuration needed

**Production Mode** (`ENV=production`):
- Reads `CORS_ORIGINS` environment variable
- Comma-separated list of allowed origins
- Example: `https://app.vercel.app,https://example.com`

### Frontend Connector Logic

**data.ts** intelligently handles API URLs:

```javascript
const API_BASE = import.meta.env.VITE_API_BASE_URL 
  ? import.meta.env.VITE_API_BASE_URL 
  : '/api';
```

- **If `VITE_API_BASE_URL` is set:** Use it as the full backend URL
- **If not set:** Use local `/api` path (works with Vite proxy in dev)

### Vite Dev Proxy

**vite.config.ts** automatically proxies `/api` requests:

```javascript
proxy: {
  '/api': {
    target: env.VITE_API_BASE_URL || 'http://localhost:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}
```

This means:
- Request to `/api/stocks` → proxied to `http://localhost:8000/stocks`
- Works transparently in development without CORS issues

## Troubleshooting

### CORS Error: "Access to XMLHttpRequest blocked"

**Cause:** Frontend origin not in backend's allowed list

**Solution:**
1. Get your frontend URL (e.g., `https://app.vercel.app`)
2. Update backend `CORS_ORIGINS`:
   ```
   CORS_ORIGINS=https://app.vercel.app
   ```
3. Restart backend or redeploy

### Frontend Shows "API Connection Failed"

**Diagnosis:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Try an API call (e.g., navigate to Stocks page)
4. Look for failed requests in red

**Solutions:**
- Check that `VITE_API_BASE_URL` points to correct backend
- Verify backend is running and accessible
- Check firewall/network connectivity
- Confirm `CORS_ORIGINS` includes frontend URL

### Local Dev: "Cannot POST /auth/register"

**Cause:** Backend not running or dev proxy misconfigured

**Solution:**
```bash
# Terminal 1: Start backend
cd Backend
python -m uvicorn main:app --reload

# Terminal 2: Start frontend
cd Frontend
npm run dev
```

## Production Checklist

- [ ] Set `ENV=production` on backend
- [ ] Set `CORS_ORIGINS` to include frontend domain
- [ ] Set strong `JWT_SECRET` (not development key)
- [ ] Set `MONGODB_URI` to production database
- [ ] Set `GEMINI_API_KEY` from production API key
- [ ] Test login/register endpoints
- [ ] Test stock data loading
- [ ] Test AI chat functionality
- [ ] Monitor logs for errors

## Environment Variables Reference

### Backend (.env)

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `ENV` | ✓ | development | `production` |
| `MONGODB_URI` | ✓ | localhost | `mongodb+srv://...` |
| `MONGODB_DB` | ✗ | stockinsight | `stockinsight` |
| `JWT_SECRET` | ✓ | - | Long random string |
| `GEMINI_API_KEY` | ✓ | - | From Google AI Studio |
| `CORS_ORIGINS` | ✗ | Empty (dev mode) | `https://app.vercel.app` |
| `GEMINI_MODEL` | ✗ | gemini-2.5-flash-lite | - |

### Frontend (.env.local)

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `VITE_API_BASE_URL` | ✗ | Uses `/api` proxy | `https://api.example.com` |

