#!/bin/bash
# Funda Development Quick Reference
# Copy commands from here or use ./dev-commands.sh

# ==================== SETUP ====================
echo "Installing backend dependencies..."
cd backend && npm install

echo "Installing frontend dependencies..."
cd ../frontend && npm install

echo "Setup complete! ✅"


# ==================== START DEVELOPMENT ====================

# Terminal 1: Backend API
echo "Starting backend on http://localhost:3001"
cd backend && npm run dev

# Terminal 2: Frontend UI  
echo "Starting frontend on http://localhost:5173"
cd frontend && npm run dev

# Terminal 3 (if needed): MongoDB
echo "Starting MongoDB on mongodb://localhost:27017"
mongod


# ==================== TESTING & DEBUGGING ====================

# Test the rating engine
cd backend && npm run test:rating -- MELI

# Seed test data (MELI, NVDA, PLTR, AMD, SNOW, CRWD)
cd backend && npm run seed

# Debug a stock's calculation
cd backend && npm run debug:stock MELI

# Run all tests
cd backend && npm test
cd frontend && npm run lint


# ==================== BUILD FOR PRODUCTION ====================

# Build frontend
cd frontend && npm run build

# Build backend
cd backend && npm run build


# ==================== COMMON API CALLS ====================

# Search stocks
curl http://localhost:3001/api/stocks/search?q=MEL

# Get stock detail + rating
curl http://localhost:3001/api/stocks/MELI

# Get momentum/trends
curl "http://localhost:3001/api/stocks/MELI/momentum?period=quarterly&range=5y"

# Force refresh cache
curl -X POST http://localhost:3001/api/admin/ingest/MELI

# Check cache status
curl http://localhost:3001/api/admin/cache-status

# Health check
curl http://localhost:3001/health


# ==================== FILE EDITING ====================

# Key backend files to modify
# - backend/src/engine/ratingEngine.ts      (5-pillar scoring logic)
# - backend/src/routes/stocks.ts            (API endpoints)
# - backend/src/services/polygonService.ts  (Polygon.io integration)
# - backend/src/services/cacheService.ts    (MongoDB operations)

# Key frontend files to modify
# - frontend/src/App.tsx                    (Router + main layout)
# - frontend/src/pages/Search.tsx           (Search page)
# - frontend/src/components/RatingCard.tsx  (Rating display)
# - frontend/src/components/PillarBreakdown.tsx (5-pillar chart)

# CSS/Styling
# - frontend/src/globals.css                (Global styles, variables)


# ==================== GIT WORKFLOW ====================

# Initialize git repo
cd /Users/rotemziv/Documents/Funda
git init

# Add all files
git add .

# First commit
git commit -m "Initial Funda setup - TypeScript, React, Node.js, MongoDB"

# View recent commits
git log --oneline


# ==================== ENVIRONMENT SETUP ====================

# Backend .env.local should have:
# POLYGON_API_KEY=sk_... (get from polygon.io)
# FMP_API_KEY=... (get from financialmodellingprep.com)
# MONGODB_URI=mongodb://localhost:27017/funda
# NODE_ENV=development
# PORT=3001

# Frontend .env.local should have:
# VITE_API_URL=http://localhost:3001/api


# ==================== USEFUL DOCS ====================

# Read these first:
# 1. .github/copilot-instructions.md  (AI agent guidelines)
# 2. README.md                         (Project overview)
# 3. SETUP_COMPLETE.md                (Setup details)

# Then reference:
# - Design files (HTML) in root directory
# - backend/src/models/stockSchema.ts (data structure)
# - backend/src/engine/ratingEngine.ts (scoring logic)
