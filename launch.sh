#!/bin/bash
# ============================================================
#  🌍 Rebalance Global Observatory — Launch Script
#  Dashboard Project
#  Usage: bash launch.sh         (start & open browser)
#         bash launch.sh stop    (stop all services)
# ============================================================

BACKEND_PORT=8001
FRONTEND_PORT=3000
BACKEND_DIR="$(cd "$(dirname "$0")/backend" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✅ $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${RESET}"; }
err()  { echo -e "  ${RED}❌ $1${RESET}"; }

port_alive() { lsof -ti :"$1" > /dev/null 2>&1; }
http_ok()    { curl -sf --max-time 2 "$1" > /dev/null 2>&1; }

# ── Stop command ────────────────────────────────────────────
if [ "$1" = "stop" ]; then
  echo -e "\n${BOLD}${CYAN}  🌍 Stopping Rebalance Global Observatory${RESET}\n"
  kill $(lsof -ti :$BACKEND_PORT) 2>/dev/null && ok "Backend stopped" || warn "Backend wasn't running"
  kill $(lsof -ti :$FRONTEND_PORT) 2>/dev/null && ok "Frontend stopped" || warn "Frontend wasn't running"
  echo ""
  exit 0
fi

# ── Start ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}  🌍 Rebalance Global Observatory${RESET}"
echo -e "  ─────────────────────────────────────"
echo ""

# 1. Backend
if http_ok "http://localhost:$BACKEND_PORT/api/health"; then
  ok "Backend already healthy on :$BACKEND_PORT"
else
  # Kill zombie if port is occupied but unhealthy
  port_alive $BACKEND_PORT && kill $(lsof -ti :$BACKEND_PORT) 2>/dev/null && sleep 1

  PYTHON="${VENV_DIR}/bin/python3"
  [ -f "$PYTHON" ] || PYTHON="python3"
  echo -e "  Starting backend..."
  (cd "$BACKEND_DIR" && nohup "$PYTHON" -m uvicorn server:app \
    --host 0.0.0.0 --port $BACKEND_PORT --log-level warning \
    > /tmp/rebalance_backend.log 2>&1) &

  for i in $(seq 1 30); do
    http_ok "http://localhost:$BACKEND_PORT/api/health" && break
    sleep 1
  done
  http_ok "http://localhost:$BACKEND_PORT/api/health" && ok "Backend started on :$BACKEND_PORT" || err "Backend failed to start"
fi

# 2. Frontend
if http_ok "http://localhost:$FRONTEND_PORT"; then
  ok "Frontend already running on :$FRONTEND_PORT"
else
  # Kill zombie if port is occupied but unhealthy
  port_alive $FRONTEND_PORT && kill $(lsof -ti :$FRONTEND_PORT) 2>/dev/null && sleep 1

  echo "REACT_APP_BACKEND_URL=http://localhost:$BACKEND_PORT" > "$FRONTEND_DIR/.env"
  echo -e "  Starting frontend (first compile ~20s, instant after)..."
  (cd "$FRONTEND_DIR" && BROWSER=none nohup yarn start > /tmp/rebalance_frontend.log 2>&1) &

  for i in $(seq 1 90); do
    http_ok "http://localhost:$FRONTEND_PORT" && break
    sleep 1
  done
  http_ok "http://localhost:$FRONTEND_PORT" && ok "Frontend ready on :$FRONTEND_PORT (${i}s)" || err "Frontend failed to start — check /tmp/rebalance_frontend.log"
fi

# 3. Open browser
sleep 0.5
open "http://localhost:$FRONTEND_PORT"
ok "Browser opened"

echo ""
echo -e "  ${BOLD}${GREEN}🚀 Live!${RESET}"
echo -e "  Frontend:  ${BOLD}http://localhost:$FRONTEND_PORT${RESET}"
echo -e "  Backend:   ${BOLD}http://localhost:$BACKEND_PORT/api${RESET}"
echo -e "  API Docs:  ${BOLD}http://localhost:$BACKEND_PORT/docs${RESET}"
echo -e "  Stop:      ${BOLD}bash launch.sh stop${RESET}"
echo ""
