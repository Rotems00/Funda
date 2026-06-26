# 📈 Funda - Stock Rating Platform

A fundamental-focused stock rating app for beginner/intermediate investors. We rate US-listed stocks **0-5 based on fundamentals** (growth, profitability, valuation, safety, competitive moat) — not price action.

## 🎯 The Problem
Most retail investors either day-trade (losing money) or hold random stocks without understanding the business. Funda teaches "invest in what you understand" by surfacing stocks with great fundamentals in *your* wheelhouse.

## 🏗️ Stack
- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **Database:** MongoDB (local)
- **Data:** Polygon.io API (Quarterly financials, prices, company info)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (running locally on port 27017)
- Polygon.io API key (free tier available)

### Setup

```bash
# 1. Clone repo
cd /Users/rotemziv/Documents/Funda

# 2. Backend setup
cd backend
npm install
cp .env.local.example .env.local  # Add your API keys
npm run dev                       # Starts on http://localhost:3001

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm run dev                       # Starts on http://localhost:5173

# 4. Seed test data
cd backend
npm run seed                      # Populates 10 popular stocks
```

### First Test
- Open `http://localhost:5173`
- Search for "MELI" (MercadoLibre)
- Verify you see a 4.3/5 rating with all 5 pillars

---

## 📁 Project Structure

```
funda/
├── backend/
│   ├── src/
│   │   ├── engine/
│   │   │   ├── ratingEngine.ts      # 5-pillar scoring logic
│   │   │   └── ratioCalculator.ts   # Financial ratio calculations
│   │   ├── services/
│   │   │   ├── polygonService.ts    # Polygon.io API calls
│   │   │   ├── cacheService.ts      # MongoDB caching layer
│   │   │   └── normalizerService.ts # Standardize API data
│   │   ├── models/
│   │   │   └── stockSchema.ts       # Mongoose schemas
│   │   ├── routes/
│   │   │   ├── stocks.ts            # Stock search & detail
│   │   │   ├── users.ts             # Onboarding & profiles
│   │   │   └── admin.ts             # Cache management
│   │   └── index.ts                 # Express server
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.local
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Search.tsx           # Main search page
│   │   │   ├── StockDetail.tsx      # Rating detail view
│   │   │   ├── Momentum.tsx         # Trend charts
│   │   │   ├── Explore.tsx          # Browse by sector
│   │   │   ├── Watchlist.tsx        # Saved stocks
│   │   │   └── Profile.tsx          # User preferences
│   │   ├── components/
│   │   │   ├── RatingCard.tsx       # 0-5 stars + score
│   │   │   ├── PillarBreakdown.tsx  # 5-pillar breakdown
│   │   │   ├── MomentumChart.tsx    # QoQ/YoY trends
│   │   │   ├── TickerAutocomplete.tsx
│   │   │   └── OnboardingFlow.tsx   # 4-step onboarding
│   │   ├── hooks/
│   │   │   ├── useStock.ts          # Stock API hook
│   │   │   ├── useSearch.ts         # Search logic
│   │   │   └── useUser.ts           # User profile
│   │   ├── App.tsx
│   │   └── globals.css              # Manrope font, theming
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.local
│
├── .github/
│   └── copilot-instructions.md      # AI agent guidelines
└── README.md
```

---

## 🎓 Key Concepts

### 5 Pillars of Funda Rating

1. **Growing** — Revenue & EPS YoY trend, CAGR, acceleration
2. **Profitable** — Net margin, ROE, ROIC (>20% margin, >15% ROIC = strong)
3. **Fairly Priced** — P/E vs peers, PEG ratio (<1.5 favorable)
4. **Safe** — Debt/equity (<0.5), current ratio (>1.5), coverage
5. **Can Keep Winning** — Moat, R&D spend, market share

**Overall Rating = Average of 5 pillars (0-5, 0.5 increments)**

### Data Pipeline: "Fetch Once, Cache Forever"
1. User searches ticker → Check MongoDB cache
2. Cache hit + fresh (<7d)? → Return immediately (free, instant)
3. Cache miss or stale? → Fetch from Polygon.io, store in DB, return
4. Rating engine computes 5 pillars on every request (fast, local)

---

## 🛠️ Common Dev Tasks

### Add a new fundamental metric
1. Update `backend/src/models/stockSchema.ts` (add field to `fundamentals` collection)
2. Modify `backend/src/services/normalizerService.ts` to extract from Polygon response
3. Update `backend/src/engine/ratioCalculator.ts` to compute the ratio
4. Add pillar scorer logic in `backend/src/engine/ratingEngine.ts`
5. Create React component to display the metric

### Force refresh a stock's data
```bash
curl -X POST http://localhost:3001/api/admin/ingest/MELI
```

### Test the rating engine
```bash
cd backend
npm run test:rating -- MELI
```

### Debug a stock's calculation
```bash
cd backend
npm run debug:stock MELI
```

---

## 🧪 Testing

### Run all tests
```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm run lint
```

### Key test scenarios
- **Unit:** Each pillar's scoring logic (growing, profitable, etc.)
- **Integration:** Full flow: ticker → Polygon fetch → cache store → rating compute
- **E2E:** Search MELI in UI → verify all 5 pillars render + score is 4.3

---

## 📚 Design Files

Your design mockups are in the root directory:
- `Data Pipeline & Sources.dc.html` — Architecture & data flow
- `Onboarding - Know You.dc.html` — 4-step onboarding flow
- `Search Ticker - Flow.dc.html` — Ticker search + autocomplete
- `Rating Detail - Minimal.dc.html` — Stock detail page variants
- `Momentum - Trends.dc.html` — QoQ/YoY trend charts

Open these in your browser to see the exact UI design.

---

## ❓ FAQ

**Q: Why MongoDB?**
A: Flexible schema for evolving financial data; faster iteration than SQL.

**Q: Why cache aggressively?**
A: Polygon charges per API call; caching keeps costs down and UX snappy.

**Q: What if Polygon.io is down?**
A: Show last cached data with "as of [date]" label; graceful degradation.

**Q: Can I use real-time prices?**
A: Yes, but we cache end-of-day prices by default. Add a separate endpoint for intraday if needed.

---

## 📞 Next Steps

1. Install dependencies: `npm install` (both backend + frontend)
2. Set up `.env.local` files with your API keys
3. Start MongoDB: `mongod`
4. Run `npm run dev` in backend, `npm run dev` in frontend
5. Read `.github/copilot-instructions.md` for AI agent collaboration

**Questions?** Check the AI guidelines or open an issue.

---

**Built with TypeScript, React, Node.js, and 📊 fundamentals!**
