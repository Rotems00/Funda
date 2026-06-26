#!/usr/bin/env bash
# Funda Setup Verification Checklist
# Run this after npm install to verify everything is ready

echo "🔍 Funda Project Setup Verification"
echo "===================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✅${NC} $1"
  else
    echo -e "${RED}❌${NC} $1"
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✅${NC} $1/"
  else
    echo -e "${RED}❌${NC} $1/"
  fi
}

echo "📁 Directory Structure"
check_dir "backend"
check_dir "frontend"
check_dir ".github"

echo ""
echo "📄 Configuration Files"
check_file "backend/package.json"
check_file "backend/tsconfig.json"
check_file "backend/.env.local"
check_file "frontend/package.json"
check_file "frontend/tsconfig.json"
check_file "frontend/.env.local"
check_file "frontend/vite.config.ts"

echo ""
echo "🔧 Backend Source Files"
check_file "backend/src/index.ts"
check_file "backend/src/engine/ratingEngine.ts"
check_file "backend/src/models/stockSchema.ts"

echo ""
echo "⚛️  Frontend Source Files"
check_file "frontend/src/App.tsx"
check_file "frontend/src/main.tsx"
check_file "frontend/src/globals.css"
check_file "frontend/index.html"

echo ""
echo "📚 Documentation"
check_file ".github/copilot-instructions.md"
check_file "README.md"
check_file "SETUP_COMPLETE.md"
check_file "PROJECT_SUMMARY.md"
check_file "DIRECTORY_STRUCTURE.md"
check_file "START_HERE.md"

echo ""
echo "✅ Scaffolding Complete!"
echo ""
echo "🚀 Next Steps:"
echo "  1. npm install (in both backend and frontend)"
echo "  2. Add API keys to backend/.env.local"
echo "  3. Start MongoDB: mongod"
echo "  4. npm run dev (in backend)"
echo "  5. npm run dev (in frontend)"
echo ""
echo "📖 Read START_HERE.md for details!"
