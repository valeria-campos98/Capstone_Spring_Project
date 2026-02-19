import { useState } from "react";
import axios from "axios";


/* why 8000 not 5174?""*/
const API_BASE = "http://localhost:8000";



export default function FileUploader({label, accept, endpoint,onUploaded}){

     const [file, setFile] = useState(null);
     const [status, setStatus] = useState("idle"); // idle | uploading | success | error
     const [uploadProgress, setUploadProgress] = useState(0);
     const [errorMsg, setErrorMsg] = useState("");

    /* its null but basically says, "you have a file with all the details or you dont" */
    

    function handleFileChange(e) {
   
        /*setFile(e.target.files[0]); /*we are passing the first file*/
        const f = e.target.files?.[0] || null;
        /*Below resets UI/Upload State*/
        setFile(f);
        setStatus("idle");
        setUploadProgress(0);
        setErrorMsg("");
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
      onUploaded?.(res.data); /* res.data is exactly the object returned from FastAPI*/ 
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

    

/*whenever input onChange gets called , which will be called whenever we select the input file in our browser */
return (
    /* we want to take the file form the input and put it in a state , to
    do that you have to access the onChange event timer*/
    
<div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{label}</h3>

      <input type="file" accept={accept} onChange={handleFileChange} />

      {file && (
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <div><b>Name:</b> {file.name}</div>
          <div><b>Size:</b> {(file.size / 1024).toFixed(2)} KB</div>
        </div>
      )}

      {status === "uploading" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 10, background: "#eee", borderRadius: 999 }}>
            <div
              style={{
                height: 10,
                width: `${uploadProgress}%`,
                background: "#3b82f6",
                borderRadius: 999,
                transition: "width 200ms",
              }}
            />
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>{uploadProgress}% uploaded</div>
        </div>
      )}

      {file && status !== "uploading" && (
        <button style={{ marginTop: 12 }} onClick={handleFileUpload}>
          Upload
        </button>
      )}

      {status === "success" && (
        <p style={{ marginTop: 10, color: "green" }}> Uploaded!</p>
      )}

      {status === "error" && (
        <p style={{ marginTop: 10, color: "crimson" }}>❌ {errorMsg}</p>
      )}
    </div>

);
}