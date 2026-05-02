#!/bin/bash

echo "Starting Maventee Inventory App..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Get local IP ──────────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "unknown")
else
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

# ── Start FastAPI backend (0.0.0.0 = accessible on local network) ────────────
echo "Starting backend..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 3

# ── Start React frontend (0.0.0.0 = accessible on local network) ─────────────
echo "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

sleep 4

# ── Open browser ──────────────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:5173
else
    xdg-open http://localhost:5173
fi

echo ""
echo "✅ App is running!"
echo ""
echo "Office computer:    http://localhost:5173"
echo "Warehouse laptop:   http://$LOCAL_IP:5173"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""

trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
