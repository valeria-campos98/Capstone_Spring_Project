import React, { useEffect, useMemo, useState } from "react";
import "./Dashboard_Tab.css";
import axios from "axios";
import {
  IoAlertCircleOutline,
  IoCubeOutline,
  IoTrendingUpOutline,
  IoSearchOutline,
} from "react-icons/io5";
import { HiOutlineArchiveBoxXMark } from "react-icons/hi2";

export default function Dashboard_Tab_Light() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/restock/low-stock")
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRows([]));
  }, []);

  const normalizedRows = useMemo(() => {
    return rows.map((r, index) => ({
      ...r,
      id:
        r.asin ||
        r.merchant_sku ||
        r.fnsku ||
        `${r.product_name || "item"}-${index}`,
      availableNum: Number(r.available ?? 0),
      daysSupplyNum: Number(r.total_days_of_supply ?? 0),
    }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedRows;

    return normalizedRows.filter((r) => {
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
  }, [normalizedRows, query]);

  const summary = useMemo(() => {
  const lowStockCount = normalizedRows.filter(
    (r) => r.availableNum > 0 && r.availableNum <= 10
  ).length;

  const outOfStockCount = normalizedRows.filter(
    (r) => r.availableNum === 0
  ).length;

  const pipelineCount = normalizedRows.filter(
    (r) => r.daysSupplyNum > 7 && r.daysSupplyNum <= 14
  ).length;

  const criticalAlerts = normalizedRows.filter(
    (r) => r.availableNum <= 5 || r.daysSupplyNum <= 7
  ).length;

  return {
    lowStockCount,
    outOfStockCount,
    pipelineCount,
    criticalAlerts,
  };
}, [normalizedRows]);

  const heroMessage = useMemo(() => {
    if (summary.criticalAlerts === 0) {
      return "Inventory pipeline looks stable right now.";
    }

    return `${summary.criticalAlerts} SKU${
      summary.criticalAlerts === 1 ? "" : "s"
    } need attention based on stock or days of supply.`;
  }, [summary.criticalAlerts]);

 const chartData = useMemo(() => {
  return [...normalizedRows]
    .map((r) => {
      const estimatedVelocity =
        r.daysSupplyNum > 0 ? r.availableNum / r.daysSupplyNum : 0;

      return {
        label: r.product_name || r.merchant_sku || r.asin || "Item",
        value: Number(estimatedVelocity.toFixed(2)),
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);
}, [normalizedRows]);

  const maxChartValue = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map((item) => item.value), 1);
  }, [chartData]);

  return (
    <div className="dashboardPageLight">
      <section className="heroBannerLight">
        <div>
          <p className="eyebrowLight">Capstone Inventory Dashboard</p>
          <h1>Inventory Overview</h1>
          <p className="heroSubtextLight">{heroMessage}</p>
        </div>

        <div className="heroBadgeLight">
          <span>Live restock view</span>
        </div>
      </section>

      <section className="statsGridLight">
        <article className="statCardLight">
          <div className="statHeaderLight">
            <span>Low Stock SKUs</span>
            <IoAlertCircleOutline className="statIconLight warningLight" />
          </div>

          <h2>{summary.lowStockCount}</h2>

          <div className="progressTrackLight">
            <div
              className="progressFillLight warningFillLight"
              style={{ width: `${Math.min(summary.lowStockCount * 12, 100)}%` }}
            />
          </div>

          <p>Items with available units between 1 and 10.</p>
        </article>

        <article className="statCardLight">
          <div className="statHeaderLight">
            <span>Out of Stock</span>
            <HiOutlineArchiveBoxXMark className="statIconLight dangerLight" />
          </div>

          <h2>{summary.outOfStockCount}</h2>

          <div className="progressTrackLight">
            <div
              className="progressFillLight dangerFillLight"
              style={{ width: `${Math.min(summary.outOfStockCount * 18, 100)}%` }}
            />
          </div>

          <p>Products that currently show zero available units.</p>
        </article>

        <article className="statCardLight">
          <div className="statHeaderLight">
           
            <span>Inventory Pipeline</span>
            <IoTrendingUpOutline className="statIconLight successLight" />
          </div>

          <h2>{summary.pipelineCount}</h2>

          <div className="progressTrackLight">
            <div
              className="progressFillLight successFillLight"
              style={{
                 width: `${Math.min(summary.pipelineCount * 15, 100)}%`
              }}
            />
          </div>

          <p>SKUs approaching reorder threshold (≤14 days of supply)</p>
        </article>
      </section>

      <section className="mainGridLight">
        <article className="panelLight chartPanelLight">
          <div className="panelHeaderLight">
            <div>
              <p className="panelEyebrowLight">Priority view</p>
              <h3>Top Selling Products</h3>
            </div>

            <div className="panelPillLight">{chartData.length} critical items</div>
          </div>

          <div className="chartAreaLight">
            {chartData.length === 0 ? (
              <div className="emptyStateLight">No chart data available.</div>
            ) : (
              chartData.map((item) => (
                <div key={item.label} className="chartRowLight">
                  <span className="chartLabelLight">{item.label}</span>

                  <div className="chartBarTrackLight">
                    <div
                      className="chartBarFillLight"
                      style={{ width: `${(item.value / maxChartValue) * 100}%` }}
                    />
                  </div>

                  <span className="chartValueLight">{item.value}/day</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panelLight sidePanelLight">
          <div className="panelHeaderLight">
            <div>
              <p className="panelEyebrowLight">Action summary</p>
              <h3>Restock Focus</h3>
            </div>
          </div>

          <div className="focusListLight">
            <div className="focusItemLight">
              <IoCubeOutline className="focusIconLight" />
              <div>
                <strong>{summary.criticalAlerts} critical alerts</strong>
                <p>Available ≤ 5 units or days of supply ≤ 7.</p>
              </div>
            </div>

            <div className="focusItemLight">
              <IoAlertCircleOutline className="focusIconLight" />
              <div>
                <strong>{summary.lowStockCount} low-stock SKUs</strong>
                <p>Monitor these before they move into stockout status.</p>
              </div>
            </div>

            <div className="focusItemLight">
              <HiOutlineArchiveBoxXMark className="focusIconLight" />
              <div>
                <strong>{summary.outOfStockCount} stockouts</strong>
                <p>These should be prioritized in the reorder queue.</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="panelLight tablePanelLight">
        <div className="tableTopBarLight">
          <div>
            <p className="panelEyebrowLight">Detailed view</p>
            <h3>Low Stock Items</h3>
          </div>

          <div className="searchWrapLight">
            <IoSearchOutline className="searchIconLight" />
            <input
              className="filterBoxLight"
              type="text"
              placeholder="Filter by product, FNSKU, Merchant SKU, or ASIN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="tableScrollLight">
          <table className="dashboardTableLight">
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
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.product_name || "—"}</td>
                  <td>{r.fnsku || "—"}</td>
                  <td>{r.merchant_sku || "—"}</td>
                  <td>{r.asin || "—"}</td>
                  <td>{r.availableNum}</td>
                  <td>{r.daysSupplyNum}</td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="emptyTableCellLight">
                    No matches found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="tableFootnoteLight">Showing {filteredRows.length} item(s)</p>
      </section>
    </div>
  );
}