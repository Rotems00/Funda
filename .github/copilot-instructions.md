# Funda - AI Coding Agent Instructions

## Project Overview
**Funda** is a fundamental-focused stock rating platform for beginner/intermediate investors. It rates US-listed stocks 0-5 based on fundamentals (growth, profitability, valuation, safety, sustainability) rather than price action.

**Stack:** TypeScript, React (frontend), Node.js + Express (backend), MongoDB, Polygon.io API

---

## Architecture: "Fetch Once, Cache Forever"

### Core Data Flow
1. **External APIs** (Polygon.io, FMP, SEC EDGAR) → Paid per-call data sources
2. **Ingestion Gateway** → Cache check, rate-limit, normalize to unified schema
3. **MongoDB** → Single source of truth; subsequent users served from cache
4. **Metric Engine** → Compute fundamentals (QoQ, YoY, CAGR, ratios, trajectory)
5. **Frontend** → Display ratings and detailed metric cards

**Key principle:** First lookup of a ticker fetches external data. Subsequent requests use cached DB data. Re-fetch only when genuinely new data exists.

---

## Database Schema

### Collections

**`stocks`**
```
{
  ticker: string (unique)
  companyName: string
  sector: string
  industry: string
  lastUpdated: Date
  dataFreshness: { ticker: Date, financials: Date, price: Date }
}
```

**`fundamentals`**
```
{
  stockId: ObjectId (ref: stocks)
  quarter: string (e.g., "Q4'25")
  period: "quarterly" | "annual"
  revenue: number
  netIncome: number
  eps: number
  operatingCashFlow: number
  freeCashFlow: number
  debt: number
  equity: number
  timestamp: Date
}
```

**`metrics`**
```
{
  stockId: ObjectId
  rating: number (0-5)
  pillars: {
    growing: number,      // Revenue/EPS YoY growth
    profitable: number,   // Net margin, ROE, profitability
    fairlyPriced: number, // P/E, PEG, valuation ratios
    safe: number,         // Debt/equity, current ratio
    canKeepWinning: number // Competitive moat, market position
  }
  ratios: {
    peRatio: number
    pegRatio: number
    debtToEquity: number
    netMargin: number
    roic: number
  }
  trends: {
    revenueYoY: number (%)
    epsYoY: number (%)
    revenueCagr5Y: number (%)
    trajectory: "accelerating" | "steady" | "cooling"
  }
  computedAt: Date
}
```

**`prices`**
```
{
  stockId: ObjectId
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  ytdChange: number (%)
  athPrice: number
  atHighDistancePercent: number (%)
}
```

**`userProfiles`** (for onboarding)
```
{
  userId: string
  sectors: [string] // user's professional/interest sectors
  confidence: "beginner" | "intermediate" | "advanced"
  watchlist: [ObjectId] // stock IDs
  recentSearches: [string] // tickers
}
```

---

## API Endpoints

### Backend (`/api`)

**Stock Search & Discovery**
- `GET /api/stocks/search?q=TICKER` → Autocomplete, recent, trending in wheelhouse
- `GET /api/stocks/:ticker` → Full stock data + ratings
- `GET /api/stocks/:ticker/metrics` → Detailed metric breakdown
- `GET /api/stocks/:ticker/momentum?period=quarterly|annual&range=2y|5y|max` → Trend charts

**Onboarding**
- `POST /api/users/profile` → Save user sectors & confidence
- `GET /api/users/profile/:userId` → Retrieve user profile
- `GET /api/stocks/wheelhouse/:userId` → Filtered stocks by user sectors

**Admin/Ingestion**
- `POST /api/admin/ingest/:ticker` → Force fetch from Polygon (cache bypass)
- `GET /api/admin/cache-status` → See what's cached, last fetch time

---

## Rating Engine Logic (Backend)

The **5-pillar rating system** drives the 0-5 overall score:

1. **Growing** (Revenue & EPS trend)
   - Input: YoY %, CAGR, acceleration
   - Scoring: Strong growth + accelerating = high

2. **Profitable** (Margins & returns)
   - Input: Net margin %, ROE, ROIC
   - Scoring: >20% margins, >15% ROIC = high

3. **Fairly Priced** (Valuation)
   - Input: P/E vs sector median, PEG ratio
   - Scoring: P/E <industry avg + PEG <1.5 = favorable

4. **Safe** (Balance sheet)
   - Input: Debt/equity, current ratio, interest coverage
   - Scoring: D/E <0.5, current ratio >1.5 = safe

5. **Can Keep Winning** (Moat/sustainability)
   - Input: Market share, competitive advantages, R&D spend as % of revenue
   - Scoring: Rare moat + growing R&D = strong

**Scoring:** Each pillar gets 0-5, overall = average of 5 pillars (rounded 0.5).

---

## Frontend Components & Routes

### Pages
- **`/`** → Landing (onboarding CTA, trending stocks)
- **`/search`** → Search ticker + autocomplete + trending in wheelhouse
- **`/stock/:ticker`** → Rating detail (minimal whitespace design)
- **`/stock/:ticker/momentum`** → Trend charts (quarterly/annual toggles)
- **`/explore`** → Browse all stocks filtered by sector
- **`/watchlist`** → Saved stocks
- **`/profile`** → User settings + expertise selector

### Key Components
- **RatingCard** → 0-5 stars + overall score + summary text
- **PillarBreakdown** → 5-pillar bars (Growing, Profitable, etc.)
- **MomentumChart** → Bar/line chart with QoQ/YoY trend annotations
- **TickerAutocomplete** → Search with recent + trending sections
- **OnboardingFlow** → 4-step: Welcome → What do you do? → Confidence → Done

---

## Developer Workflows

### Local Setup
```bash
# Backend
cd backend
npm install
npm run dev          # Starts on :3001, auto-reload

# Frontend (separate terminal)
cd frontend
npm install
npm start            # Starts on :3000, React dev server
```

### Environment Variables
**`.env.local` (backend root)**
```
POLYGON_API_KEY=sk_...
FMP_API_KEY=...
MONGODB_URI=mongodb://localhost:27017/funda
NODE_ENV=development
```

### Seeding & Testing
```bash
# Seed 10 popular stocks (MELI, NVDA, PLTR, AMD, SNOW, CRWD, etc.)
npm run seed

# Test rating engine on a ticker
npm run test:rating -- MELI
```

### Common Tasks
- **Add new metric to pillars:** Update `backend/src/engine/ratingEngine.ts` + schema
- **Fetch fresh data for ticker:** `POST /api/admin/ingest/:ticker`
- **Debug a stock's calculation:** `npm run debug:stock TICKER`
- **Performance: Cache hit/miss stats** `GET /api/admin/cache-status`

---

## Polygon.io Integration Notes

- **API calls are expensive.** Always cache aggressively.
- **Rate limit:** 5 calls/min on free tier; batch requests.
- **Endpoints used:**
  - `/v1/reference/tickers/{ticker}` → Company info
  - `/v2/aggs/ticker/{ticker}/range/1/quarter` → Quarterly OHLCV
  - `/vX/reference/financials?ticker=...` → Fundamentals (EPS, revenue, margins)
- **Fallback:** If Polygon fails, show cached data; return "as of [date]" label.

---

## Key Patterns & Conventions

### Naming
- **Stock lookup:** Always normalize ticker input to UPPERCASE
- **Pillar scores:** 0-5 range, 0.5 increment (e.g., 4.3, not 4.27)
- **Time periods:** Use ISO strings (e.g., "2025-Q4", not "Q4'25") internally; format for display

### Error Handling
- API calls that fail should not break the app; fall back to last cached version
- Show user a note if data is stale (>7 days) vs fresh
- Log all Polygon failures with ticker + timestamp for debugging

### Testing
- **Unit tests:** Rating engine (each pillar's scoring logic)
- **Integration tests:** Full ticker lookup → cache → rating flow
- **E2E:** Search MELI → verify all 5 pillars render correctly

### Caching Strategy
- **MongoDB TTL index** on `lastUpdated` field: auto-expire docs after 30 days
- **In-memory cache** (Redis optional): recent lookups, current user's watchlist
- **Cache invalidation:** Manual via `/api/admin/ingest/:ticker` or automatic after 30d

---

## File Structure

```
funda/
├── backend/
│   ├── src/
│   │   ├── engine/
│   │   │   ├── ratingEngine.ts        # 5-pillar scoring logic
│   │   │   └── ratioCalculator.ts     # Financial ratios
│   │   ├── services/
│   │   │   ├── polygonService.ts      # API calls to Polygon
│   │   │   ├── cacheService.ts        # MongoDB + Redis caching
│   │   │   └── normalizerService.ts   # Unify data schemas
│   │   ├── models/
│   │   │   └── stockSchema.ts         # Mongoose schemas
│   │   ├── routes/
│   │   │   ├── stocks.ts
│   │   │   ├── users.ts
│   │   │   └── admin.ts
│   │   └── index.ts                   # Express server entry
│   ├── .env.local
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Search.tsx
│   │   │   ├── StockDetail.tsx
│   │   │   ├── Momentum.tsx
│   │   │   ├── Explore.tsx
│   │   │   ├── Watchlist.tsx
│   │   │   └── Profile.tsx
│   │   ├── components/
│   │   │   ├── RatingCard.tsx
│   │   │   ├── PillarBreakdown.tsx
│   │   │   ├── MomentumChart.tsx
│   │   │   ├── TickerAutocomplete.tsx
│   │   │   └── OnboardingFlow.tsx
│   │   ├── hooks/
│   │   │   ├── useStock.ts
│   │   │   ├── useSearch.ts
│   │   │   └── useUser.ts
│   │   ├── styles/
│   │   │   └── globals.css            # Manrope font, dark/light themes
│   │   └── App.tsx
│   ├── public/
│   └── package.json
├── .github/
│   └── copilot-instructions.md        # This file
└── README.md
```

---

## When to Call AI Agents

### Good Use Cases
- **Implement a pillar scorer:** "Add the `Safe` pillar (D/E, current ratio) to the rating engine."
- **Frontend component:** "Build PillarBreakdown showing 5 bars + labels + percentages."
- **API integration:** "Add autocomplete endpoint that returns recent + trending tickers."
- **Test data:** "Create seed file with MELI, NVDA, PLTR, SNOW financials."

### What to Provide
- Specific ticket/feature (don't say "build the app"; say "implement search autocomplete")
- Reference a design file or exact UI requirement
- If modifying engine logic, show example input data + expected output

---

## Quick Start for New Developers

1. **Understand the big picture:** Read this document + `Data Pipeline & Sources.dc.html`
2. **Set up backend:** `cd backend && npm install && npm run dev`
3. **Set up frontend:** `cd frontend && npm install && npm start`
4. **Seed test data:** `npm run seed` (backend directory)
5. **Test a stock lookup:** Search "MELI" in UI or call `GET /api/stocks/MELI`
6. **Check the rating logic:** Open `backend/src/engine/ratingEngine.ts`

---

## Questions?

- **Why MongoDB + not SQL?** Flexible schema for evolving financial data; fast iteration
- **Why cache aggressively?** Polygon charges per call; users expect snappy UX
- **How do we rank "fairly priced"?** Peer comparisons (sector median P/E, PEG) + valuation history
- **What if Polygon is down?** Show last cached data with "as of [date]" disclaimer
