import { useState, useMemo } from "react";
import axios from "axios";
import "./ProductionPreview.css";
import { IoCloseCircle, IoDownloadOutline, IoCheckmark, IoAdd } from "react-icons/io5";
import { MdOutlineEdit } from "react-icons/md";
import { TiArrowSortedUp, TiArrowSortedDown, TiArrowUnsorted } from "react-icons/ti";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";

// ── Color badge mapping ───────────────────────────────────────────────────────
const COLOR_BADGE = {
  "Black":           "badge-black",
  "Mauve":           "badge-mauve",
  "Navy":            "badge-navy",
  "Dark Gray":       "badge-darkgray",
  "Light Gray":      "badge-lightgray",
  "White":           "badge-white",
  "Forest Green":    "badge-forest",
  "Military Green":  "badge-military",
  "Royal Blue":      "badge-royal",
  "Heather Navy":    "badge-hnavy",
  "Indigo Blue":     "badge-indigo",
  "Lagoon Blue":     "badge-lagoon",
  "Red":             "badge-red",
  "Maroon":          "badge-maroon",
  "Brown":           "badge-brown",
  "Slate":           "badge-slate",
  "Natural":         "badge-natural",
  "Texas Orange":    "badge-texorange",
  "Purple":          "badge-purple",
};

function ColorBadge({ color }) {
  const cls = COLOR_BADGE[color] || "badge-default";
  return <span className={`color-badge ${cls}`}>{color || "—"}</span>;
}

export default function ProductionPreview({ run, onClose, onBatchCreated }) {
  const [items, setItems]               = useState(run.unbatched.map(i => ({ ...i, qty: i.quantity })));
  const [batches, setBatches]           = useState(run.batches || []);
  const [selected, setSelected]         = useState(new Set());
  const [runName, setRunName]           = useState(run.run_name);
  const [editingName, setEditingName]   = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [showBatchInput, setShowBatchInput] = useState(false);
  const [downloading, setDownloading]   = useState(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting]           = useState([{ id: "warehouse_location", desc: false }]);
  const [runNotes, setRunNotes]         = useState(run.notes || "");
  const [batchNotes, setBatchNotes]     = useState({});
  const [openNoteId, setOpenNoteId]     = useState(null);


  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    const visibleIds = table.getRowModel().rows.map(r => r.original.id);
    setSelected(new Set(visibleIds));
  }

  function clearSelection() { setSelected(new Set()); }

  function updateQty(id, val) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty: parseInt(val) || 0 } : i));
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function createBatch() {
    if (selected.size === 0) return;
    const name = newBatchName.trim() || `Batch ${batches.length + 1}`;
    try {
      const res = await axios.post(
        `http://localhost:8000/production-runs/${run.id}/batch`,
        { batch_name: name, item_ids: Array.from(selected) }
      );
      setBatches(prev => [...prev, res.data]);
      setItems(prev => prev.filter(i => !selected.has(i.id)));
      setSelected(new Set());
      setNewBatchName("");
      setShowBatchInput(false);
      onBatchCreated?.();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to create batch.");
    }
  }

  async function saveRunName() {
    try {
      await axios.patch(
        `http://localhost:8000/production-runs/${run.id}/rename`,
        { name: runName }
      );
    } catch {}
    setEditingName(false);
  }

  async function saveRunNotes(notes) {
    try {
      await axios.patch(
        `http://localhost:8000/production-runs/${run.id}/notes`,
        { notes }
      );
    } catch {}
  }

  async function saveBatchNoteById(batchId, notes) {
    try {
      await axios.patch(
        `http://localhost:8000/production-runs/batch/${batchId}/notes`,
        { notes }
      );
      setBatchNotes(prev => ({ ...prev, [batchId]: notes }));
      setOpenNoteId(null);
    } catch {}
  }

  async function downloadBatch(batchId, batchName) {
    setDownloading(batchId);
    try {
      const res = await axios.get(
        `http://localhost:8000/production-runs/${run.id}/download/${batchId}`,
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${runName} — ${batchName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download batch.");
    }
    setDownloading(null);
  }

  // ── TanStack columns ──────────────────────────────────────────────────────
  const columns = useMemo(() => [

    {
      accessorKey: "warehouse_location",
      header: "WL",
      cell: info => <span className="sh-wl-pill">{info.getValue() || "—"}</span>,
    },
    {
      accessorKey: "merchant_sku",
      header: "SKU",
      cell: info => <span className="sh-sku-text">{info.getValue()}</span>,
    },
    {
      accessorKey: "color",
      header: "Color",
      cell: info => <ColorBadge color={info.getValue()} />,
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: info => <span className="sh-size-text">{info.getValue() || "—"}</span>,
    },
    {
      accessorKey: "qty",
      header: "Qty",
      cell: ({ row }) => (
        <input
          className="sh-qty-input"
          type="number"
          value={row.original.qty}
          onChange={e => updateQty(row.original.id, e.target.value)}
          onClick={e => e.stopPropagation()}
          min={0}
        />
      ),
    },
    {
      id: "remove",
      header: () => null,
      cell: ({ row }) => (
        <button
          className="sh-remove-btn"
          onClick={e => { e.stopPropagation(); removeItem(row.original.id); }}
          title="Remove"
        >
          ×
        </button>
      ),
      enableSorting: false,
      enableGlobalFilter: false,
    },
  ], [items]);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const summary = useMemo(() => {
    const colorSize = {};
    items.forEach(i => {
      if (!i.color || !i.size) return;
      const key = `${i.color}|${i.size}`;
      colorSize[key] = (colorSize[key] || 0) + i.qty;
    });
    return Object.entries(colorSize)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, qty]) => {
        const [color, size] = key.split("|");
        return { color, size, qty };
      });
  }, [items]);

  const totalUnbatched = items.reduce((s, i) => s + i.qty, 0);
  const totalBatched   = batches.reduce((s, b) => s + b.total_units, 0);

  function SortIcon({ column }) {
    if (!column.getCanSort()) return null;
    if (column.getIsSorted() === "asc")  return <TiArrowSortedUp className="sh-sort-icon active" />;
    if (column.getIsSorted() === "desc") return <TiArrowSortedDown className="sh-sort-icon active" />;
    return <TiArrowUnsorted className="sh-sort-icon" />;
  }

  return (
    <div className="preview-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="preview-modal">

        {/* ── Header ── */}
        <div className="preview-header">
          <div className="preview-header-left">
            {editingName ? (
              <div className="preview-name-edit">
                <input
                  className="preview-name-input"
                  value={runName}
                  onChange={e => setRunName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveRunName()}
                  autoFocus
                />
                <button className="preview-name-save" onClick={saveRunName}>
                  <IoCheckmark /> Save
                </button>
              </div>
            ) : (
              <div className="preview-title-row">
                <h2 className="preview-title">{runName}</h2>
                <button className="preview-edit-btn" onClick={() => setEditingName(true)}>
                  <MdOutlineEdit />
                </button>
              </div>
            )}
            <p className="preview-meta">
              {run.coverage_weeks} weeks coverage ·{" "}
              {items.length} unbatched · {batches.length} batch{batches.length !== 1 ? "es" : ""}
            </p>
          </div>
          <button className="preview-close" onClick={onClose}>
            <IoCloseCircle />
          </button>
        </div>

        <div className="preview-body">
          <div className="preview-left">

            {/* Batches */}
            {batches.length > 0 && (
              <div className="preview-batches">
                <p className="preview-section-label">Batches</p>
                <div className="preview-batch-list">
                  {batches.map(b => (
                    <div key={b.id} className="preview-batch-card">
                      <div className="preview-batch-info">
                        <span className="preview-batch-name">{b.batch_name}</span>
                        <span className="preview-batch-meta">{b.total_skus} SKUs · {b.total_units} units</span>
                        {(batchNotes[b.id] || b.notes) && (
                          <span className="preview-batch-note-preview">
                            📝 {batchNotes[b.id] ?? b.notes}
                          </span>
                        )}
                      </div>
                      <div className="preview-batch-actions">
                        <div className="preview-note-wrap">
                          <button
                            className={`preview-note-btn ${openNoteId === b.id ? "active" : ""}`}
                            onClick={() => setOpenNoteId(openNoteId === b.id ? null : b.id)}
                            title="Add notes"
                          >
                            📝
                          </button>
                          {openNoteId === b.id && (
                            <div className="preview-note-popover">
                              <textarea
                                className="preview-note-textarea"
                                placeholder="Add notes for this batch..."
                                defaultValue={batchNotes[b.id] ?? b.notes ?? ""}
                                id={`note-${b.id}`}
                                rows={3}
                              />
                              <div className="preview-note-popover-actions">
                                <button
                                  className="sh-btn primary"
                                  onClick={() => {
                                    const val = document.getElementById(`note-${b.id}`).value;
                                    saveBatchNoteById(b.id, val);
                                  }}
                                >
                                  Save
                                </button>
                                <button className="sh-btn ghost" onClick={() => setOpenNoteId(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          className="preview-batch-dl"
                          onClick={() => downloadBatch(b.id, b.batch_name)}
                          disabled={downloading === b.id}
                        >
                          {downloading === b.id ? "..." : <IoDownloadOutline />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Table */}
            <div className="preview-table-section">

              {/* Toolbar */}
              <div className="sh-toolbar">
                <input
                  className="sh-search"
                  placeholder="Search SKU, color, size..."
                  value={globalFilter}
                  onChange={e => setGlobalFilter(e.target.value)}
                />
                <div className="sh-toolbar-right">
                  {selected.size > 0 && (
                    <span className="sh-selected-pill">{selected.size} selected</span>
                  )}
                  {selected.size > 0 && !showBatchInput && (
                    <button className="sh-btn primary" onClick={() => setShowBatchInput(true)}>
                      <IoAdd /> Create batch
                    </button>
                  )}
                  {selected.size > 0 && showBatchInput && (
                    <div className="sh-batch-input-row">
                      <input
                        className="sh-batch-name-input"
                        placeholder={`Batch ${batches.length + 1}`}
                        value={newBatchName}
                        onChange={e => setNewBatchName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && createBatch()}
                        autoFocus
                      />
                      <button className="sh-btn primary" onClick={createBatch}>Confirm</button>
                      <button className="sh-btn ghost" onClick={() => setShowBatchInput(false)}>Cancel</button>
                    </div>
                  )}
                  {selected.size > 0 && (
                    <button className="sh-btn ghost" onClick={clearSelection}>Clear</button>
                  )}
                  {items.length > 0 && selected.size === 0 && (
                    <button className="sh-btn ghost" onClick={selectAll}>Select all</button>
                  )}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="preview-empty">All items have been assigned to batches.</div>
              ) : (
                <>
                  <div className="sh-table-wrap">
                    <table className="sh-table">
                      <thead>
                        {table.getHeaderGroups().map(hg => (
                          <tr key={hg.id} className="sh-thead-row">
                                <th className="sh-th"></th>
                            {hg.headers.map(header => (
                              <th
                                key={header.id}
                                className={`sh-th ${header.column.getCanSort() ? "sortable" : ""}`}
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                <div className="sh-th-inner">
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                  <SortIcon column={header.column} />
                                </div>
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {table.getRowModel().rows.map((row, i) => (
                          <tr
                            key={row.id}
                            className={`sh-row ${selected.has(row.original.id) ? "selected" : ""} ${i % 2 === 1 ? "stripe" : ""}`}
                            onClick={() => toggleSelect(row.original.id)}
                          >
                            <td className="sh-td">
                              <div className={`sh-checkbox ${selected.has(row.original.id) ? "checked" : ""}`}>
                                {selected.has(row.original.id) && <IoCheckmark />}
                              </div>
                            </td>
                            {row.getVisibleCells().map(cell => (
                              <td key={cell.id} className="sh-td">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {table.getRowModel().rows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="sh-empty">No items match your search.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="sh-footer">
                    Showing {table.getRowModel().rows.length} of {items.length} SKUs · {totalUnbatched} total units
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: live summary */}
          <div className="preview-right">
            <p className="preview-section-label">Live Summary</p>
            <div className="preview-summary-stats">
              <div className="preview-stat">
                <span className="preview-stat-num">{totalUnbatched}</span>
                <span className="preview-stat-label">Unbatched units</span>
              </div>
              <div className="preview-stat">
                <span className="preview-stat-num">{totalBatched}</span>
                <span className="preview-stat-label">Batched units</span>
              </div>
            </div>
            <p className="preview-summary-subtitle">Blank shirts needed</p>
            <div className="preview-summary-table">
              {summary.length === 0 ? (
                <p className="preview-summary-empty">No unbatched items</p>
              ) : (
                summary.map(({ color, size, qty }) => (
                  <div key={`${color}-${size}`} className="preview-summary-row">
                    <span className="preview-summary-color">{color}</span>
                    <span className="preview-summary-size">{size}</span>
                    <span className="preview-summary-qty">{qty}</span>
                  </div>
                ))
              )}
            </div>
            <div className="preview-run-notes">
              <p className="preview-section-label">Run Notes</p>
              <textarea
                className="preview-run-notes-textarea"
                placeholder="Add notes for this production run..."
                value={runNotes}
                onChange={e => setRunNotes(e.target.value)}
                onBlur={() => saveRunNotes(runNotes)}
                rows={4}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}