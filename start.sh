#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# SpinQMS — start.sh
# Launches the FastAPI backend and Vite React frontend together.
# ─────────────────────────────────────────────────────────────────

set -e
REPO="$(cd "$(dirname "$0")" && pwd)"
VENV="$REPO/.venv"

# ── 1. Python virtual-env ────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  echo "🐍  Creating Python virtual environment…"
  python3 -m venv "$VENV"
fi

echo "📦  Verifying Python deps…"
"$VENV/bin/pip" install --quiet -r "$REPO/backend/requirements.txt"

# ── 2. Node deps ─────────────────────────────────────────────────
cd "$REPO/frontend"
if [ ! -d node_modules ]; then
  echo "📦  Installing npm packages…"
  npm install
fi

# ── 3. Cleanup on exit ───────────────────────────────────────────
cleanup() {
  echo ""
  echo "⏹  Stopping servers…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 4. Run Alembic migrations ─────────────────────────────────────
echo ""
echo "🗄   Running database migrations…"
cd "$REPO/backend"
"$VENV/bin/alembic" upgrade head
echo "    ✓ Schema at head"

# ── 5. Start backend ─────────────────────────────────────────────
echo ""
echo "🚀  Starting FastAPI backend  → http://localhost:8000"
echo "    API docs                  → http://localhost:8000/docs"
"$VENV/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

sleep 1

# ── 6. Start frontend ────────────────────────────────────────────
echo "🚀  Starting React frontend   → http://localhost:5173"
cd "$REPO/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SpinQMS is running."
echo "  Open in browser: http://localhost:5173"
echo "  Press Ctrl+C to stop."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wait
