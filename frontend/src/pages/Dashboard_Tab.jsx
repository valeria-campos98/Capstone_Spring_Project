import React, { useEffect, useMemo, useState } from "react";
import "./Dashboard_Tab.css";
import axios from "axios";
import low_stock_image from '../assets/low_stock_image.png'
import Out_of_stock from '../assets/Out_of_stock.png'
import total_stock from '../assets/total_stock.png'
import { CgArrowTopRight } from "react-icons/cg";




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

   const LOW_STOCK_THRESHOLD = 10;

  const summary = useMemo(() => {
    const lowStockCount = rows.filter((r) => {
      const available = Number(r.available ?? 0);
      return available > 0 && available <= LOW_STOCK_THRESHOLD;
    }).length;

    const outOfStockCount = rows.filter(
      (r) => Number(r.available ?? 0) === 0
    ).length;

    const keyFor = (r) =>
      r.asin || r.merchant_sku || r.fnsku || r.product_name || "UNKNOWN";

    const totalProductsCount = new Set(rows.map(keyFor)).size;

    return { lowStockCount, outOfStockCount, totalProductsCount };
  }, [rows]);

  return (

   
    
     <div className="dashWrapper" >

      
        <div className=" dashHeader">
          <span className = "dashTop">Dashboard</span>
        </div>

     <div className = "innerContainer">
        <div className="containerOne">
         <div  className="dCardContainer">

            <div className="dashCard">
              <img src = {low_stock_image} alt="low stock"/>
              <span>Low Stock ({summary.lowStockCount}) </span>

           <CgArrowTopRight 
              className="cornerIcon"
              onClick={() => alert("Clicked!")}
                                           />
            </div>
            <div className="dashCard1">
              <img src ={ Out_of_stock} alt= "out of stock"/>
              <span>Out of Stock ({summary.outOfStockCount})</span>
              <CgArrowTopRight 
              className="cornerIcon"
              onClick={() => alert("Clicked!")}
                                           />
            </div>
            <div className="dashCard2">
              <img src ={ total_stock} alt= "total stock"/>
              <span>Total Products ({summary.totalProductsCount})</span>
              <CgArrowTopRight 
              className="cornerIcon"
              onClick={() => alert("Clicked!")}
                                           />
              </div>
          </div>
        </div>

        <div className = " containerTwo">
     

        </div>

     </div>
      

    <div className="dashBody">
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
    </div>
    </div>
  );
}
