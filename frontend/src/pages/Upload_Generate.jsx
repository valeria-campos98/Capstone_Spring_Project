import { useState } from "react";
import FileUploader from "../components/FileUploader";
import axios from "axios";


export default function Upload_Generate() {
  const [restockInfo, setRestockInfo] = useState(null);
  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [databaseInfo, setDatabaseInfo] = useState(null);
  const [inventoryInfo, setInventoryInfo] = useState(null);

  async function downloadMaster() {
  try {
    const res = await axios.post(                         //LETS COME BACK TO IT!!!!!!!!!!!!!!!!!!!!!!!!!!!
      "http://localhost:8000/generate/master",
      null,
      { responseType: "blob" }
    );

    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = "master_dataset.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert("Failed to generate master file. Make sure required files are uploaded.");
    console.error(err);
  }
}

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1>Upload Reports</h1>
      <p>Upload the required files to generate the Master Dataset.</p>

      <div style={{ display: "grid", gap: 16 }}>
        <FileUploader
          label="Restock Report (CSV/XLSX) "
          accept=".csv,.xlsx,.xls"
          endpoint="/upload/restock"
          onUploaded={setRestockInfo}
        />

        <FileUploader
          label="Warehouse Location (XLSX) "
          accept=".xlsx,.xls"
          endpoint="/upload/warehouse"
          onUploaded={setWarehouseInfo}
        />

        <FileUploader
          label="SKU Database / Mapping (XLSX) "
          accept=".xlsx,.xls"
          endpoint="/upload/database"
          onUploaded={setDatabaseInfo}
        />

        <FileUploader
          label="Inventory Report (XLSX) "
          accept=".xlsx,.xls"
          endpoint="/upload/inventory"
          onUploaded={setInventoryInfo}
        />

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
          <h3>Upload Summary</h3>
          <ul>
            <li>Restock: {restockInfo ? "✅" : "❌"}</li>
            <li>Warehouse: {warehouseInfo ? "✅" : "❌"}</li>
            <li>Database: {databaseInfo ? "✅" : "❌"}</li>
            <li>Inventory: {inventoryInfo? "✅" : "❌"} </li>
          </ul>
          {/*<p style={{ fontSize: 13, color: "#555" }}>
            You can now generate Master File.
          </p>
          */}

          <button
          onClick={downloadMaster}
          disabled={!(restockInfo && warehouseInfo && databaseInfo)}
        >
          Generate Master File
        </button>
        </div>
      </div>
    </div>
  );
}