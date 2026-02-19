import React from 'react'
import './Dashboard_Tab.css';
import { useEffect, useState } from "react";
import axios from "axios";

export default function Dashboard_Tab() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/restock/low-stock")
      .then(res => setRows(res.data))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="dashboard-table-wrapper">
      <h2>Low Stock Items</h2>

      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>FNSKU</th>
            <th>Merchant SKU</th>
            <th>ASIN</th>
            <th>Available</th>
            <th>Days of Supply</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.product_name}</td>
              <td>{r.fnsku}</td>
              <td>{r.merchant_sku}</td>
              <td>{r.asin}</td>
              <td>{r.available}</td>
              <td>{r.total_days_of_supply}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
