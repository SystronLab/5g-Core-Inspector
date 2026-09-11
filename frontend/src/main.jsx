import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons/faCircleCheck";
import { faCircleXmark } from "@fortawesome/free-solid-svg-icons/faCircleXmark";
import { faClock } from "@fortawesome/free-solid-svg-icons/faClock";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons/faMobileScreenButton";
import { faRotate } from "@fortawesome/free-solid-svg-icons/faRotate";
import { faScroll } from "@fortawesome/free-solid-svg-icons/faScroll";
import { faTableCellsLarge } from "@fortawesome/free-solid-svg-icons/faTableCellsLarge";
import { faTowerBroadcast } from "@fortawesome/free-solid-svg-icons/faTowerBroadcast";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons/faTriangleExclamation";
import { faWaveSquare } from "@fortawesome/free-solid-svg-icons/faWaveSquare";
import Metric from "./Metric";
import "./styles.css";

function FontAwesomeIcon({ icon, className = "" }) {
  const [width, height, , , path] = icon.icon;
  return <svg className={className} aria-hidden="true" viewBox={`0 0 ${width} ${height}`} fill="currentColor" focusable="false">
    {Array.isArray(path)
      ? path.map((part, index) => <path d={part} key={index}/>)
      : <path d={path}/>
    }
  </svg>;
}

const tabs = [
  ["Overview", faTableCellsLarge],
  ["UE list", faMobileScreenButton],
  ["Incidents", faTriangleExclamation],
  ["NF health", faWaveSquare],
  ["Raw events", faScroll],
];
const tabLabels = {
  "UE list": "UE sessions",
  "Raw events": "Raw logs",
};
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
function IncidentCard({ incident: i, openUE }) {
  return (
    <article className="incident">
      <FontAwesomeIcon icon={faTriangleExclamation} />
      <div><h3>{i.title}</h3><p>{i.cause}</p><small>{i.nf?.toUpperCase()} · {time(i.time)} UTC · {i.evidence.length} evidence records</small>
        {i.ue_id && <button className="link" onClick={() => openUE(i.ue_id)}>Open UE timeline → {i.ue_id}</button>}
      </div>
    </article>
  );
}
function Incidents({ items, openUE, compact = false }) {
  const [selectedId, setSelectedId] = useState(null);
  const selectedIncident = items.find((i) => i.id === selectedId) || items[0];
  if (compact) return (
    <section className="panel"><div className="panel-header"><h2>Related incidents</h2><span>{items.length}</span></div>
      {!items.length ? <Empty>No incident evidence for this UE.</Empty> : items.map((i) => <IncidentCard key={i.id} incident={i} openUE={openUE} />)}
    </section>
  );
  return (
    <div className="incident-workspace">
      <div className="incident-tools">
        <input placeholder="Search incident or SUPI" />
        <button>All severities <span>⌄</span></button>
        <button>Last hour <span>⌄</span></button>
      </div>
      <section className="incident-stats">
        <div><small>Open incidents</small><strong className="red-number">{items.length}</strong></div>
        <div><small>Affected UEs</small><strong>{new Set(items.map((i) => i.ue_id).filter(Boolean)).size}</strong></div>
        <div><small>Resolved today</small><strong>0</strong></div>
      </section>
      <div className="incident-split">
        <section className="panel incident-list-panel"><div className="panel-header"><h2>Active incidents</h2><span>Grouped by observed failure</span></div>
          {!items.length ? <Empty>No failure or repeated-attempt evidence in the retained events.</Empty> : items.map((i) => (
            <button key={i.id} className={`incident-list-row ${selectedIncident?.id === i.id ? "selected" : ""}`} onClick={() => setSelectedId(i.id)}>
              <span className="severity-dot"/><span><strong>{i.title}</strong><small>{i.nf?.toUpperCase()} · {time(i.time)} UTC<br/>{i.cause}</small></span><span>{i.evidence.length}<small>events</small></span>
            </button>))}
        </section>
        <section className="panel incident-detail"><div className="panel-header"><h2>Incident details</h2></div>
          {selectedIncident ? <div className="incident-detail-body"><div className="incident-id"><Status value="failure"/><small>{selectedIncident.id}</small></div><h2>{selectedIncident.title}</h2><p>{selectedIncident.cause}</p>
            <div className="cause-box"><strong>Observed failure evidence</strong><p>{selectedIncident.root_cause?.reason || "No deterministic root cause can be established from the retained evidence."}</p></div>
            <h4>Correlated evidence</h4><div className="detail-kv"><span>Network function</span><b>{selectedIncident.nf?.toUpperCase()}</b></div><div className="detail-kv"><span>Evidence records</span><b>{selectedIncident.evidence.length}</b></div><div className="detail-kv"><span>Observed at</span><b>{time(selectedIncident.time)} UTC</b></div>
            {selectedIncident.ue_id && <button className="open-timeline" onClick={() => openUE(selectedIncident.ue_id)}>Open UE timeline →</button>}
          </div> : <Empty>Select an incident to inspect its evidence.</Empty>}
        </section>
      </div>
    </div>
  );
}

function OverviewWorkspace({ data, openUE }) {
  const procedures = data.procedures.slice().reverse();
  const [selectedId, setSelectedId] = useState(null);
  const selectedProcedure = procedures.find((p) => p.id === selectedId) || procedures[0];
  const selectedUE = selectedProcedure ? data.ues.find((u) => u.id === selectedProcedure.ue_id) : data.ues[0];
  const stages = selectedUE?.timeline.filter((e) => e.is_procedure_stage).slice(-7) || [];
  return <>
    <div className="overview-tools"><input placeholder="Search SUPI or UE ID"/><button>Last 15 minutes <span>⌄</span></button></div>
    <section className="overview-metrics">
      {[["Connected UEs",data.summary.active_ues,"neutral"],["Successful registrations",data.summary.successful_registrations,"good"],["Failed registrations",data.summary.failed_registrations,"bad"],["Active PDU sessions",data.summary.active_pdu_sessions,"neutral"]].map(([label,value,tone]) => <div className={`overview-stat ${tone}`} key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </section>
    <div className="overview-split">
      <section className="panel recent-procedures"><div className="panel-header"><h2>Recent UE procedures</h2></div>
        <div className="procedure-head"><span>UE</span><span>Procedure</span><span>Progress</span></div>
        {!procedures.length ? <Empty>No UE procedures observed in this capture.</Empty> : procedures.slice(0,8).map((p) => <button className={`procedure-row ${p.id === selectedProcedure?.id ? "selected" : ""}`} key={p.id} onClick={() => setSelectedId(p.id)}>
          <span>…{p.ue_id.slice(-4)}</span><span>{human(p.latest_procedure || "Initial registration")}</span><span className="progress"><i style={{width:p.outcome === "success" ? "100%" : p.outcome === "failure" ? "72%" : "55%"}}/></span>
        </button>)}
      </section>
      <section className="panel procedure-detail-panel"><div className="panel-header"><h2>Procedure details</h2></div>
        {selectedUE ? <div className="procedure-detail-body"><button className="detail-supi" onClick={() => openUE(selectedUE.id)}>SUPI {selectedUE.supi || selectedUE.id}</button><small>{selectedUE.identifiers?.gnb_id ? `gNB ${selectedUE.identifiers.gnb_id} · ` : ""}{selectedUE.timeline.length} correlated events</small><div className="mini-timeline">
          {stages.map((e) => <div key={e.id} className={e.outcome === "failure" ? "failed" : ""}><span>{e.outcome === "failure" ? "!" : "✓"}</span><b>{e.stage}</b><time>{new Date(e.time).toLocaleTimeString("en-GB",{hour12:false})}</time></div>)}
        </div>{selectedProcedure?.outcome === "failure" && <div className="failure-callout"><strong>Registration failed at {selectedProcedure.stopped_at || "an observed stage"}</strong><p>{selectedProcedure.cause || "No explicit failure cause was reported."}</p></div>}<button className="raw-action" onClick={() => openUE(selectedUE.id)}>View correlated timeline</button></div> : <Empty>Select a procedure to inspect its signalling stages.</Empty>}
      </section>
    </div>
  </>;
}

function NFHealth({ data }) {
  const functions = ["amf", "smf", "upf", "ausf", "udm", "nrf", "pcf", "nssf"];
  const latestByNF = Object.fromEntries(functions.map((nf) => [nf, data.nf_health?.[nf]?.latest_event || data.events.find((event) => event.nf === nf)]));
  const observed = functions.filter((nf) => latestByNF[nf]);
  const unavailable = functions.length - observed.length;
  const [selectedNF, setSelectedNF] = useState(observed[0] || "amf");
  const selectedEvent = latestByNF[selectedNF];
  const signals = data.events.filter((event) => event.nf === selectedNF).slice(0, 5);
  const ago = (value) => {
    if (!value) return "Not observed";
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  };
  return <div className="nf-workspace">
    <button className="refresh-checks"><FontAwesomeIcon icon={faRotate}/>Refresh checks</button>
    <div className="nf-summary"><b>{observed.length} observed</b><strong>{unavailable} no data</strong><span>{data.incidents.length} related incidents</span></div>
    <div className="nf-grid">{functions.map((nf) => {
      const event = latestByNF[nf];
      const status = event ? (event.outcome === "failure" ? "Degraded" : "Healthy") : "No data";
      return <button key={nf} className={`nf-card ${selectedNF === nf ? "selected" : ""}`} onClick={() => setSelectedNF(nf)}>
        <span className="nf-card-title"><b>{nf.toUpperCase()}</b><i className={status.toLowerCase().replace(" ", "-")}>{status}</i></span>
        <small>Evidence source: {event?.source?.container_name || "Not observed"}</small>
        <small>Last log: {ago(event?.time)}</small>
        <small>Recent outcome: {event ? human(event.outcome) : "Not checked"}</small>
      </button>;
    })}</div>
    <section className="panel service-map"><div className="panel-header"><h2>Service communication</h2><span>Retained evidence</span></div><div className="service-nodes">
      <div className="service-path"><span>gNB</span><i>→</i>{["amf","smf","upf"].map((nf, index) => <React.Fragment key={nf}><span className={latestByNF[nf] ? "seen" : "missing"}>{nf.toUpperCase()}</span>{index < 2 && <i>→</i>}</React.Fragment>)}</div>
      <div className="service-row">{["ausf","udm","nrf","pcf"].map((nf) => <span className={latestByNF[nf] ? "seen" : "missing"} key={nf}>{nf.toUpperCase()}</span>)}</div>
      {unavailable > 0 && <p>△ Some network functions have no evidence in the current retained window</p>}
    </div></section>
    <section className="panel selected-nf"><div className="panel-header"><h2>Selected NF</h2></div><div className="selected-nf-body">
      <div className="selected-nf-title"><h3>{selectedNF.toUpperCase()}</h3><Status value={selectedEvent ? selectedEvent.outcome === "failure" ? "degraded" : "healthy" : "unreachable"}/></div>
      <div className="detail-kv"><span>Evidence source</span><b>{selectedEvent?.source?.container_name || "Not observed"}</b></div>
      <div className="detail-kv"><span>Last log received</span><b>{ago(selectedEvent?.time)}</b></div>
      <div className="detail-kv"><span>Observed events</span><b>{data.nf_health?.[selectedNF]?.event_count || data.events.filter((event) => event.nf === selectedNF).length}</b></div>
      <h4>Recent signals</h4>{signals.length ? signals.map((event) => <div className="nf-signal" key={event.id}><span className={event.outcome === "failure" ? "failure" : "success"}/><b>{event.stage}</b><time>{new Date(event.time).toLocaleTimeString("en-GB", {hour12:false})}</time></div>) : <p className="muted">No signals observed for this function.</p>}
    </div></section>
  </div>;
}

function App() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState(window.location.hash === "#incidents" ? "Incidents" : window.location.hash === "#nf-health" ? "NF health" : "Overview"),
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
    <div className="app-frame">
      <header className="app-header">
        <div className="header-identity">
          <a className="systron-wordmark" href="https://systronlab.github.io/" target="_blank" rel="noreferrer" aria-label="SYSTRON Lab website">
            <span>SYS</span>TRON
          </a>
          <span className="header-divider" />
          <div className="brand">
            <FontAwesomeIcon icon={faTowerBroadcast} />
            <strong>5G Core Inspector</strong>
          </div>
        </div>
        <div className={`live ${error ? "offline" : ""}`}>
          <span className="live-dot" />
          {error ? "Offline" : data?.health.status === "ok" ? "Live" : "Checking"}
        </div>
        <span className="app-updated">
          Open5GS · {updated ? `Updated ${updated.toLocaleTimeString()}` : "Connecting…"}
        </span>
      </header>
      <div className="shell">
      <aside>
        <div className="nav-label">OPERATIONS</div>
        <nav>
          {tabs.map(([t, icon]) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              <FontAwesomeIcon icon={icon} />
              {tabLabels[t] || t}
            </button>
          ))}
          {selected && (
            <button
              className={tab === "UE timeline" ? "active" : ""}
              onClick={() => setTab("UE timeline")}
            >
              <FontAwesomeIcon icon={faClock} />
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
            <h1>{tab === "Overview" ? "Network overview" : tab === "NF health" ? "Network Function Health" : tab}</h1>
            <p className="muted">
              {tab === "Overview" ? "Device-centric view of registration and PDU sessions" : tab === "Incidents" ? "Correlated failures requiring operator attention" : tab === "NF health" ? "Container state, log activity and service communication" : "UE procedures, signalling sequences and evidence-backed troubleshooting"}
            </p>
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
              <OverviewWorkspace data={data} openUE={openUE}/>
            )}
            {tab === "UE list" && (
              <UEList
                rows={rows}
                search={search}
                setSearch={setSearch}
                openUE={openUE}
              />
            )}
            {tab === "Incidents" && (
              <Incidents openUE={openUE} items={data.incidents} />
            )}
            {tab === "NF health" && (
              <NFHealth data={data} />
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
                                  <FontAwesomeIcon icon={faCircleXmark} />
                                ) : e.outcome === "success" ? (
                                  <FontAwesomeIcon icon={faCircleCheck} />
                                ) : (
                                  <FontAwesomeIcon icon={faClock} />
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
                        compact
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
      <footer className="app-footer">
        <div className="footer-product">
          <span className="footer-mark"><b>SYS</b>TRON</span>
          <span>5G Core Inspector</span>
          <small>Evidence-led visibility for Open5GS networks.</small>
        </div>
        <div className="footer-meta">
          <span><i className={`footer-status ${error ? "offline" : ""}`} />{error ? "System offline" : "Live monitoring active"}</span>
          <a href="https://systronlab.github.io/" target="_blank" rel="noreferrer">SYSTRON Lab</a>
          <a href="https://github.com/SystronLab/5g-Core-Inspector" target="_blank" rel="noreferrer">GitHub</a>
          <small>© {new Date().getFullYear()} SYSTRON Lab</small>
        </div>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
