#!/bin/sh
# Runs the score service (loopback only, nginx proxies /api to it) and nginx; exits when either dies so Docker restarts the container.

NODE_CMD=${NODE_CMD:-"node /score-service/index.js"}
NGINX_CMD=${NGINX_CMD:-"nginx -g 'daemon off;'"}

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3002}"

shutdown() {
  kill -TERM "$NODE_PID" "$NGINX_PID" 2>/dev/null
  wait
  exit "${1:-0}"
}
trap 'shutdown 0' TERM INT

(cd /score-service 2>/dev/null || true; eval "exec $NODE_CMD") &
NODE_PID=$!
eval "exec $NGINX_CMD" &
NGINX_PID=$!

while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

echo "start.sh: a process exited (node alive: $(kill -0 "$NODE_PID" 2>/dev/null && echo yes || echo no)); stopping container" >&2
shutdown 1
