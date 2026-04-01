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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DAYS_COL = "total_days_of_supply_(including_units_from_open_shipments)";

// Orange gradient for bars — darkest to lightest
const BAR_COLORS = [
  "#c45e10",
  "#E07B2A",
  "#f0944d",
  "#f5ab72",
  "#f9c49a",
  "#fcdcbf",
  "#fef0e4",
];

export default function Dashboard_Tab_Light({ lowStockThreshold = null }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/restock/low-stock")
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        console.log("API row sample:", data[0]);
        setRows(data);
      })
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
      daysSupplyNum:
        parseInt(String(r[DAYS_COL] ?? "0").replace("+", ""), 10) || 0,
      unitsSold: Number(r.units_sold_last_30_days ?? 0),
      alert: r.alert ?? null,
    }));
  }, [rows]);

  const isLowStock = (r) => {
    if (r.alert === "low_stock") return true;
    if (
      lowStockThreshold !== null &&
      r.availableNum > 0 &&
      r.availableNum <= lowStockThreshold
    )
      return true;
    return false;
  };

  const summary = useMemo(() => {
    const lowStockCount = normalizedRows.filter(isLowStock).length;
    const outOfStockCount = normalizedRows.filter(
      (r) => r.alert === "out_of_stock"
    ).length;
    const pipelineCount = normalizedRows.filter(
      (r) => r.daysSupplyNum > 7 && r.daysSupplyNum <= 14
    ).length;
    const criticalAlerts = lowStockCount + outOfStockCount;
    return { lowStockCount, outOfStockCount, pipelineCount, criticalAlerts };
  }, [normalizedRows, lowStockThreshold]);

  const alertRows = useMemo(() => {
    return normalizedRows.filter(
      (r) => r.alert === "out_of_stock" || isLowStock(r)
    );
  }, [normalizedRows, lowStockThreshold]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return alertRows;
    return alertRows.filter((r) => {
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
  }, [alertRows, query]);

  const getProductKey = (r) => {
    if (r.merchant_sku) {
      const parts = r.merchant_sku.split("-");
      return parts.length > 1 ? parts.slice(0, -1).join("-") : r.merchant_sku;
    }
    if (r.product_name) return r.product_name.split("|")[0].trim();
    return r.asin || "Item";
  };

  const chartData = useMemo(() => {
    const grouped = {};
    normalizedRows.forEach((r) => {
      const key = getProductKey(r);
      if (!grouped[key]) grouped[key] = 0;
      grouped[key] += r.unitsSold;
    });
    return Object.entries(grouped)
      .map(([label, value]) => ({
        label: label.length > 35 ? label.slice(0, 35) + "…" : label,
        value,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [normalizedRows]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chartTooltip">
          <p className="chartTooltipLabel">{label}</p>
          <p className="chartTooltipValue">
            {payload[0].value} units sold (30d)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="dashPage">

      {/* ── Header ── */}
      <header className="dashHeader">
        <p className="dashHeaderEyebrow">Inventory Management</p>
        <h1 className="dashHeaderTitle">Inventory Overview</h1>
        <p className="dashHeaderDate">{today}</p>
      </header>

      <div className="dashDivider" />

      {/* ── Stat Cards ── */}
      <section className="statsGrid">
        <article className="statCard accentWarning">
          <div className="statCardTop">
            <span className="statCardLabel">Low Stock SKUs</span>
            <span className="statIconWrap warning">
              <IoAlertCircleOutline />
            </span>
          </div>
          <p className="statCardNum">{summary.lowStockCount}</p>
          <div className="statBar">
            <div
              className="statBarFill warning"
              style={{ width: `${Math.min(summary.lowStockCount * 12, 100)}%` }}
            />
          </div>
          <p className="statCardDesc">
            {lowStockThreshold !== null
              ? `SKUs with ≤ ${lowStockThreshold} units or Amazon-flagged.`
              : "SKUs Amazon has flagged as low stock."}
          </p>
        </article>

        <article className="statCard accentDanger">
          <div className="statCardTop">
            <span className="statCardLabel">Out of Stock</span>
            <span className="statIconWrap danger">
              <HiOutlineArchiveBoxXMark />
            </span>
          </div>
          <p className="statCardNum">{summary.outOfStockCount}</p>
          <div className="statBar">
            <div
              className="statBarFill danger"
              style={{
                width: `${Math.min(summary.outOfStockCount / 10, 100)}%`,
              }}
            />
          </div>
          <p className="statCardDesc">
            SKUs Amazon has flagged as out of stock.
          </p>
        </article>

        <article className="statCard accentSuccess">
          <div className="statCardTop">
            <span className="statCardLabel">Inventory Pipeline</span>
            <span className="statIconWrap success">
              <IoTrendingUpOutline />
            </span>
          </div>
          <p className="statCardNum">{summary.pipelineCount}</p>
          <div className="statBar">
            <div
              className="statBarFill success"
              style={{
                width: `${Math.min(summary.pipelineCount * 15, 100)}%`,
              }}
            />
          </div>
          <p className="statCardDesc">
            SKUs with ≤ 14 days of supply remaining.
          </p>
        </article>
      </section>

      {/* ── Chart + Focus Panel ── */}
      <section className="mainGrid">
        <article className="panel chartPanel">
          <div className="panelHeader">
            <div>
              <p className="panelEyebrow">Sales Performance</p>
              <h3 className="panelTitle">Top Selling Products</h3>
            </div>
            <span className="panelBadge">{chartData.length} products</span>
          </div>

          <div className="chartArea">
            {chartData.length === 0 ? (
              <div className="emptyState">No chart data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 20, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: "Units Sold (Last 30 Days)",
                      position: "insideBottomRight",
                      offset: -4,
                      fontSize: 11,
                      fill: "#9ca3af",
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={200}
                    tick={{ fontSize: 12, fill: "#374151" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "#fff8f3" }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26}>
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={BAR_COLORS[i % BAR_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className="panel sidePanel">
          <div className="panelHeader">
            <div>
              <p className="panelEyebrow">Action Required</p>
              <h3 className="panelTitle">Restock Focus</h3>
            </div>
          </div>

          <div className="focusList">
            <div className="focusItem">
              <span className="focusIcon blue">
                <IoCubeOutline />
              </span>
              <div>
                <strong>{summary.criticalAlerts} critical alerts</strong>
                <p>Total SKUs flagged by Amazon as low or out of stock.</p>
              </div>
            </div>

            <div className="focusItem">
              <span className="focusIcon amber">
                <IoAlertCircleOutline />
              </span>
              <div>
                <strong>{summary.lowStockCount} low-stock SKUs</strong>
                <p>Monitor before they move into stockout status.</p>
              </div>
            </div>

            <div className="focusItem">
              <span className="focusIcon red">
                <HiOutlineArchiveBoxXMark />
              </span>
              <div>
                <strong>{summary.outOfStockCount} stockouts</strong>
                <p>Prioritize these in the reorder queue.</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* ── Table ── */}
      <section className="panel tablePanel">
        <div className="tableTopBar">
          <div>
            <p className="panelEyebrow">Detailed View</p>
            <h3 className="panelTitle">Flagged Items</h3>
          </div>
          <div className="searchWrap">
            <IoSearchOutline className="searchIcon" />
            <input
              className="searchInput"
              type="text"
              placeholder="Filter by product, FNSKU, SKU, or ASIN…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="tableScroll">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Product</th>
                <th>FNSKU</th>
                <th>Merchant SKU</th>
                <th>ASIN</th>
                <th>Available</th>
                <th>Days of Supply</th>
                <th>Status</th>
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
                  <td>{r.daysSupplyNum || "—"}</td>
                  <td>
                    <span
                      className={`statusBadge ${
                        r.alert === "out_of_stock"
                          ? "badgeDanger"
                          : "badgeWarning"
                      }`}
                    >
                      {r.alert === "out_of_stock"
                        ? "Out of Stock"
                        : r.alert === "low_stock"
                        ? "Low Stock"
                        : `≤ ${lowStockThreshold} units`}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="emptyCell">
                    No flagged items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="tableFootnote">
          Showing {filteredRows.length} of {alertRows.length} flagged item(s)
        </p>
      </section>
    </div>
  );
}