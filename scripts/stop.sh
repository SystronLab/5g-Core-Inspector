#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# Stop only host processes launched by start.sh. Core, Kafka and volumes remain.
for name in ue gnb frontend api; do
  file="$ROOT_DIR/.runtime/$name.pid"
  if [[ -f "$file" ]]; then
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      if [[ "$name" == ue ]]; then kill -INT "$pid"; else kill -TERM "$pid"; fi
      for ((i=0;i<50;i++)); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      if kill -0 "$pid" 2>/dev/null; then echo "$name is still stopping; its PID file has been preserved." >&2; exit 1; fi
    fi
    rm -f "$file"
  fi
done
