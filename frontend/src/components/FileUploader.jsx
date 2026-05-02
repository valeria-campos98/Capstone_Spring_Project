import { useState, useRef } from "react";
import axios from "axios";
import "./FileUploader.css";

const API_BASE = "http://localhost:8000";

export default function FileUploader({ label, accept, endpoint, onUploaded }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | success | error
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setStatus("idle");
    setUploadProgress(0);
    setErrorMsg("");
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    pickFile(f);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0] || null;
    pickFile(f);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  async function handleFileUpload() {
    if (!file) return;

    setStatus("uploading");
    setUploadProgress(0);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${API_BASE}${endpoint}`, formData, {
        onUploadProgress: (evt) => {
          const total = evt.total || 0;
          const loaded = evt.loaded || 0;
          const progress = total ? Math.round((loaded * 100) / total) : 0;
          setUploadProgress(progress);
        },
      });

      setStatus("success");
      setUploadProgress(100);
      onUploaded?.(res.data); /* res.data is exactly the object returned from FastAPI */
    } catch (err) {
      setStatus("error");
      setUploadProgress(0);

      console.log("UPLOAD ERROR:", err);

      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Upload failed. Please try again.";

      setErrorMsg(detail);
    }
  }

  const dropzoneClass =
    "fu-dropzone" +
    (isDragOver ? " is-dragover" : "") +
    (file ? " has-file" : "");

  return (
    <div className="fu-root">
      {/* Hidden native input — opened by clicking dropzone */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="fu-input"
        aria-label={label}
      />

      <div
        className={dropzoneClass}
        onClick={openFilePicker}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFilePicker();
          }
        }}
      >
        {file ? (
          <div className="fu-file-line">
            <span className="fu-file-name" title={file.name}>{file.name}</span>
            <span className="fu-file-size">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        ) : (
          <>
            <svg className="fu-icon" viewBox="0 0 24 24" fill="none"
                 stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <path d="M12 3 v12"/>
              <path d="M7 8 l5-5 l5 5"/>
            </svg>
            <span className="fu-text">Browse file or drag &amp; drop</span>
          </>
        )}
      </div>

      {status === "uploading" && (
        <div className="fu-progress">
          <div className="fu-progress-track">
            <div className="fu-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <div className="fu-progress-text">{uploadProgress}% uploaded</div>
        </div>
      )}

      {file && status === "idle" && (
        <button className="fu-upload-btn" onClick={handleFileUpload}>
          Upload
        </button>
      )}

      {status === "success" && (
        <p className="fu-status fu-status-success">✓ Uploaded</p>
      )}

      {status === "error" && (
        <p className="fu-status fu-status-error">❌ {errorMsg}</p>
      )}
    </div>
  );
}
