import React, { useEffect, useState } from "react";
import axios from "axios";
import "./Details.css";
import {
  IoTrendingUp, IoTrendingDown, IoRemoveOutline,
  IoClose, IoCheckmarkCircle, IoCreateOutline,
  IoChevronDown, IoChevronForward, IoPrintOutline,
} from "react-icons/io5";

const STATUS_CONFIG = {
  active:    { label: "In Progress", cls: "dBadgeProgress"  },
  complete:  { label: "Completed",   cls: "dBadgeCompleted" },
  abandoned: { label: "On Hold",     cls: "dBadgeCritical"  },
  planned:   { label: "Planned",     cls: "dBadgePlanned"   },
};
const BATCH_STATUS_CONFIG = {
  active:    { label: "In Progress", cls: "dBadgeProgress"  },
  finalized: { label: "Completed",   cls: "dBadgeCompleted" },
  planned:   { label: "Planned",     cls: "dBadgePlanned"   },
};

const TABS = [
  { id: "production", label: "Production History" },
  { id: "reports",               label: "Saved Reports"      },
  { id: "restock",              label: "Priority Restock"   },
  { id: "trending",             label: "Trending Products"  },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso.slice(0, 10); }
}

export default function Details() {
  const [activeTab, setActiveTab] = useState("production");

  const [uploads, setUploads]                   = useState([]);
  const [velocity, setVelocity]                 = useState([]);
  const [oosDuration, setOosDuration]           = useState([]);
  const [currentOos, setCurrentOos]             = useState([]);
  const [downloading, setDownloading]           = useState(null);
  const [loadingUploads, setLoadingUploads]     = useState(true);
  const [loadingVelocity, setLoadingVelocity]   = useState(true);
  const [loadingOos, setLoadingOos]             = useState(true);
  const [velocityMeta, setVelocityMeta]         = useState(null);

  const [runs, setRuns]                         = useState([]);
  const [loadingRuns, setLoadingRuns]           = useState(true);
  const [expandedRuns, setExpandedRuns]         = useState(new Set());
  const [downloadingBatch, setDownloadingBatch] = useState(null);
  const [boxPopup, setBoxPopup]                 = useState(null);
  const [loadingBoxes, setLoadingBoxes]         = useState(false);
  const [expandedBoxes, setExpandedBoxes]       = useState(new Set());
  const [notesPopup, setNotesPopup]             = useState(null);
  const [notesEditing, setNotesEditing]         = useState(false);
  const [notesDraft, setNotesDraft]             = useState("");
  const [notesSaving, setNotesSaving]           = useState(false);

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/uploads/history")
      .then(res => setUploads(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUploads([]))
      .finally(() => setLoadingUploads(false));

    axios.get("http://127.0.0.1:8000/analytics/velocity")
      .then(res => {
        const data = res.data?.data || [];
        setVelocity(data);
        if (data.length > 0) setVelocityMeta({
          currentDate: data[0].current_date,
          prevDate:    data[0].prev_date,
          gapDays:     data[0].gap_days,
          isMonthly:   data[0].is_monthly,
        });
      })
      .catch(() => setVelocity([]))
      .finally(() => setLoadingVelocity(false));

    axios.get("http://127.0.0.1:8000/analytics/oos-duration")
      .then(res => setOosDuration(res.data?.data || []))
      .catch(() => setOosDuration([]));

    axios.get("http://127.0.0.1:8000/analytics/current-oos")
      .then(res => setCurrentOos(res.data?.data || []))
      .catch(() => setCurrentOos([]))
      .finally(() => setLoadingOos(false));

    axios.get("http://127.0.0.1:8000/production-runs/history/full")
      .then(res => setRuns(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRuns([]))
      .finally(() => setLoadingRuns(false));
  }, []);

  async function handleDownload(upload) {
    setDownloading(upload.id);
    try {
      const res = await axios.get(`http://127.0.0.1:8000/uploads/download/${upload.id}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `restock_snapshot_${upload.window_end || upload.id}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { alert("Failed to download snapshot."); }
    finally { setDownloading(null); }
  }

  function toggleRun(id) {
    setExpandedRuns(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function downloadBatch(runId, batchId, runName, batchName) {
    const key = `${runId}-${batchId}`;
    setDownloadingBatch(key);
    try {
      const res = await axios.get(`http://127.0.0.1:8000/production-runs/${runId}/download/${batchId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `${runName} - ${batchName}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { alert("Failed to download batch."); }
    setDownloadingBatch(null);
  }

  async function openBoxPopup(batchId, batchName) {
    setLoadingBoxes(true);
    setBoxPopup({ batchId, batchName, rows: [] });
    setExpandedBoxes(new Set());
    try {
      const res = await axios.get(`http://127.0.0.1:8000/production-runs/batch/${batchId}/box-detail`);
      setBoxPopup({ batchId, batchName, rows: res.data });
    } catch { setBoxPopup({ batchId, batchName, rows: [] }); }
    setLoadingBoxes(false);
  }

  function toggleBox(boxNum) {
    setExpandedBoxes(prev => { const n = new Set(prev); n.has(boxNum) ? n.delete(boxNum) : n.add(boxNum); return n; });
  }

  function groupByBox(rows) {
    const groups = {};
    rows.forEach(r => {
      const k = r.box_number ?? "unassigned";
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "unassigned") return 1;
      if (b === "unassigned") return -1;
      return Number(a) - Number(b);
    });
  }

  function openNotesPopup(batchId, batchName, notes, warehouseNotes) {
    setNotesPopup({ batchId, batchName, notes: notes || "", warehouseNotes: warehouseNotes || "" });
    setNotesDraft(notes || "");
    setNotesEditing(false);
  }

  async function saveNotesPopup() {
    if (!notesPopup) return;
    setNotesSaving(true);
    try {
      await axios.patch(`http://127.0.0.1:8000/production-runs/batch/${notesPopup.batchId}/notes`, { notes: notesDraft });
      setRuns(prev => prev.map(run => ({
        ...run,
        batches: run.batches.map(b => b.id === notesPopup.batchId ? { ...b, notes: notesDraft } : b)
      })));
      setNotesPopup(prev => ({ ...prev, notes: notesDraft }));
      setNotesEditing(false);
    } catch { alert("Failed to save notes."); }
    setNotesSaving(false);
  }

  function printBoxTable() {
    if (!boxPopup?.rows?.length) return;
    const rows = boxPopup.rows;
    const batchName = boxPopup.batchName;
    const tableHtml = `
      <table>
        <thead><tr>
          <th>Box #</th><th>WL</th><th>SKU</th><th>Color</th><th>Size</th>
          <th class="r">Qty in Box</th><th class="r">Actual Total</th>
        </tr></thead>
        <tbody>
          ${rows.map((row, i) => {
            const showBox = i === 0 || rows[i - 1].box_number !== row.box_number;
            return `<tr>
              <td class="b">${showBox ? (row.box_number ? 'Box ' + row.box_number : '—') : ''}</td>
              <td class="m">${row.warehouse_location || '—'}</td>
              <td>${row.merchant_sku}</td>
              <td>${row.color || '—'}</td>
              <td>${row.size || '—'}</td>
              <td class="r b">${row.box_qty}</td>
              <td class="r m">${row.actual_qty}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="5">Total units</td>
          <td class="r">${rows.reduce((s, r) => s + (r.box_qty || 0), 0)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    `;
    const win = window.open('', '_blank', 'width=960,height=720');
    win.document.write(`<!doctype html><html><head><title>${batchName} — Shipment Box Summary</title>
      <style>
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Inter,-apple-system,sans-serif;color:#1a1a1f;padding:40px 48px;background:#fff}
        .h{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:16px;border-bottom:2px solid #1a1a1f;margin-bottom:24px}
        h1{font-size:18px;font-weight:700;margin:0 0 4px}
        .e{font-size:11px;color:#6b6b75;text-transform:uppercase;letter-spacing:.08em}
        .meta{font-size:11px;color:#6b6b75;text-align:right}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{padding:12px 18px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.04em;color:#6b6b75;border-bottom:1px solid #1a1a1f;background:#fff}
        tbody tr:nth-child(even){background:#eeeefa}
        td{padding:12px 18px;border-bottom:1px solid #e5e5ea}
        .b{font-weight:700;color:#1a1a1f}.m{color:#6b6b75}.r{text-align:right}
        tfoot tr{background:#f3f3f6;border-top:2px solid #1a1a1f}
        tfoot td{padding:12px 18px;font-weight:700}
        @media print{@page{size:A4 portrait;margin:1.5cm 2cm}body{padding:0}}
      </style></head><body>
      <div class="h"><div><p class="e">Shipment Box Summary</p><h1>${batchName}</h1></div>
      <div class="meta">${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div></div>
      ${tableHtml}
      <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};</script>
      </body></html>`);
    win.document.close();
  }

  const showCurrentOos = oosDuration.length === 0;
  const restockItems   = showCurrentOos ? currentOos : oosDuration;
  const maxScore       = Math.max(
    ...restockItems.map((item, i) =>
      item.priority_score || (showCurrentOos ? (100 - i * 8) : 50)
    ),
    1
  );

  

  function priorityFor(item, idx) {
    if (showCurrentOos) {
      if (idx === 0) return { level: "Critical", cls: "dBadgeCritical", barCls: "crit" };
      if (idx <= 1)  return { level: "High",     cls: "dBadgeHigh",     barCls: "high" };
      return           { level: "Medium",   cls: "dBadgeMedium",   barCls: "" };
    }
    if (item.consecutive_uploads >= 3) return { level: "Critical", cls: "dBadgeCritical", barCls: "crit" };
    if (item.consecutive_uploads >= 2) return { level: "High",     cls: "dBadgeHigh",     barCls: "high" };
    if (item.estimated_days_oos >= 14) return { level: "Medium",   cls: "dBadgeMedium",   barCls: "" };
    return                              { level: "Low",      cls: "dBadgeLow",      barCls: "" };
  }

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const totalBatches = runs.reduce((s, r) => s + (r.batch_count || 0), 0);

  return (
    <div className="detailsPage">

      {/* Header */}
      <header className="dHeader">
        <div>
          
          <h1 className="dTitle">Details</h1>
          <div className="dMeta">Last updated {today}</div>
        </div>
        <div className="dHeaderActions">
          
         
        </div>
      </header>

      {/* Tabs */}
      <nav className="dTabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`dTab ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
            role="tab"
          >
            <span className="dTabNum">{t.num}</span>
            <span className="dTabLabel">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="dMain">

        {/* Production History */}
        {activeTab === "production" && (
          <section>
            <h2 className="dSectionTitle">
              Production History
              <span className="dSectionSub">
                {runs.length} run{runs.length !== 1 ? "s" : ""} · {totalBatches} total batches
              </span>
            </h2>
            <div className="dSectionRule" />

            {loadingRuns ? (
              <div className="dEmpty">Loading production history…</div>
            ) : runs.length === 0 ? (
              <div className="dEmpty">No production runs yet.</div>
            ) : (
              <div className="dRuns">
                {runs.map(run => {
                  const isExpanded = expandedRuns.has(run.id);
                  const statusCfg  = STATUS_CONFIG[run.status] || STATUS_CONFIG.active;
                  return (
                    <article key={run.id} className={`dRun ${isExpanded ? "open" : ""}`}>
                      <div className="dRunHeader" onClick={() => toggleRun(run.id)}>
                        <span className="dCaret">▶</span>
                        <div>
                          <div className="dRunTitle">
                            {run.run_name}
                            <span className={`dBadge ${statusCfg.cls}`}>{statusCfg.label}</span>
                          </div>
                          {!isExpanded && (
                            <div className="dRunMeta">
                              {formatDate(run.created_date)} · {run.coverage_weeks} weeks · {run.total_skus} SKUs · {run.batch_count} batch{run.batch_count !== 1 ? "es" : ""}
                            </div>
                          )}
                        </div>
                        {isExpanded ? (
                          <div className="dRunInfo">
                            <span>{formatDate(run.created_date)}</span>
                            <span>{run.coverage_weeks} weeks</span>
                            <span>{run.total_skus} SKUs</span>
                            <span>{run.batch_count} batch{run.batch_count !== 1 ? "es" : ""}</span>
                          </div>
                        ) : <div />}
                        <span />
                      </div>

                      {isExpanded && run.batches.length > 0 && (
                        <div className="dBatches">
                          {run.batches.map(batch => {
                            const bCfg    = BATCH_STATUS_CONFIG[batch.status] || BATCH_STATUS_CONFIG.active;
                            const dlKey   = `${run.id}-${batch.id}`;
                            const noteCnt = batch.notes ? 1 : 0;
                            const planned = batch.planned_quantity ?? batch.planned ?? "—";
                            const actual  = batch.actual_quantity  ?? batch.actual  ?? "—";
                            return (
                              <div className="dBatch" key={batch.id}>
                                <div>
                                  <div className="dBatchId">B-{String(batch.id).padStart(3, "0")}</div>
                                  <div className="dBatchName">{batch.batch_name}</div>
                                </div>
                                <div>
                                  <span className={`dBadge ${bCfg.cls}`} style={{ marginLeft: 0 }}>{bCfg.label}</span>
                                </div>
                                <div className="dBatchStat">
                                  <span className="dBatchStatLabel">Planned</span>
                                  <span className="dBatchStatVal">{typeof planned === "number" ? planned.toLocaleString() : planned}</span>
                                </div>
                                <div className="dBatchStat">
                                  <span className="dBatchStatLabel">Actual</span>
                                  <span className="dBatchStatVal">{typeof actual === "number" ? actual.toLocaleString() : actual}</span>
                                </div>
                                <button
                                  className="dBtn dBtnSm"
                                  onClick={() => openNotesPopup(batch.id, batch.batch_name, batch.notes, batch.warehouse_notes)}
                                >
                                  Notes ({noteCnt})
                                </button>
                                <button
                                  className="dBtn dBtnSm"
                                  onClick={() => openBoxPopup(batch.id, batch.batch_name)}
                                >
                                  Shipment Boxes ({batch.box_count ?? 0})
                                </button>
                                <button
                                  className="dBtnIcon"
                                  onClick={() => downloadBatch(run.id, batch.id, run.run_name, batch.batch_name)}
                                  disabled={downloadingBatch === dlKey}
                                  aria-label="Download batch"
                                  title="Download"
                                >
                                  ↓
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Saved Reports */}
        {activeTab === "reports" && (
          <section>
            <h2 className="dSectionTitle">
              Saved Reports
              <span className="dSectionSub">
                {uploads.length} uploaded file{uploads.length !== 1 ? "s" : ""}
              </span>
            </h2>
            <div className="dSectionRule" />

            {loadingUploads ? (
              <div className="dEmpty">Loading history…</div>
            ) : uploads.length === 0 ? (
              <div className="dEmpty">No reports saved yet.</div>
            ) : (
              <div className="dTableWrap">
                <table className="dTable">
                  <thead>
                    <tr>
                      <th className="dNumCol">#</th>
                      <th>File Name</th>
                      <th>Uploaded</th>
                      <th>Sales Window</th>
                      <th>SKUs</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.map((u, i) => (
                      <tr key={u.id}>
                        <td className="dNumCol">{String(uploads.length - i).padStart(2, "0")}</td>
                        <td>{u.file_name}</td>
                        <td>{u.upload_date ? formatDate(u.upload_date) : "—"}</td>
                        <td>{u.window_label || "—"}</td>
                        <td>{u.rows_processed?.toLocaleString() || "—"}</td>
                        <td>
                          <button
                            className="dBtnIcon"
                            onClick={() => handleDownload(u)}
                            disabled={downloading === u.id}
                            aria-label="Download"
                          >
                            ↓
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Priority Restock */}
        {activeTab === "restock" && (
          <section>
            <h2 className="dSectionTitle">
              Priority Restock List
              <span className="dSectionSub">
                {restockItems.length} item{restockItems.length !== 1 ? "s" : ""} ranked by urgency
              </span>
            </h2>
            <div className="dSectionRule" />

            {loadingOos ? (
              <div className="dEmpty">Loading restock priorities…</div>
            ) : restockItems.length === 0 ? (
              <div className="dEmpty">No out-of-stock SKUs found.</div>
            ) : (
              <div className="dTableWrap">
                <table className="dTable">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Product</th>
                      <th>Days OOS</th>
                      <th>Velocity</th>
                      <th className="dPriorityCell">Priority</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restockItems.map((item, i) => {
                      const p     = priorityFor(item, i);
                      const score = item.priority_score || (showCurrentOos ? (100 - i * 8) : 50);
                      const pct   = Math.min(100, (score / maxScore) * 100);
                      const rank  = String(i + 1).padStart(2, "0");
                      const days  = showCurrentOos ? "—" : `${item.estimated_days_oos}d`;
                      const vel   = item.last_known_sales || 0;
                      const isCrit = i === 0;
                      return (
                        <tr key={item.merchant_sku} className={`dRankRow ${isCrit ? "critical" : ""}`}>
                          <td style={i === 1 ? { color: "var(--d-red)" } : undefined}>{rank}</td>
                          <td>
                            <div className="dProductName">{item.product_name || item.merchant_sku}</div>
                            <div className="dProductSku">{item.merchant_sku}</div>
                          </td>
                          <td><span className="dDaysOos">{days}</span></td>
                          <td><span className="dVelocity">{vel}</span></td>
                          <td>
                            <div className="dPrioBar">
                              <div className="dPrioTrack">
                                <div className={`dPrioFill ${p.barCls}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="dPrioVal">{score}</span>
                            </div>
                          </td>
                          <td><span className={`dBadge ${p.cls}`} style={{ marginLeft: 0 }}>{p.level}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Trending */}
        {activeTab === "trending" && (
          <section>
            <h2 className="dSectionTitle">
              Trending Products
              <span className="dSectionSub">
                Sales velocity — current vs. previous period
                {velocityMeta && !velocityMeta.isMonthly && ` (${velocityMeta.gapDays}d gap)`}
              </span>
            </h2>
            <div className="dSectionRule" />

            {loadingVelocity ? (
              <div className="dEmpty">Loading velocity data…</div>
            ) : velocity.length === 0 ? (
              <div className="dEmpty">Not enough data — upload at least 2 reports.</div>
            ) : (
              <div className="dTableWrap">
                <table className="dTable">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Prev. Period</th>
                      <th>Current Period</th>
                      <th>Change</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {velocity.map(v => {
                      const cls      = v.trend === "up" ? "up" : v.trend === "down" ? "down" : "flat";
                      const Arrow    = v.trend === "up" ? IoTrendingUp : v.trend === "down" ? IoTrendingDown : IoRemoveOutline;
                      return (
                        <tr key={v.merchant_sku}>
                          <td>{v.merchant_sku}</td>
                          <td>{v.product_name || "—"}</td>
                          <td className="dPrevVal">{v.prev_sales?.toLocaleString()}</td>
                          <td className="dCurrVal">{v.current_sales?.toLocaleString()}</td>
                          <td>
                            <span className={`dChangeBadge ${cls}`}>
                              {v.change_pct > 0 ? "+" : ""}{v.change_pct?.toFixed(1)}%
                            </span>
                          </td>
                          <td><span className={`dTrendIcon ${cls}`}><Arrow /></span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      </main>

      {/* Notes Modal */}
      {notesPopup && (
        <div className="dModalBackdrop" onClick={() => setNotesPopup(null)}>
          <div className="dModal" onClick={e => e.stopPropagation()}>
            <div className="dModalHead">
              <div>
                <p className="dModalEyebrow">Batch Notes</p>
                <h3 className="dModalTitle">{notesPopup.batchName}</h3>
              </div>
              <button className="dModalClose" onClick={() => setNotesPopup(null)}><IoClose /></button>
            </div>
            <div className="dModalBody">
              <div style={{ marginBottom: 24 }}>
                <p className="dNotesLabel">Office notes</p>
                {notesEditing ? (
                  <textarea
                    className="dNotesArea"
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    placeholder="Add office notes…"
                    autoFocus
                  />
                ) : (
                  <div className="dNotesView">
                    {notesPopup.notes || <span style={{ color: "var(--d-subtle)", fontStyle: "italic" }}>No office notes yet.</span>}
                  </div>
                )}
              </div>
              <div>
                <p className="dNotesLabel">Warehouse notes</p>
                <div className="dNotesView">
                  {notesPopup.warehouseNotes || <span style={{ color: "var(--d-subtle)", fontStyle: "italic" }}>No warehouse notes for this batch.</span>}
                </div>
              </div>
            </div>
            <div className="dModalFoot">
              {notesEditing ? (
                <>
                  <button className="dBtn" onClick={() => { setNotesEditing(false); setNotesDraft(notesPopup.notes); }} disabled={notesSaving}>Cancel</button>
                  <button className="dBtn dBtnPrimary" onClick={saveNotesPopup} disabled={notesSaving}>
                    <IoCheckmarkCircle /> {notesSaving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <>
                  <button className="dBtn" onClick={() => setNotesPopup(null)}>Close</button>
                  <button className="dBtn dBtnPrimary" onClick={() => setNotesEditing(true)}>
                    <IoCreateOutline /> Edit notes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Box Detail Modal */}
      {boxPopup && (
        <div className="dModalBackdrop" onClick={() => setBoxPopup(null)}>
          <div className="dModal dModalWide" onClick={e => e.stopPropagation()}>
            <div className="dModalHead">
              <div>
                <p className="dModalEyebrow">Shipment Detail</p>
                <h3 className="dModalTitle">{boxPopup.batchName}</h3>
              </div>
              <button className="dModalClose" onClick={() => setBoxPopup(null)}><IoClose /></button>
            </div>
            <div className="dModalBody">
              {loadingBoxes ? (
                <div className="dEmpty">Loading box detail…</div>
              ) : boxPopup.rows.length === 0 ? (
                <div className="dEmpty">No box assignments found for this batch.</div>
              ) : (
                <>
                  {groupByBox(boxPopup.rows).map(([boxKey, rows]) => {
                    const isExpanded = expandedBoxes.has(boxKey);
                    const total = rows.reduce((s, r) => s + (r.box_qty || 0), 0);
                    const label = boxKey === "unassigned" ? "Unassigned" : `Box ${boxKey}`;
                    return (
                      <div key={boxKey} className="dBoxGroup">
                        <div className="dBoxHead" onClick={() => toggleBox(boxKey)}>
                          <span>
                            {isExpanded ? <IoChevronDown /> : <IoChevronForward />} {label}
                          </span>
                          <span className="dBoxMeta">{rows.length} SKU{rows.length !== 1 ? "s" : ""} · {total} units</span>
                        </div>
                        {isExpanded && (
                          <table className="dTable">
                            <thead>
                              <tr><th>WL</th><th>SKU</th><th>Color</th><th>Size</th><th style={{ textAlign: "right" }}>Qty</th></tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i}>
                                  <td>{r.warehouse_location || "—"}</td>
                                  <td>{r.merchant_sku}</td>
                                  <td>{r.color || "—"}</td>
                                  <td>{r.size || "—"}</td>
                                  <td style={{ textAlign: "right", fontWeight: 600 }}>{r.box_qty}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 16, fontSize: "0.8125rem", color: "var(--d-ink)", fontWeight: 600 }}>
                    Total: {boxPopup.rows.reduce((s, r) => s + (r.box_qty || 0), 0)} units across {groupByBox(boxPopup.rows).length} box{groupByBox(boxPopup.rows).length !== 1 ? "es" : ""}
                  </div>
                </>
              )}
            </div>
            <div className="dModalFoot">
              <button className="dBtn" onClick={printBoxTable} disabled={!boxPopup.rows.length}>
                <IoPrintOutline /> Print
              </button>
              <button className="dBtn dBtnPrimary" onClick={() => setBoxPopup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}