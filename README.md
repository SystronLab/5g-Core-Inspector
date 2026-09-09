# 5G Core Inspector

5G Core Inspector correlates distributed Open5GS logs into UE procedures, signalling timelines and incident evidence. Its operator dashboard uses the real Kafka ingestion pipeline and refreshes automatically; it does not substitute demo fixtures.

## Architecture

```text
Open5GS Network Functions
  → RCA Log Agent
  → Kafka
  → RCA Ingester / Correlation
  → API
  → Web UI
```

OCUDU gNB and OAI UE can generate real signalling through the split Open5GS core using the existing local ZMQ configuration.

| Component | Location | Responsibility |
|---|---|---|
| Split Open5GS core | `ocudu/docker/open5gs-split/` | Core network deployment |
| Kafka | `kafka-setup/` | NF event topics and Kafka UI |
| RCA log agent | `rca-log-agent/` | Forward Docker NF logs with provenance |
| RCA ingester | `rca-ingester/` | Parse, seal, correlate and expose evidence through the API |
| Web application | `frontend/` | React/Vite operator dashboard |

The frontend has moved out of `rca-ingester/demo-ui`. It polls the backend every three seconds. Correlation and procedure reconstruction remain in Python.

The dashboard includes overview, searchable UE list, signalling timelines, registration troubleshooting, incidents and secondary normalized raw events. Registration acceptance and completion are distinct; missing evidence is not presented as a confirmed failure or invented root cause.

## Clone

The core, radio, Kafka, agent and ingester components are Git submodules.

```bash
git clone --recurse-submodules https://github.com/SystronLab/5g-Core-Inspector.git
cd 5g-Core-Inspector
```

If submodules were not initialized during cloning:

```bash
git submodule update --init --recursive
```

## Prerequisites

- Linux with Bash, `setsid`, `curl`, Docker and Docker Compose; Docker accessible to the account running the startup script.
- Python 3.10+ with virtual environment support, Node.js 20.19+ and npm.
- Existing core images (`ocudu/open5gs-split` and `mongo:6`), configured split-core files and a provisioned subscriber. Startup does not build the core or initialize subscribers.
- For the optional radio start: built OCUDU/OAI binaries, `gnb_oai.yaml`, `oaiue_zmq.conf`, and the networking/scheduling permissions required by the existing radio setup.

The [previous lab installation guide](docs/legacy-setup.md) preserves core image, subscriber and radio setup instructions. It is historical: use the commands below for Inspector, rather than its old demo UI, manual patching or fixed-secret instructions. Install npm dependencies using your normal development account.

## Start the system

From the repository root:

```bash
./scripts/start.sh
```

This starts or reuses the split core, Kafka, Kafka UI and log agent, installs backend/frontend dependencies, builds the frontend, and launches the continuous Kafka-consuming API and web server. It preserves existing subscriber data and Docker volumes. The core creates the network needed by Kafka before Kafka starts.

To also start the existing local ZMQ gNB and OAI UE:

```bash
./scripts/start.sh --with-radio
```

The script keeps already-running host processes. When starting a fresh UE after the previous UE has exited, it restarts its own gNB if necessary to recover the ZMQ connection. Successful Inspector startup confirms API/frontend readiness; check the radio logs and UE timeline separately to confirm registration.

| Component | Default endpoint |
|---|---|
| Inspector web UI | http://127.0.0.1:5173 |
| API health | http://127.0.0.1:8000/api/health |
| Kafka UI | http://localhost:8080 |
| Kafka host listener | `localhost:9094` |
| Kafka Docker listener | `kafka:9092` |
| AMF N2 | `10.53.1.2:38412/SCTP` |
| AMF / SMF metrics | `localhost:9090` / `localhost:9091` |
| ZMQ radio link | `localhost:4556` / `localhost:4557` |

### Configuration and runtime data

Copy [.env.example](.env.example) to `.env` if you want to customize ports, broker address or consumer group. The startup script loads `.env` automatically.

| Location | Contents |
|---|---|
| `.runtime/` | Host process IDs and startup/runtime logs |
| `.runtime/run-secret` | Random run secret generated once when needed |
| `rca-ingester/out/live/` | Durable sealed events and ingestion artifacts |

These runtime locations and `.env` are ignored by Git. Keep the consumer group paired with its output directory: deleting the local output does not reset Kafka's committed offsets. A fresh historical reparse needs both a new group and a new output directory.

## Stop and restart

Stop the host processes launched by the script:

```bash
./scripts/stop.sh
```

The script allows the UE to deregister before stopping the gNB, then stops the frontend and API. Core/Kafka containers and all volumes remain available.

After backend code changes, stop and start again to load the updated code:

```bash
./scripts/stop.sh
./scripts/start.sh --with-radio
```

To additionally stop the Docker services without deleting their data:

```bash
docker stop 5g-log-agent
docker compose -p kafka-setup -f kafka-setup/docker-compose.kafka.yml stop
docker compose -p open5gs-split -f ocudu/docker/open5gs-split/docker-compose.yml stop
```

## Development

Stop scripted host processes before running development servers on the same ports. Keep only one API/consumer writing to a given output directory.

Backend, after installing dependencies with the startup script:

```bash
cd rca-ingester
export S5_RUN_SECRET="$(cat ../.runtime/run-secret)"
.venv/bin/python -m s5.api --out-dir out/live
```

The API process includes the continuous Kafka consumer; a separate `main.py consume` process is not required for the dashboard.

Frontend, in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`. Override that destination with `API_TARGET` when needed. `npm run build` creates `dist/`; `npm run preview` serves the build locally with the same API proxy. See [frontend instructions](frontend/README.md).

## API

The UI polls `GET /api/snapshot` for a consistent dashboard payload. Individual endpoints are also available:

- `GET /api/health`
- `GET /api/overview`
- `GET /api/ues`
- `GET /api/ues/{url-encoded-id}`
- `GET /api/ues/{url-encoded-id}/timeline`
- `GET /api/procedures`
- `GET /api/incidents`
- `GET /api/events`

Collection endpoints support `offset` and `limit`, with a maximum page size of 1,000. See [architecture and API details](docs/architecture.md).

## Verification

Check the actual running pipeline:

```bash
curl -fsS http://127.0.0.1:8000/api/health
curl -fsS http://127.0.0.1:8000/api/overview
docker ps
docker exec 5gi-kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --group 5g-inspector-live --describe
```

Use your configured group name if it differs from the default. A health response reports the consumer, API and broker reachability; core/agent status still requires separate Docker checks.

Run backend and replay checks:

```bash
cd rca-ingester
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m tests.replay_selftest
.venv/bin/python -m compileall -q s5 main.py
```

Replay tests use isolated fixture output. They do not publish fixtures to live Kafka or serve them to the frontend. The [verification report](docs/verification.md) records the tested real registration/deregistration flow, browser checks and remaining limits.

## Current scope

This is a local operator MVP. The projection retains up to 45,000 UE/failure records plus 5,000 recent records; dashboard counts describe retained evidence. The raw view shows the latest 500 normalized records, with technical provenance rather than unredacted protocol payloads.

Some NF session events lack reliable UE associations. A PDU context is not proof of internet connectivity. Ambiguous identities and unsupported root causes remain unresolved. Larger deployments need indexed storage, stronger lifecycle handling and appropriate access controls. See [architecture and limitations](docs/architecture.md).

When contributing, commit backend changes inside the `rca-ingester` submodule and record its updated revision in the parent repository alongside frontend/orchestration changes. Preserve unrelated local core/radio configuration and runtime data.
