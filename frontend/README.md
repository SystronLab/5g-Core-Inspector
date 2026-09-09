# 5G Core Inspector web application

Independent React/Vite frontend, migrated from `rca-ingester/demo-ui`. The only
production data source is the live RCA API. There is no fixture fallback.

```bash
npm ci
npm run dev
```

Default URL: http://127.0.0.1:5173. `/api` is proxied to port 8000; override with
`API_TARGET=http://127.0.0.1:8001 npm run dev`.

`npm run build` produces `dist/`; `npm run preview` serves that build locally
with the same API proxy. Root `scripts/start.sh` performs both steps and starts
the real Kafka-consuming backend. See the root README for full orchestration.

The application polls `/api/snapshot` every three seconds. UE states, signalling
stages, procedure outcomes, identifiers and incident classifications are produced
by the backend. The UI provides navigation, search and expandable evidence only.
