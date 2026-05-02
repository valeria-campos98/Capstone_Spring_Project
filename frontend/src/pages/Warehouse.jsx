import { useState, useEffect } from "react";
import axios from "axios";
import "./Warehouse.css";
import { IoSaveOutline, IoCheckmarkCircle, IoReloadOutline, IoAddOutline } from "react-icons/io5";
import { MdKeyboardArrowRight, MdKeyboardArrowDown } from "react-icons/md";

export default function Warehouse() {
  const [run, setRun]               = useState(null);
  const [activeBatch, setActiveBatch] = useState(null);
  const [items, setItems]           = useState([]);
  const [boxSplits, setBoxSplits]   = useState({}); // { item_id: [{box, qty}] }
  const [expanded, setExpanded]     = useState(new Set()); // item ids that are expanded
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [savedAt, setSavedAt]       = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => { loadActiveRun(); }, []);

  async function loadActiveRun() {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:8000/warehouse/active");
      if (res.data) {
        setRun(res.data);
        const firstActive = res.data.batches.find(b => b.status !== "finalized")
          || res.data.batches[0];
        if (firstActive) selectBatch(firstActive);
      }
    } catch { setRun(null); }
    setLoading(false);
  }

  function selectBatch(batch) {
    setActiveBatch(batch);
    setNotes(batch.warehouse_notes || "");
    setExpanded(new Set());

    const newItems = batch.items.map(i => ({
      ...i,
      actual_qty: i.actual_qty ?? i.quantity,
    }));
    setItems(newItems);

    // Initialize box splits from saved data or empty
    const splits = {};
    newItems.forEach(i => {
      splits[i.id] = i.box_splits?.length
        ? i.box_splits.map(s => ({ box: s.box_number, qty: s.box_qty }))
        : [];
    });
    setBoxSplits(splits);
    setSavedAt(null);
  }

  // ── Item actual qty ───────────────────────────────────────────────────────
  function updateActualQty(id, val) {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, actual_qty: parseInt(val) || 0 } : i
    ));
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────
  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // If no splits yet, add one empty row automatically
        if (!boxSplits[id] || boxSplits[id].length === 0) {
          setBoxSplits(bs => ({ ...bs, [id]: [{ box: "", qty: "" }] }));
        }
      }
      return next;
    });
  }

  // ── Box split operations ──────────────────────────────────────────────────
  function addBoxSplit(itemId) {
    setBoxSplits(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), { box: "", qty: "" }],
    }));
  }

  function removeBoxSplit(itemId, idx) {
    setBoxSplits(prev => ({
      ...prev,
      [itemId]: prev[itemId].filter((_, i) => i !== idx),
    }));
  }

  function updateBoxSplit(itemId, idx, field, val) {
    setBoxSplits(prev => ({
      ...prev,
      [itemId]: prev[itemId].map((s, i) =>
        i === idx ? { ...s, [field]: val } : s
      ),
    }));
  }

  function getSplitTotal(itemId) {
    return (boxSplits[itemId] || []).reduce((s, sp) => s + (parseInt(sp.qty) || 0), 0);
  }

  function getUniqueBoxCount() {
    const allBoxes = new Set();
    Object.values(boxSplits).forEach(splits =>
      splits.forEach(s => { if (s.box) allBoxes.add(String(s.box)); })
    );
    return allBoxes.size;
  }

  // ── Save / finalize ───────────────────────────────────────────────────────
  function buildPayload() {
    return {
      items: items.map(i => ({
        id: i.id,
        actual_qty: i.actual_qty,
        box_splits: (boxSplits[i.id] || [])
          .filter(s => s.box && s.qty)
          .map(s => ({ box_number: parseInt(s.box), box_qty: parseInt(s.qty) })),
      })),
      notes,
    };
  }

  async function saveProgress() {
    if (!activeBatch) return;
    setSaving(true);
    try {
      await axios.post(
        `http://localhost:8000/warehouse/batch/${activeBatch.id}/save`,
        buildPayload()
      );
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      alert("Failed to save. Check your connection.");
    }
    setSaving(false);
  }

  async function finalizeBatch() {
    if (!activeBatch) return;
    const ok = window.confirm(
      `Finalize "${activeBatch.batch_name}"?\n\nThis saves the final receipt. You can still edit after finalizing.`
    );
    if (!ok) return;
    setFinalizing(true);
    try {
      const res = await axios.post(
        `http://localhost:8000/warehouse/batch/${activeBatch.id}/finalize`,
        buildPayload(),
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${run.run_name} - ${activeBatch.batch_name} - FINAL.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      await loadActiveRun();
    } catch {
      alert("Failed to finalize batch.");
    }
    setFinalizing(false);
  }

  const totalPlanned = items.reduce((s, i) => s + i.quantity, 0);
  const totalActual  = items.reduce((s, i) => s + (i.actual_qty || 0), 0);
  const difference   = totalActual - totalPlanned;

  if (loading) return (
    <div className="wh-page">
      <div className="wh-loading">Loading active production run...</div>
    </div>
  );

  if (!run || !run.batches || run.batches.length === 0) return (
    <div className="wh-page">
      <div className="wh-empty">
        <h2>No active production run</h2>
        <p>Generate a production plan from the office to get started.</p>
      </div>
    </div>
  );

  return (
    <div className="wh-page">

      {/* ── Header ── */}
      <div className="wh-header">
        <div className="wh-header-left">
          <p className="wh-eyebrow">Maventee · Warehouse</p>
          <h1 className="wh-title">{run.run_name}</h1>
          <p className="wh-meta">{run.coverage_weeks} weeks / {run.batches.length} batch{run.batches.length !== 1 ? "es" : ""}</p>
        </div>
        <button className="wh-reload-btn" onClick={loadActiveRun} title="Reload">
          <IoReloadOutline />
        </button>
      </div>

      {/* ── Batch tabs ── */}
      <div className="wh-batch-tabs">
        {run.batches.map(b => (
          <button
            key={b.id}
            className={`wh-batch-tab ${activeBatch?.id === b.id ? "active" : ""} ${b.status === "finalized" ? "finalized" : ""}`}
            onClick={() => selectBatch(b)}
          >
            {b.batch_name}
            {b.status === "finalized" && <span className="wh-finalized-badge">✓</span>}
          </button>
        ))}
      </div>

      {activeBatch && (
        <div className="wh-body">

          {/* ── Stats bar ── */}
          <div className="wh-stats-bar">
            <div className="wh-stat">
              <span className="wh-stat-num">{totalPlanned}</span>
              <span className="wh-stat-label">Planned</span>
            </div>
            <div className="wh-stat">
              <span className={`wh-stat-num ${difference < 0 ? "danger" : difference > 0 ? "over" : "match"}`}>
                {totalActual}
              </span>
              <span className="wh-stat-label">Actual</span>
            </div>
            <div className="wh-stat">
              <span className={`wh-stat-num ${difference < 0 ? "danger" : difference > 0 ? "over" : "match"}`}>
                {difference > 0 ? `+${difference}` : difference}
              </span>
              <span className="wh-stat-label">Difference</span>
            </div>
            <div className="wh-stat">
              <span className="wh-stat-num">{getUniqueBoxCount()}</span>
              <span className="wh-stat-label">Boxes</span>
            </div>
          </div>

          {/* ── Table ── */}
          <div className="wh-table-wrap">
            <table className="wh-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>WL</th>
                  <th>SKU</th>
                  <th>Color</th>
                  <th>Size</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Diff</th>
                  <th>Boxes</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const diff       = (item.actual_qty || 0) - item.quantity;
                  const isExpanded = expanded.has(item.id);
                  const splits     = boxSplits[item.id] || [];
                  const splitTotal = getSplitTotal(item.id);
                  const splitMatch = splits.length > 0 && splitTotal === item.actual_qty;
                  const splitWarn  = splits.length > 0 && splitTotal !== item.actual_qty;

                  return (
                    <>
                      {/* ── Main SKU row ── */}
                      <tr
                        key={item.id}
                        className={`wh-main-row ${diff < 0 ? "row-short" : diff > 0 ? "row-over" : ""}`}
                      >
                        <td>
                          <button
                            className="wh-expand-btn"
                            onClick={() => toggleExpand(item.id)}
                            title={isExpanded ? "Collapse" : "Assign boxes"}
                          >
                            {isExpanded
                              ? <MdKeyboardArrowDown />
                              : <MdKeyboardArrowRight />}
                          </button>
                        </td>
                        <td><span className="wh-wl">{item.warehouse_location || "—"}</span></td>
                        <td className="wh-sku">{item.merchant_sku}</td>
                        <td>{item.color || "—"}</td>
                        <td>{item.size || "—"}</td>
                        <td className="wh-planned">{item.quantity}</td>
                        <td>
                          <input
                            className="wh-qty-input"
                            type="number"
                            value={item.actual_qty}
                            onChange={e => updateActualQty(item.id, e.target.value)}
                            min={0}
                          />
                        </td>
                        <td className={`wh-diff ${diff < 0 ? "danger" : diff > 0 ? "over" : "match"}`}>
                          {diff !== 0 ? (diff > 0 ? `+${diff}` : diff) : "—"}
                        </td>
                        <td>
                          {splits.length > 0 ? (
                            <span className={`wh-split-summary ${splitMatch ? "ok" : splitWarn ? "warn" : ""}`}>
                              {splits.length} box{splits.length !== 1 ? "es" : ""}
                              {splitMatch && " ✓"}
                              {splitWarn && ` (${splitTotal}/${item.actual_qty})`}
                            </span>
                          ) : (
                            <span className="wh-split-empty">—</span>
                          )}
                        </td>
                      </tr>

                      {/* ── Box split rows (expanded) ── */}
                      {isExpanded && (
                        <>
                          {splits.map((split, idx) => (
                            <tr key={`${item.id}-split-${idx}`} className="wh-split-row">
                              <td></td>
                              <td colSpan={3}>
                                <div className="wh-split-indent">
                                  <span className="wh-split-label">Box</span>
                                  <input
                                    className="wh-box-num-input"
                                    type="number"
                                    value={split.box}
                                    onChange={e => updateBoxSplit(item.id, idx, "box", e.target.value)}
                                    placeholder="#"
                                    min={1}
                                  />
                                </div>
                              </td>
                              <td colSpan={3}>
                                <div className="wh-split-qty-row">
                                  <input
                                    className="wh-box-qty-input"
                                    type="number"
                                    value={split.qty}
                                    onChange={e => updateBoxSplit(item.id, idx, "qty", e.target.value)}
                                    placeholder="qty"
                                    min={0}
                                  />
                                  <span className="wh-split-units">units</span>
                                </div>
                              </td>
                              <td colSpan={2}>
                                <button
                                  className="wh-split-rm"
                                  onClick={() => removeBoxSplit(item.id, idx)}
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}

                          {/* ── Split footer: total + add button ── */}
                          <tr className="wh-split-footer-row">
                            <td></td>
                            <td colSpan={6}>
                              <span className={`wh-split-total ${splitMatch ? "ok" : splitWarn ? "warn" : ""}`}>
                                Total: {splitTotal} / {item.actual_qty}
                                {splitMatch && "  ✓"}
                                {splitWarn && "  ⚠ doesn't match actual"}
                              </span>
                            </td>
                            <td colSpan={2}>
                              <button
                                className="wh-split-add"
                                onClick={() => addBoxSplit(item.id)}
                              >
                                <IoAddOutline /> box
                              </button>
                            </td>
                          </tr>
                        </>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Notes ── */}
          <div className="wh-notes-section">
            <label className="wh-notes-label">Batch Notes</label>
            <textarea
              className="wh-notes-textarea"
              placeholder="Add notes : damaged shirts, quantity changes, packaging issues..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* ── Actions ── */}
          <div className="wh-actions">
            {savedAt && (
              <span className="wh-saved-at">
                <IoCheckmarkCircle /> Saved at {savedAt}
              </span>
            )}
            <button className="wh-btn save" onClick={saveProgress} disabled={saving}>
              <IoSaveOutline />
              {saving ? "Saving..." : "Save Progress"}
            </button>
            <button className="wh-btn finalize" onClick={finalizeBatch} disabled={finalizing}>
              <IoCheckmarkCircle />
              {finalizing ? "Finalizing..." : "Finalize & Download Receipt"}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}