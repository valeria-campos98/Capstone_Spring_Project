import { useState } from "react";
import FileUploader from "../components/FileUploader";
import axios from "axios";
import "./Upload_Generate.css";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { RiErrorWarningLine } from "react-icons/ri";


export default function Upload_Generate() {
  const [restockInfo, setRestockInfo] = useState(null);
  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [databaseInfo, setDatabaseInfo] = useState(null);
  const [inventoryInfo, setInventoryInfo] = useState(null);

  async function downloadMaster() {
  try {
    const res = await axios.post(                         
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
    <div className="upload-page">
      <h1 className= "upload-title">Upload Reports</h1>
      <p className="upload-subtitle">
      Upload the required files to generate the Master Dataset.</p>

    
      <div className = "upload-grid">
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

        <div className = "upload-summary"> 
          <h3>Upload Progress</h3>
          <ul>
            <li>Restock: {restockInfo ? <IoMdCheckmarkCircleOutline className="icon success" /> : <RiErrorWarningLine className="icon error" />}</li>
            <li>Warehouse: {warehouseInfo ? <IoMdCheckmarkCircleOutline className="icon success" /> : <RiErrorWarningLine className="icon error" />}</li>
            <li>Database: {databaseInfo ? <IoMdCheckmarkCircleOutline className="icon success" />  : <RiErrorWarningLine className="icon error" />}</li>
            <li>Inventory: {inventoryInfo? <IoMdCheckmarkCircleOutline className="icon success" /> : <RiErrorWarningLine className="icon error" />} </li>
          </ul>
          

          <button
          className="generate-button"
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