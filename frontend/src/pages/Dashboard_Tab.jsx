import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "recharts";

const DAYS_COL = "total_days_of_supply_(including_units_from_open_shipments)";

export default function Dashboard_Tab_Light({ lowStockThreshold = null }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/restock/low-stock")
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
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
        
        <div className="dashHeaderRow">
          <h1 className="dashHeaderTitle">Inventory Overview</h1>
          <p className="dashHeaderDate">{today}</p>
        </div>
      </header>

      {/* ── Stat Cards ── */}
      <section className="statsGrid">
        <article className="statCard accentWarning">
          <div className="statCardStripe" />
          <div className="statCardTop">
            <span className="statCardLabel">Low Stock SKUs</span>
            <span className="statIconWrap warning">
              <IoAlertCircleOutline />
            </span>
          </div>
          <div className="statCardBody">
            <p className="statCardNum">{summary.lowStockCount}</p>
            <p className="statCardDesc">
              {lowStockThreshold !== null
                ? `SKUs with ≤ ${lowStockThreshold} units or Amazon-flagged.`
                : "SKUs Amazon has flagged as low stock."}
            </p>
          </div>
        </article>

        <article className="statCard accentDanger">
          <div className="statCardStripe" />
          <div className="statCardTop">
            <span className="statCardLabel">Out of Stock</span>
            <span className="statIconWrap danger">
              <HiOutlineArchiveBoxXMark />
            </span>
          </div>
          <div className="statCardBody">
            <p className="statCardNum">{summary.outOfStockCount}</p>
            <p className="statCardDesc">
              SKUs Amazon has flagged as out of stock.
            </p>
          </div>
        </article>

        <article className="statCard accentSuccess">
          <div className="statCardStripe" />
          <div className="statCardTop">
            <span className="statCardLabel">Inventory Pipeline</span>
            <span className="statIconWrap success">
              <IoTrendingUpOutline />
            </span>
          </div>
          <div className="statCardBody">
            <p className="statCardNum">{summary.pipelineCount}</p>
            <p className="statCardDesc">
              SKUs with ≤ 14 days of supply remaining.
            </p>
          </div>
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
            
          </div>

          <div className="chartArea">
            {chartData.length === 0 ? (
              <div className="emptyState">No chart data available.</div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 20, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="emberBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%"   stopColor="#ff6b1a" />
                      <stop offset="100%" stopColor="#ffaa33" />
                    </linearGradient>
                    <filter id="emberGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feFlood floodColor="#ff6b1a" floodOpacity="0.55" />
                      <feComposite in2="blur" operator="in" result="glow" />
                      <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#b89080" }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: "Units Sold (Last 30 Days)",
                      position: "insideBottomRight",
                      offset: -4,
                      fontSize: 11,
                      fill: "#b89080",
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={200}
                    tick={{ fontSize: 11, fill: "#7a5040" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "rgba(253,240,232,0.6)" }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 99, 99, 0]}
                    maxBarSize={14}
                    fill="url(#emberBar)"
                    filter="url(#emberGlow)"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

 <article className="quickLinksCard">
   <div className="qlHeader">
    <div>
      <p className="qlEyebrow">Navigation</p>
      <h3 className="qlTitle">Quick Links</h3>
    </div>
    
    </div>

  <div className="qlList">
    <div className="qlItem qlItemOrange" onClick={() => navigate("/upload_generate")}>
      <div className="qlItemAccent" />
      <div className="qlIconBox">
        <div className="qlIconBlob" />
        <span className="qlIconGlyph">↑</span>
      </div>
      <div className="qlText">
        <div className="qlLabelRow">
          <span className="qlLabel">Upload &amp; Generate</span>
          <span className="qlTag">Production</span>
        </div>
        <div className="qlSub">Create and submit a new production plan</div>
      </div>
      <div className="qlArrow"><span>›</span></div>
    </div>

    <div className="qlItem qlItemBlue" onClick={() => navigate("/details")}>
      <div className="qlItemAccent" />
      <div className="qlIconBox">
        <div className="qlIconBlob" />
        <span className="qlIconGlyph">◧</span>
      </div>
      <div className="qlText">
        <div className="qlLabelRow">
          <span className="qlLabel">Details</span>
          <span className="qlTag">Reports</span>
        </div>
        <div className="qlSub">Browse report history and saved reports</div>
      </div>
      <div className="qlArrow"><span>›</span></div>
    </div>

    <div className="qlItem qlItemRed" onClick={() => navigate("/warehouse")}>
      <div className="qlItemAccent" />
      <div className="qlIconBox">
        <div className="qlIconBlob" />
        <span className="qlIconGlyph">▦</span>
      </div>
      <div className="qlText">
        <div className="qlLabelRow">
          <span className="qlLabel">Warehouse</span>
          <span className="qlTag">Operations</span>
        </div>
        <div className="qlSub">Monitor and manage active production runs</div>
      </div>
      <div className="qlArrow"><span>›</span></div>
    </div>
  </div>

  
</article>
      </section>

      {/* ── Table ── */}
     {/*  <section className="panel tablePanel">
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
                  <td className="tdProduct">{r.product_name || "—"}</td>
                  <td className="tdMono">{r.fnsku || "—"}</td>
                  <td>{r.merchant_sku || "—"}</td>
                  <td className="tdMono">{r.asin || "—"}</td>
                  <td className="tdNum">{r.availableNum}</td>
                  <td className="tdNum">{r.daysSupplyNum || "—"}</td>
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
      </section> */}
    </div>
  );
}