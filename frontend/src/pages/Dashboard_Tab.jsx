import React, { useEffect, useMemo, useState } from "react";
import "./Dashboard_Tab.css";
import axios from "axios";

export default function Dashboard_Tab() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/restock/low-stock")
      .then((res) => setRows(res.data))
      .catch(() => setRows([]));
  }, []);

  // filter rows by query
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const product = (r.product_name ?? "").toLowerCase();
      const fnsku = (r.fnsku ?? "").toLowerCase();
      const merchantSku = (r.merchant_sku ?? "").toLowerCase();
      const asin = (r.asin ?? "").toLowerCase();
      return (
        product.includes(q) ||
        fnsku.includes(q) ||
        merchantSku.includes(q) ||
        asin.includes(q)
      );
    });
  }, [rows, query]);

  return (
    <div className="dashboard-table-wrapper">
      <div className="dashboard-header">
        <h2>Low Stock Items</h2>

        <input
          className="filter-box"
          type="text"
          placeholder="Filter by product, FNSKU, Merchant SKU, ASIN..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="table-scroll">
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
            {filteredRows.map((r, i) => (
              <tr key={i}>
                <td>{r.product_name}</td>
                <td>{r.fnsku}</td>
                <td>{r.merchant_sku}</td>
                <td>{r.asin}</td>
                <td>{r.available}</td>
                <td>{r.total_days_of_supply}</td>
              </tr>
            ))}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, textAlign: "center" }}>
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
        Showing {filteredRows.length} item(s)
      </p>
    </div>
  );
}
