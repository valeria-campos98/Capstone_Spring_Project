import { useState, useEffect } from "react";
import FileUploader from "../components/FileUploader";
import axios from "axios";
import "./Upload_Generate.css";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { RiErrorWarningLine } from "react-icons/ri";
import { IoInformationCircleOutline, IoCheckmarkCircle, IoWarningOutline } from "react-icons/io5";
import ProductionPreview from "./ProductionPreview";

/* ── Inline icons (so no extra deps) ─────────────────────────── */
const CalendarIcon = (props) => (
  <svg className="calendar-icon" {...props} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4"/><path d="M16 2v4"/>
    <rect width="18" height="18" x="3" y="4" rx="2"/>
    <path d="M3 10h18"/>
  </svg>
);

const PlayIcon = (props) => (
  <svg className="play-icon" {...props} viewBox="0 0 10 12">
    <polygon points="2,1 9,6 2,11" fill="currentColor"/>
  </svg>
);

const SparklesIcon = (props) => (
  <svg className="sparkle-icon" {...props} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/><path d="M22 5h-4"/>
    <path d="M4 17v2"/><path d="M5 18H3"/>
  </svg>
);

export default function Upload_Generate() {
  const [restockInfo, setRestockInfo]     = useState(null);
  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [databaseInfo, setDatabaseInfo]   = useState(null);
  const [inventoryInfo, setInventoryInfo] = useState(null);
  const [uploadStatus, setUploadStatus]   = useState(null);

  const [activeRun, setActiveRun]             = useState(null);
  const [previewRun, setPreviewRun]           = useState(null);
  const [showActivePopup, setShowActivePopup] = useState(false);
  const [generating, setGenerating]           = useState(false);

  useEffect(() => {
    axios.get("http://localhost:8000/uploads/status")
      .then(res => {
        setUploadStatus(res.data);
        if (res.data?.has_uploads) setRestockInfo({ preloaded: true });
      })
      .catch(() => setUploadStatus(null));

    axios.get("http://localhost:8000/upload/database-status")
      .then(res => { if (res.data?.loaded) setDatabaseInfo({ preloaded: true }); })
      .catch(() => {});

    axios.get("http://localhost:8000/production-runs/active")
      .then(res => { if (res.data) setActiveRun(res.data); })
      .catch(() => {});
  }, []);

  function handleRestockUploaded(info) {
    setRestockInfo(info);
    axios.get("http://localhost:8000/uploads/status")
      .then(res => setUploadStatus(res.data))
      .catch(() => {});
  }

  async function handleGenerateClick() {
    if (activeRun && activeRun.unbatched_count > 0) {
      setShowActivePopup(true);
      return;
    }
    await generateNewRun();
  }

  async function generateNewRun() {
    setGenerating(true);
    setShowActivePopup(false);
    try {
      const res = await axios.post("http://localhost:8000/production-runs/create");
      setPreviewRun(res.data);
      setActiveRun(res.data);
    } catch (err) {
      const detail = err?.response?.data?.detail || "Failed to generate production plan.";
      alert(detail);
    }
    setGenerating(false);
  }

  async function continueExistingRun() {
    setShowActivePopup(false);
    try {
      const res = await axios.get(`http://localhost:8000/production-runs/${activeRun.id}`);
      setPreviewRun(res.data);
    } catch {
      alert("Failed to load existing run.");
    }
  }

  async function abandonAndStartFresh() {
    try {
      await axios.post(`http://localhost:8000/production-runs/${activeRun.id}/abandon`);
      setActiveRun(null);
      await generateNewRun();
    } catch {
      alert("Failed to abandon run.");
    }
  }

  async function downloadMaster() {
    try {
      const res = await axios.post("http://localhost:8000/generate/master", null, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "master_dataset.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate master file.");
    }
  }

  /* ── Derived ── */
  const completedCount = [restockInfo, warehouseInfo, databaseInfo, inventoryInfo].filter(Boolean).length;
  const progressPct = (completedCount / 4) * 100;
  const hasActiveRun = !!(activeRun && activeRun.unbatched_count > 0);
  const showBannersRow = !!uploadStatus || hasActiveRun;

  return (
    <div className="upload-page">
      <h1 className="upload-title">Upload Reports</h1>
      <p className="upload-subtitle">
        Upload the required files to generate the Master Dataset.
      </p>

      {/* ── Banners row ── */}
      {showBannersRow && (
        <div className="banners-row">
          {uploadStatus && (
            uploadStatus.has_uploads ? (
              <div className="status-banner has-data">
                <div className="status-icon"><IoWarningOutline /></div>
                <div className="status-content">
                  <div className="status-label">Last Saved Report</div>
                  <div className="status-title">{uploadStatus.last_upload.file_name}</div>
                  <div className="status-meta">
                    <CalendarIcon />
                    <span>
                      {uploadStatus.last_upload.window_label} · {uploadStatus.last_upload.rows} SKUs
                    </span>
                  </div>
                  <div className="status-warning">{uploadStatus.message}</div>
                </div>
              </div>
            ) : (
              <div className="status-banner no-data">
                <div className="status-icon"><IoInformationCircleOutline /></div>
                <div className="status-content">
                  <div className="status-label">No Reports Saved Yet</div>
                  <div className="status-warning">{uploadStatus.message}</div>
                </div>
              </div>
            )
          )}

          {hasActiveRun && (
            <div className="run-banner">
              <div className="run-label">Active Production Run</div>
              <div className="run-title">{activeRun.run_name}</div>
              <div className="run-detail">
                {activeRun.unbatched_count} unbatched items remaining
              </div>
              <button className="open-run-btn" onClick={continueExistingRun}>
                <PlayIcon />
                Open Run
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Upload cards (2x2) ── */}
      <div className="upload-grid">
        <div className="upload-card">
          <span className="card-tag">CSV / XLSX</span>
          <div className="card-title">Restock Report</div>
          <FileUploader
            label="Restock Report (CSV/XLSX)"
            accept=".csv,.xlsx,.xls"
            endpoint="/upload/restock"
            onUploaded={handleRestockUploaded}
          />
        </div>
        <div className="upload-card">
          <span className="card-tag">XLSX</span>
          <div className="card-title">Warehouse Location</div>
          <FileUploader
            label="Warehouse Location (XLSX)"
            accept=".xlsx,.xls"
            endpoint="/upload/warehouse"
            onUploaded={setWarehouseInfo}
          />
        </div>
        <div className="upload-card">
          <span className="card-tag">XLSX</span>
          <div className="card-title">SKU Database / Mapping</div>
          <FileUploader
            label="SKU Database / Mapping (XLSX)"
            accept=".xlsx,.xls"
            endpoint="/upload/database"
            onUploaded={setDatabaseInfo}
          />
        </div>
        <div className="upload-card">
          <span className="card-tag">XLSX</span>
          <div className="card-title">Inventory Report</div>
          <FileUploader
            label="Inventory Report (XLSX)"
            accept=".xlsx,.xls"
            endpoint="/upload/inventory"
            onUploaded={setInventoryInfo}
          />
        </div>
      </div>

      {/* ── Upload progress + actions ── */}
      <div className="progress-panel">
        <div className="progress-header">Upload Progress</div>

        <ul className="progress-list">
          <li className="progress-row">
            <span>Restock Report</span>
            {restockInfo
              ? <IoMdCheckmarkCircleOutline className="icon success" />
              : <RiErrorWarningLine className="icon error" />}
          </li>
          <li className="progress-row">
            <span>Warehouse Location</span>
            {warehouseInfo
              ? <IoMdCheckmarkCircleOutline className="icon success" />
              : <RiErrorWarningLine className="icon error" />}
          </li>
          <li className="progress-row">
            <span>SKU Database / Mapping</span>
            {databaseInfo
              ? <IoMdCheckmarkCircleOutline className="icon success" />
              : <RiErrorWarningLine className="icon error" />}
          </li>
          <li className="progress-row">
            <span>Inventory Report</span>
            {inventoryInfo
              ? <IoMdCheckmarkCircleOutline className="icon success" />
              : <RiErrorWarningLine className="icon error" />}
          </li>
        </ul>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="progress-actions">
          <button
            className="action-btn primary"
            onClick={handleGenerateClick}
            disabled={!(restockInfo && databaseInfo) || generating}
          >
            <SparklesIcon />
            {generating ? "Generating..." : "Generate Production Plan"}
          </button>
          <button
            className="action-btn secondary"
            onClick={downloadMaster}
            disabled={!(restockInfo && warehouseInfo && databaseInfo)}
          >
            <SparklesIcon />
            Generate Master File
          </button>
        </div>
      </div>

      {/* ── Active Run Warning Popup ── */}
      {showActivePopup && activeRun && (
        <div className="popup-backdrop" onClick={() => setShowActivePopup(false)}>
          <div className="popup-modal" onClick={e => e.stopPropagation()}>
            <div className="popup-icon">⚠️</div>
            <h3 className="popup-title">Active Production Run</h3>
            <p className="popup-body">
              You have an active run <strong>"{activeRun.run_name}"</strong> with{" "}
              <strong>{activeRun.unbatched_count} unbatched items</strong>.
            </p>
            <p className="popup-body">
              Starting fresh will remove those unbatched items. They'll reappear
              naturally next time you upload a new report if they still need restocking.
            </p>
            <div className="popup-actions">
              <button className="popup-btn secondary" onClick={continueExistingRun}>
                Continue Existing Run
              </button>
              <button className="popup-btn danger" onClick={abandonAndStartFresh}>
                Start Fresh
              </button>
              <button className="popup-btn ghost" onClick={() => setShowActivePopup(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Production Preview Modal ── */}
      {previewRun && (
        <ProductionPreview
          run={previewRun}
          onClose={() => setPreviewRun(null)}
          onBatchCreated={() => {
            axios.get("http://localhost:8000/production-runs/active")
              .then(res => setActiveRun(res.data))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
