import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Network,
  RadioTower,
  Users,
  XCircle,
  Clock3,
} from "lucide-react";
import Metric from "./Metric";
import "./styles.css";

const tabs = [
  "Overview",
  "UE list",
  "Registration troubleshooting",
  "Incidents",
  "Raw events",
];
const human = (value) => String(value ?? "Unknown").replaceAll("_", " ");
const time = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "UTC",
        hour12: false,
      })
    : "Not observed";
function Status({ value }) {
  return <span className={`pill ${value}`}>{human(value)}</span>;
}
function Empty({ children }) {
  return <div className="empty-state">{children}</div>;
}
function Technical({ event }) {
  return (
    <details>
      <summary>Identifiers & technical evidence</summary>
      <pre>
        {JSON.stringify(
          {
            identity: event.identity,
            session: event.session,
            error: event.error,
            nas: event.nas,
            sbi: event.sbi,
            provenance: event.source,
            evidence_hash: event.id,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}
function UEList({ rows, search, setSearch, openUE }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Observed UEs</h2>
        <input
          aria-label="Search UE identifiers"
          placeholder="Search SUPI, SUCI, GUTI or UE ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SUPI / strongest identity</th>
              <th>Registration</th>
              <th>PDU session</th>
              <th>Latest attempt</th>
              <th>Latest event</th>
              <th>Last seen · UTC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <button className="link" onClick={() => openUE(u.id)}>
                    {u.supi || u.id}
                  </button>
                  {!u.supi && (
                    <small>Temporary identity · SUPI unresolved</small>
                  )}
                </td>
                <td>
                  <Status value={u.registration_state} />
                </td>
                <td>
                  <Status value={u.session_state} />
                </td>
                <td>
                  <Status value={u.latest_procedure} />
                </td>
                <td>{u.latest_event}</td>
                <td>{time(u.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty>
          No UE evidence received yet. Start a UE registration through the core
          to populate this view.
        </Empty>
      )}
    </section>
  );
}
function Procedures({ items, openUE }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Registration attempts</h2>
        <span>{items.length} observed</span>
      </div>
      {!items.length && (
        <Empty>No registration attempts in the retained evidence.</Empty>
      )}
      <div className="procedure-grid">
        {items
          .slice()
          .reverse()
          .map((p) => (
            <article className="procedure" key={p.id}>
              <div className="panel-header">
                <button className="link" onClick={() => openUE(p.ue_id)}>
                  {p.ue_id}
                </button>
                <Status value={p.outcome} />
              </div>
              <small>{time(p.started)} UTC</small>
              <dl>
                <dt>Last successful stage</dt>
                <dd>{p.last_successful_stage || "Not observed"}</dd>
                <dt>Stopped at</dt>
                <dd>
                  {p.stopped_at ||
                    (p.outcome === "success"
                      ? "Completed"
                      : "Completion not yet observed")}
                </dd>
                <dt>Network function</dt>
                <dd>{p.nf?.toUpperCase()}</dd>
                <dt>Reported cause</dt>
                <dd>{p.cause || "No failure cause reported"}</dd>
              </dl>
            </article>
          ))}
      </div>
    </section>
  );
}
function Incidents({ items, openUE }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Incident evidence</h2>
        <span>{items.length} observations</span>
      </div>
      {!items.length && (
        <Empty>
          No failure or repeated-attempt evidence in the retained events.
        </Empty>
      )}
      {items.map((i) => (
        <article className="incident" key={i.id}>
          <AlertTriangle size={19} />
          <div>
            <h3>{i.title}</h3>
            <p>{i.cause}</p>
            <small>
              {i.nf?.toUpperCase()} · {time(i.time)} UTC · {i.evidence.length}{" "}
              evidence records
            </small>
            {i.root_cause && (
              <p className="rule">
                Rule classification: {human(i.root_cause.domain)} ·{" "}
                {i.root_cause.reason}
              </p>
            )}
            {!i.root_cause && <p className="muted">Root cause undetermined</p>}
            {i.ue_id ? (
              <button className="link" onClick={() => openUE(i.ue_id)}>
                Open UE timeline → {i.ue_id}
              </button>
            ) : (
              <span className="muted">
                No UE association in source evidence
              </span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function App() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState("Overview"),
    [selected, setSelected] = useState(null),
    [search, setSearch] = useState("");
  useEffect(() => {
    let cancelled = false,
      timer;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/snapshot", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!response.ok)
          throw new Error(`API returned HTTP ${response.status}`);
        const result = await response.json();
        if (!cancelled) {
          setData(result);
          setError("");
          setUpdated(new Date());
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
      if (!cancelled) timer = setTimeout(refresh, 3000);
    }
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  const openUE = (id) => {
    setSelected(id);
    setTab("UE timeline");
  };
  const ue = data?.ues.find((u) => u.id === selected);
  const rows =
    data?.ues.filter(
      (u) =>
        JSON.stringify(u.identifiers)
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        u.id.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <RadioTower />
          <div>
            5G CORE<strong>INSPECTOR</strong>
          </div>
        </div>
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {tabs.map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          {selected && (
            <button
              className={tab === "UE timeline" ? "active" : ""}
              onClick={() => setTab("UE timeline")}
            >
              UE timeline
            </button>
          )}
        </nav>
        <div className="sidebar-note">
          Architecture 1<br />
          NF → Agent → Kafka
          <br />→ RCA → API → UI
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">NETWORK OPERATIONS / LIVE EVIDENCE</p>
            <h1>{tab}</h1>
            <p className="muted">
              UE procedures, signalling sequences and evidence-backed
              troubleshooting
            </p>
          </div>
          <div className="live">
            <Activity size={16} />
            {error
              ? "Connection lost"
              : data?.health.status === "ok"
                ? "Live pipeline"
                : "Pipeline degraded"}
            <small>
              {updated
                ? `Updated ${updated.toLocaleTimeString()}`
                : "Connecting…"}{" "}
              · refresh 3s
            </small>
          </div>
        </header>
        {error && (
          <div role="alert" className="banner">
            API unavailable: {error}.{" "}
            {data
              ? "Showing the last received snapshot; data may be stale."
              : "Waiting for the live backend. No demo data is used."}
          </div>
        )}
        {data?.health.status === "degraded" && (
          <div role="alert" className="banner">
            Pipeline degraded:{" "}
            {data.health.error ||
              data.health.projection_error ||
              `Consumer ${data.health.consumer}; Kafka ${data.health.kafka_tcp}`}
          </div>
        )}
        {!data && <Empty>Connecting to the RCA correlation API…</Empty>}
        {data && (
          <>
            <div className="scope">
              Retaining up to{" "}
              {data.health.retained_event_limit.toLocaleString()} UE / failure
              and recent raw records. Counts describe retained evidence. All
              event times are UTC.
            </div>
            {tab === "Overview" && (
              <>
                <section className="metrics-grid">
                  {[
                    [Users, "Observed UEs", "observed_ues"],
                    [Activity, "Registered UEs", "active_ues"],
                    [
                      CheckCircle2,
                      "Successful registrations",
                      "successful_registrations",
                    ],
                    [XCircle, "Failed registrations", "failed_registrations"],
                    [Network, "Active PDU sessions", "active_pdu_sessions"],
                    [AlertTriangle, "Incident observations", "incidents"],
                  ].map(([icon, label, key]) => (
                    <Metric
                      key={key}
                      icon={icon}
                      label={label}
                      value={data.summary[key]}
                      tone={key.includes("failed") ? "red" : "neutral"}
                    />
                  ))}
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Pipeline status</h2>
                    <span>
                      {data.summary.events.toLocaleString()} normalized events
                    </span>
                  </div>
                  <div className="pipeline">
                    {[
                      ["5G Core", data.health.core],
                      ["Log agent", data.health.log_agent],
                      ["Kafka TCP", data.health.kafka_tcp],
                      ["RCA consumer", data.health.consumer],
                      ["API", data.health.api],
                    ].map(([name, status]) => (
                      <div key={name}>
                        <strong>{name}</strong>
                        <Status value={status} />
                      </div>
                    ))}
                  </div>
                  <p className="muted">
                    Last durable ingestion:{" "}
                    {data.health.last_ingested_at
                      ? time(data.health.last_ingested_at * 1000)
                      : "No data"}{" "}
                    UTC. Reachability does not prove that every NF is producing
                    logs.
                  </p>
                </section>
                <UEList
                  rows={rows}
                  search={search}
                  setSearch={setSearch}
                  openUE={openUE}
                />
              </>
            )}
            {tab === "UE list" && (
              <UEList
                rows={rows}
                search={search}
                setSearch={setSearch}
                openUE={openUE}
              />
            )}
            {tab === "Registration troubleshooting" && (
              <Procedures openUE={openUE} items={data.procedures} />
            )}
            {tab === "Incidents" && (
              <Incidents openUE={openUE} items={data.incidents} />
            )}
            {tab === "UE timeline" &&
              (ue ? (
                <>
                  <section className="panel ue-heading">
                    <div>
                      <p className="eyebrow">UE SIGNALLING JOURNEY</p>
                      <h2>{ue.supi || ue.id}</h2>
                      <small>Last seen {time(ue.last_seen)} UTC</small>
                    </div>
                    <Status value={ue.registration_state} />
                    <Status value={ue.session_state} />
                  </section>
                  <div className="detail-grid">
                    <section className="panel">
                      <div className="panel-header">
                        <h2>Correlated timeline</h2>
                        <span>{ue.timeline.length} events</span>
                      </div>
                      <p className="muted">
                        Only observed stages are shown. Gaps in logging do not
                        establish a failure. A PDU context alone does not prove
                        internet connectivity.
                      </p>
                      <label className="evidence-toggle">
                        <input
                          type="checkbox"
                          checked={showAll}
                          onChange={(e) => setShowAll(e.target.checked)}
                        />{" "}
                        Show all correlated technical events
                      </label>
                      <div className="timeline">
                        {ue.timeline
                          .filter((e) => showAll || e.is_procedure_stage)
                          .map((e) => (
                            <div
                              className={`timeline-row ${e.outcome === "failure" ? "failure" : ""}`}
                              key={e.id}
                            >
                              <div className="timeline-dot">
                                {e.outcome === "failure" ? (
                                  <XCircle size={17} />
                                ) : e.outcome === "success" ? (
                                  <CheckCircle2 size={17} />
                                ) : (
                                  <Clock3 size={17} />
                                )}
                              </div>
                              <div className="timeline-body">
                                <div className="timeline-title">
                                  <strong>{e.stage}</strong>
                                  <span className="nf">
                                    {e.nf.toUpperCase()}
                                  </span>
                                  <Status value={e.outcome} />
                                </div>
                                <small>
                                  {time(e.time)} UTC · {e.name}
                                </small>
                                <p>{e.explanation}</p>
                                <Technical event={e} />
                              </div>
                            </div>
                          ))}
                      </div>
                    </section>
                    <div>
                      <Procedures openUE={openUE} items={ue.procedures} />
                      <Incidents
                        openUE={openUE}
                        items={data.incidents.filter((i) => i.ue_id === ue.id)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <Empty>
                  This UE is no longer in the retained event window.
                </Empty>
              ))}
            {tab === "Raw events" && (
              <section className="panel">
                <div className="panel-header">
                  <h2>Normalized raw evidence</h2>
                  <span>Latest {data.events.length} · developer view</span>
                </div>
                <p className="muted">
                  Sealed event fields and Kafka provenance. Unredacted log
                  bodies are intentionally excluded from the API.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time · UTC</th>
                        <th>NF</th>
                        <th>Event</th>
                        <th>Status</th>
                        <th>UE</th>
                        <th>Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.events.map((e) => (
                        <tr key={e.id}>
                          <td>{time(e.time)}</td>
                          <td>{e.nf.toUpperCase()}</td>
                          <td>{e.name}</td>
                          <td>
                            <Status value={e.outcome} />
                          </td>
                          <td>
                            {e.ue_id ? (
                              <button
                                className="link"
                                onClick={() => openUE(e.ue_id)}
                              >
                                {e.ue_id}
                              </button>
                            ) : (
                              "Unassociated"
                            )}
                          </td>
                          <td>
                            <Technical event={e} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
