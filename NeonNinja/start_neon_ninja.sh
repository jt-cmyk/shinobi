#!/usr/bin/env bash

# Simple helper to serve the Neon Ninja game locally.
# Usage:
#   ./start_neon_ninja.sh        # serves on http://127.0.0.1:8000
#   ./start_neon_ninja.sh 9000   # serves on http://127.0.0.1:9000

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${1:-8000}"
HOST="127.0.0.1"
URL="http://$HOST:$PORT"

echo "Serving Neon Ninja at $URL"
echo "Press Ctrl+C to stop."

exec python3 -m http.server "$PORT" --bind "$HOST"
