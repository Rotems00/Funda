# 🚀 Funda - Quick Start Guide

## ✅ Installation Complete!

Your backend and frontend dependencies are all installed. Here's what you have:

### Backend (Express + Node.js + MongoDB)
```
✅ express@4.22.2           - Web server
✅ mongoose@7.8.10          - MongoDB driver
✅ cors@2.8.6               - Cross-origin requests
✅ dotenv@16.6.1            - Environment variables
✅ typescript@5.9.3         - Type safety
✅ axios@1.18.1             - HTTP requests (for Polygon API)
```

### Frontend (React + Vite)
```
✅ react@18.3.1             - UI framework
✅ react-router-dom@6.30.4  - Routing
✅ vite@4.5.14              - Build tool
✅ typescript@5.9.3         - Type safety
✅ axios@1.18.1             - HTTP requests
```

---

## 🔧 Next: Configure Environment Variables

### Backend Setup
1. Open `backend/.env.local` in VS Code
2. Add your API keys:
   ```
   POLYGON_API_KEY=sk_... (get from https://polygon.io - free tier)
   FMP_API_KEY=... (optional, from financialmodellingprep.com)
   MONGODB_URI=mongodb://localhost:27017/funda
   NODE_ENV=development
   PORT=3001
   ```

### Frontend Setup
1. Open `frontend/.env.local` (already configured, no changes needed)
   ```
   VITE_API_URL=http://localhost:3001/api
   ```

---

## 📦 Before You Start: Install MongoDB

You need MongoDB running locally:

### Option 1: Install MongoDB Community Edition
```bash
# macOS with Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Verify it's running
mongosh  # Should connect to localhost:27017
```

### Option 2: Use Docker (easier if you have Docker)
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Option 3: Use MongoDB Atlas (cloud)
Replace `MONGODB_URI` in `.env.local` with your Atlas connection string.

---

## 🎬 Start Development

### Terminal 1: Backend API (port 3001)
```bash
cd /Users/rotemziv/Documents/Funda/backend
npm run dev
```
You should see:
```
🚀 Funda backend running on http://localhost:3001
📊 Health check: http://localhost:3001/health
```

### Terminal 2: Frontend UI (port 5173)
```bash
cd /Users/rotemziv/Documents/Funda/frontend
npm run dev
```
Your browser should open at `http://localhost:5173`

---

## ✅ Verify Everything Works

### 1. Check Backend Health
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"2026-06-23T..."}
```

### 2. Check Frontend
Open `http://localhost:5173` in your browser. You should see:
- "Funda" heading
- Search box
- 5 Pillars of Analysis

### 3. Test the Rating Engine
```bash
cd backend
npm run test:rating -- MELI
# Should output pillar scores and overall rating
```

---

## 📝 What's Next?

### Phase 1: Get Search Working (Priority 1)
1. Create `backend/src/routes/stocks.ts` with `GET /api/stocks/search`
2. Create `backend/src/services/polygonService.ts` to fetch from Polygon.io
3. Create `backend/src/services/cacheService.ts` to save to MongoDB
4. Build `frontend/src/pages/Search.tsx` component
5. Connect frontend search box to backend API

### Phase 2: Stock Detail & Rating (Priority 2)
1. Create `GET /api/stocks/:ticker` endpoint
2. Build `frontend/src/components/RatingCard.tsx`
3. Build `frontend/src/components/PillarBreakdown.tsx`
4. Create `frontend/src/pages/StockDetail.tsx`

### Phase 3: Momentum & Trends (Priority 3)
1. Implement `GET /api/stocks/:ticker/momentum` 
2. Build `frontend/src/components/MomentumChart.tsx`
3. Create `frontend/src/pages/Momentum.tsx`

### Phase 4: Onboarding (Priority 4)
1. Create user profile endpoint
2. Build `OnboardingFlow.tsx` component

---

## 📚 Key Files to Work On

### Backend (Left to Build)
| File | Purpose |
|------|---------|
| `src/routes/stocks.ts` | API endpoints for stock search, detail, momentum |
| `src/routes/users.ts` | Onboarding & user profile endpoints |
| `src/routes/admin.ts` | Cache management endpoints |
| `src/services/polygonService.ts` | Polygon.io API calls |
| `src/services/cacheService.ts` | MongoDB queries (create, read, update) |
| `src/services/normalizerService.ts` | Convert API data to DB schema |

### Frontend (Left to Build)
| File | Purpose |
|------|---------|
| `src/pages/Search.tsx` | Main search page |
| `src/pages/StockDetail.tsx` | Rating detail view |
| `src/pages/Momentum.tsx` | Trend charts |
| `src/components/RatingCard.tsx` | Star rating display |
| `src/components/PillarBreakdown.tsx` | 5-pillar bars |
| `src/components/MomentumChart.tsx` | QoQ/YoY trends |
| `src/components/TickerAutocomplete.tsx` | Search with recent/trending |
| `src/hooks/useStock.ts` | Custom hook for stock API calls |
| `src/hooks/useSearch.ts` | Custom hook for search logic |

---

## 🤖 Using AI Agents Now

Now that everything is set up, you can ask Claude/Copilot for specific features:

✅ **Good prompts:**
```
"Implement GET /api/stocks/search that returns recent and trending tickers from 
MongoDB, with focus on user's wheelhouse sectors"

"Build a RatingCard component that displays a stock's 0-5 rating with star visual 
and 5-pillar breakdown"

"Create a useStock hook that fetches stock data from /api/stocks/:ticker and 
handles loading/error states"
```

❌ **Bad prompts:**
```
"Build the app"
"Implement search" (too vague)
"Make it better" (not specific)
```

**Reference the docs when asking AI:**
- `.github/copilot-instructions.md` — Architecture & patterns
- Your design files (HTML) — Exact UI specs
- `backend/src/models/stockSchema.ts` — Data structure
- `backend/src/engine/ratingEngine.ts` — Rating logic

---

## 🧪 Useful Commands

```bash
# Backend
cd backend
npm run dev              # Start dev server (with hot reload)
npm run build            # Build TypeScript → JavaScript
npm run test             # Run tests
npm run test:rating MELI # Test rating engine
npm run seed             # Populate DB with test stocks
npm run debug:stock MELI # Debug a stock's calculation
npm run lint             # Check for code issues

# Frontend
cd frontend
npm run dev              # Start dev server (Vite)
npm run build            # Build for production
npm run lint             # Check for code issues

# Database
mongosh                  # Connect to MongoDB console
# Then run: db.stocks.find() to see your stocks
```

---

## 🎯 Your First Task

**Goal: Get `/api/stocks/search` working**

1. Ask Claude/Copilot to implement `backend/src/routes/stocks.ts` with a search endpoint
2. Ask it to implement `backend/src/services/cacheService.ts` with MongoDB queries
3. Ask it to build `frontend/src/pages/Search.tsx` with a search form
4. Connect frontend to backend

Once that works, the rest follows naturally!

---

## ❓ Troubleshooting

### "Cannot find module 'express'"
- Did you run `npm install` in backend? ✅ Yes
- Is `node_modules/` present in `backend/`? Check: `ls backend/node_modules | head`

### Port 3001 already in use
```bash
# Find what's using port 3001
lsof -i :3001

# Kill it (replace PID)
kill -9 <PID>
```

### MongoDB connection refused
```bash
# Is MongoDB running?
mongosh  # Should connect

# If not, start it:
brew services start mongodb-community  # macOS
# or
docker run -d -p 27017:27017 --name mongodb mongo:latest  # Docker
```

### TypeScript errors in VS Code
- Make sure TypeScript extension is installed
- Restart VS Code
- Check: `npm list typescript` (should be installed)

---

## 🎉 You're Ready!

Everything is installed and configured. Now it's time to build! 

**Next steps:**
1. Get Polygon.io API key (https://polygon.io)
2. Add it to `backend/.env.local`
3. Start MongoDB
4. Run `npm run dev` in both backend & frontend
5. Ask Claude/Copilot to implement the first feature (search)

**Go build! 🚀**
