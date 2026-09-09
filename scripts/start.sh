#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
mkdir -p .runtime
chmod 700 .runtime
for tool in docker python3 npm curl setsid; do command -v "$tool" >/dev/null || { echo "Missing required command: $tool" >&2; exit 1; }; done
docker info >/dev/null
# Preserve the existing core project and subscriber volume. No down/reset/init.
docker compose -p open5gs-split -f ocudu/docker/open5gs-split/docker-compose.yml up -d --no-build --pull never mongodb nrf scp udr udm ausf pcf nssf bsf amf upf smf
docker compose -p kafka-setup -f kafka-setup/docker-compose.kafka.yml up -d
for ((i=0;i<60;i++)); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' 5gi-kafka)" == healthy ]]; then break; fi
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' 5gi-kafka)" == healthy ]] || { echo 'Kafka did not become healthy'; exit 1; }
docker exec 5gi-kafka /bin/bash /scripts/create-topics.sh
if docker inspect 5g-log-agent >/dev/null 2>&1; then
  docker start 5g-log-agent >/dev/null
else
  docker compose -f compose.inspector.yml up -d --build
fi
[[ -x rca-ingester/.venv/bin/python ]] || python3 -m venv rca-ingester/.venv
rca-ingester/.venv/bin/python -m pip install -q -r rca-ingester/requirements.txt
if [[ ! -f .runtime/run-secret ]]; then
  (umask 077; python3 -c 'import secrets; print(secrets.token_hex(32))' > .runtime/run-secret)
fi
export S5_RUN_SECRET="${S5_RUN_SECRET:-$(cat .runtime/run-secret)}"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export API_TARGET="http://127.0.0.1:$API_PORT"
start_process() {
  local name="$1"; shift
  if [[ -f "$ROOT_DIR/.runtime/$name.pid" ]] && kill -0 "$(cat "$ROOT_DIR/.runtime/$name.pid")" 2>/dev/null; then
    echo "$name already running"
    return
  fi
  setsid nohup "$@" > "$ROOT_DIR/.runtime/$name.log" 2>&1 < /dev/null &
  echo "$!" > "$ROOT_DIR/.runtime/$name.pid"
}
cd "$ROOT_DIR/rca-ingester"
start_process api .venv/bin/python -m s5.api --port "$API_PORT" --brokers "${KAFKA_BROKERS:-localhost:9094}" --group-id "${KAFKA_GROUP_ID:-5g-inspector-live}"
cd "$ROOT_DIR/frontend"
npm ci --no-audit --no-fund
npm run build
start_process frontend node node_modules/vite/bin/vite.js preview --port "$FRONTEND_PORT"
cd "$ROOT_DIR"
if [[ "${1:-}" == --with-radio ]]; then
  # ZMQ peers can remain blocked after the UE exits. Restart our own gNB when
  # starting a fresh UE, without touching independently launched radio processes.
  if { [[ ! -f "$ROOT_DIR/.runtime/ue.pid" ]] || ! kill -0 "$(cat "$ROOT_DIR/.runtime/ue.pid")" 2>/dev/null; } && [[ -f "$ROOT_DIR/.runtime/gnb.pid" ]]; then
    gnb_pid="$(cat "$ROOT_DIR/.runtime/gnb.pid")"
    if kill -0 "$gnb_pid" 2>/dev/null; then
      kill -TERM "$gnb_pid"
      for ((i=0;i<50;i++)); do
        kill -0 "$gnb_pid" 2>/dev/null || break
        sleep 0.2
      done
      if kill -0 "$gnb_pid" 2>/dev/null; then echo 'Previous gNB is still stopping; retry shortly.' >&2; exit 1; fi
    fi
    rm -f "$ROOT_DIR/.runtime/gnb.pid"
  fi
  cd "$ROOT_DIR/ocudu/build/apps/gnb"
  start_process gnb ./gnb -c gnb_oai.yaml
  cd "$ROOT_DIR/openairinterface5g/cmake_targets/ran_build/build"
  start_process ue env LD_LIBRARY_PATH="$PWD" ./nr-uesoftmodem -O ./oaiue_zmq.conf
fi
for ((i=0;i<30;i++)); do
  if curl -fsS "$API_TARGET/api/health" > "$ROOT_DIR/.runtime/health.json" && python3 -c 'import json,sys; sys.exit(json.load(open(sys.argv[1]))["status"] != "ok")' "$ROOT_DIR/.runtime/health.json" && curl -fsS "http://127.0.0.1:$FRONTEND_PORT/" >/dev/null; then
    printf '\nInspector: http://127.0.0.1:%s\nAPI: %s/api/health\nKafka UI: http://localhost:8080\n' "$FRONTEND_PORT" "$API_TARGET"
    exit 0
  fi
  sleep 1
done
echo "Startup failed; inspect $ROOT_DIR/.runtime/*.log" >&2
exit 1
