# 📁 Funda Project - Complete File Structure

```
/Users/rotemziv/Documents/Funda/
│
├── 📄 README.md                              ← Start here! Project overview & setup
├── 📄 SETUP_COMPLETE.md                      ← What's been created & next steps
├── 📄 PROJECT_SUMMARY.md                     ← Detailed breakdown of scaffolding
├── 📄 dev-commands.sh                        ← Quick reference for common commands
├── 📄 .gitignore                             ← Git ignore rules
│
├── 🎨 Design Files (from Claude)
│   ├── Data Pipeline & Sources.dc.html       ← Architecture diagram
│   ├── Onboarding - Know You.dc.html         ← Onboarding UI mockup
│   ├── Search Ticker - Flow.dc.html          ← Search UI mockup
│   ├── Rating Detail - Minimal.dc.html       ← Rating card (3 options)
│   └── Momentum - Trends.dc.html             ← Trend charts mockup
│
├── 📁 .github/
│   └── 🤖 copilot-instructions.md            ← AI agent guidelines (COMPREHENSIVE!)
│
├── 📁 backend/                               ← Node.js + Express API
│   │
│   ├── 📄 package.json                       ✅ Dependencies configured
│   ├── 📄 tsconfig.json                      ✅ TypeScript config
│   ├── 📄 .env.local                         ✅ Environment template
│   │
│   └── 📁 src/
│       │
│       ├── 📄 index.ts                       ✅ Express server (ready to start)
│       │   └─ Includes: CORS, JSON parser, health endpoint
│       │
│       ├── 📁 engine/
│       │   ├── 📄 ratingEngine.ts            ✅ COMPLETE - 5-pillar scoring
│       │   │   └─ scoreGrowing(), scoreProfitable(), etc.
│       │   └── 📄 ratioCalculator.ts         📝 Ready to implement
│       │
│       ├── 📁 services/
│       │   ├── 📄 polygonService.ts          📝 Polygon.io API calls
│       │   ├── 📄 cacheService.ts            📝 MongoDB operations
│       │   └── 📄 normalizerService.ts       📝 Data standardization
│       │
│       ├── 📁 models/
│       │   └── 📄 stockSchema.ts             ✅ COMPLETE - DB schemas
│       │       └─ IStock, IFundamentals, IMetrics, IPrice, IUserProfile
│       │
│       └── 📁 routes/
│           ├── 📄 stocks.ts                  📝 Ready: /api/stocks/*
│           ├── 📄 users.ts                   📝 Ready: /api/users/*
│           └── 📄 admin.ts                   📝 Ready: /api/admin/*
│
├── 📁 frontend/                              ← React + Vite
│   │
│   ├── 📄 package.json                       ✅ Dependencies configured
│   ├── 📄 tsconfig.json                      ✅ TypeScript config
│   ├── 📄 vite.config.ts                     ✅ Vite configured (with API proxy)
│   ├── 📄 .env.local                         ✅ Environment template
│   ├── 📄 index.html                         ✅ HTML entry point
│   │
│   └── 📁 src/
│       │
│       ├── 📄 main.tsx                       ✅ React entry point
│       ├── 📄 App.tsx                        ✅ Main component (hero + search box)
│       ├── 📄 globals.css                    ✅ Styling (Manrope, dark/light themes)
│       │
│       ├── 📁 pages/                         📝 Ready to implement
│       │   ├── 📄 Search.tsx                 ← Main search interface
│       │   ├── 📄 StockDetail.tsx            ← Rating card + 5 pillars
│       │   ├── 📄 Momentum.tsx               ← Trend charts
│       │   ├── 📄 Explore.tsx                ← Browse by sector
│       │   ├── 📄 Watchlist.tsx              ← Saved stocks
│       │   └── 📄 Profile.tsx                ← User settings
│       │
│       ├── 📁 components/                    📝 Ready to implement
│       │   ├── 📄 RatingCard.tsx             ← 0-5 star rating display
│       │   ├── 📄 PillarBreakdown.tsx        ← 5 pillar bars + scores
│       │   ├── 📄 MomentumChart.tsx          ← QoQ/YoY trend visualization
│       │   ├── 📄 TickerAutocomplete.tsx     ← Search with recent/trending
│       │   └── 📄 OnboardingFlow.tsx         ← 4-step onboarding
│       │
│       └── 📁 hooks/                         📝 Ready to implement
│           ├── 📄 useStock.ts                ← Stock API hook
│           ├── 📄 useSearch.ts               ← Search logic
│           └── 📄 useUser.ts                 ← User profile hook
│
└── (MongoDB data stored locally - no files)
```

---

## 🟢 Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete & ready to use |
| 📝 | Scaffolded, ready for implementation |
| 🤖 | AI/Agent guidelines |
| 📄 | File |
| 📁 | Directory |

---

## 🎯 What's Complete

### Backend
- ✅ Express server setup
- ✅ TypeScript configuration
- ✅ Rating engine (fully functional)
- ✅ Database schemas (TypeScript interfaces)
- ✅ Environment setup

### Frontend
- ✅ React + Vite setup
- ✅ TypeScript configuration
- ✅ Global styles (Manrope font, theming)
- ✅ Main App component structure
- ✅ HTML entry point

### Documentation
- ✅ Comprehensive AI guidelines (250+ lines)
- ✅ Project README with FAQ
- ✅ Setup guide
- ✅ Development commands reference

---

## 📊 Implementation Checklist

### Phase 1: Backend Core
- [ ] Implement `POST /api/stocks/search` endpoint
- [ ] Implement `GET /api/stocks/:ticker` endpoint
- [ ] Connect to MongoDB (cacheService)
- [ ] Wire up Polygon.io integration (polygonService)
- [ ] Test with seed data

### Phase 2: Frontend Core
- [ ] Build `TickerAutocomplete` component
- [ ] Build `RatingCard` component
- [ ] Build `Search` page
- [ ] Wire up to backend API
- [ ] Test search flow end-to-end

### Phase 3: Details
- [ ] Build `PillarBreakdown` component
- [ ] Build `StockDetail` page
- [ ] Build `MomentumChart` component
- [ ] Implement onboarding flow
- [ ] Add watchlist functionality

### Phase 4: Polish
- [ ] Add error handling & loading states
- [ ] Implement caching strategy
- [ ] Add unit tests
- [ ] Performance optimization
- [ ] Deploy setup

---

## 🔧 How to Use This Structure

### To Add a New API Endpoint
1. Edit `backend/src/routes/stocks.ts` (or appropriate file)
2. Import needed services (polygonService, cacheService)
3. Define route handler
4. Export in `backend/src/index.ts`

### To Add a New React Component
1. Create file in `frontend/src/components/`
2. Export React component
3. Import in parent component or page
4. Add styles to `globals.css` if needed

### To Add a New Service
1. Create file in `backend/src/services/`
2. Export functions/classes
3. Import in route handlers

### To Connect Frontend to Backend
1. Use `fetch()` or `axios` in hook (e.g., `useStock.ts`)
2. Call backend endpoint (e.g., `http://localhost:3001/api/stocks/MELI`)
3. Return data for component to render

---

## 🚀 Next Immediate Steps

```bash
# 1. Install dependencies
cd /Users/rotemziv/Documents/Funda/backend && npm install
cd /Users/rotemziv/Documents/Funda/frontend && npm install

# 2. Add your API keys to backend/.env.local
POLYGON_API_KEY=sk_...
FMP_API_KEY=...

# 3. Start MongoDB (in separate terminal)
mongod

# 4. Start backend (in separate terminal)
cd backend && npm run dev

# 5. Start frontend (in another terminal)
cd frontend && npm run dev

# 6. Open browser to http://localhost:5173
```

---

## 💡 Key Files to Know

| File | Purpose | Learn By |
|------|---------|----------|
| `.github/copilot-instructions.md` | AI agent guidelines | Read fully once |
| `backend/src/engine/ratingEngine.ts` | Scoring logic | Study the functions |
| `backend/src/models/stockSchema.ts` | Data structure | Reference when coding |
| `frontend/src/globals.css` | Styling variables | Use for consistent design |
| `frontend/src/App.tsx` | Main component | Start here for React |

---

## 📞 Getting Help

**For architecture questions**: Read `.github/copilot-instructions.md`
**For file locations**: Use this directory structure
**For specific patterns**: Look at existing code (ratingEngine.ts, stockSchema.ts)
**For React help**: Ask AI with reference to this project's structure
**For API design**: Check your Claude design mockups

---

**You're all set! 🚀 Start with Step 1 above and build amazing things.**
