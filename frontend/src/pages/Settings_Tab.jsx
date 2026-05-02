import React, { useState, useEffect } from 'react';
import './Settings_Tab.css';
import { IoCheckmarkCircle } from 'react-icons/io5';
import axios from 'axios';

function Settings_Tab({ lowStockThreshold, setLowStockThreshold }) {

  const [thresholdInput, setThresholdInput]         = useState(lowStockThreshold !== null ? String(lowStockThreshold) : '');
  const [thresholdSaved, setThresholdSaved]         = useState(false);
  const [thresholdError, setThresholdError]         = useState(null);
  const [coverageWeeks, setCoverageWeeks]           = useState('12');
  const [coverageWeeksSaved, setCoverageWeeksSaved] = useState(false);
  const [daysThresholdInput, setDaysThresholdInput] = useState('');
  const [daysThresholdSaved, setDaysThresholdSaved] = useState(false);

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/settings/coverage_weeks")
      .then(res => { if (res.data?.value) setCoverageWeeks(res.data.value); })
      .catch(() => {});
    axios.get("http://127.0.0.1:8000/settings/days_supply_threshold")
      .then(res => { if (res.data?.value && res.data.value !== "null") setDaysThresholdInput(res.data.value); })
      .catch(() => {});
  }, []);

  async function saveSetting(key, value) {
    await axios.post("http://127.0.0.1:8000/settings/save", { key, value: String(value) });
  }

  async function handleSaveThreshold() {
    const parsed = parseInt(thresholdInput, 10);
    const newValue = (!thresholdInput || isNaN(parsed) || parsed < 0) ? null : parsed;
    setLowStockThreshold(newValue);
    if (newValue !== null) localStorage.setItem("lowStockThreshold", String(newValue));
    else localStorage.removeItem("lowStockThreshold");
    try {
      await saveSetting("low_stock_threshold", newValue !== null ? String(newValue) : "null");
      setThresholdError(null);
    } catch { setThresholdError("Saved locally. Could not reach backend."); }
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2500);
  }

  async function handleResetThreshold() {
    setThresholdInput('');
    setLowStockThreshold(null);
    localStorage.removeItem("lowStockThreshold");
    try { await saveSetting("low_stock_threshold", "null"); } catch {}
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2500);
  }

  async function handleSaveCoverageWeeks() {
    const val = parseInt(coverageWeeks, 10);
    if (isNaN(val) || val < 1) return;
    try { await saveSetting("coverage_weeks", val); } catch {}
    setCoverageWeeksSaved(true);
    setTimeout(() => setCoverageWeeksSaved(false), 2500);
  }

  async function handleSaveDaysThreshold() {
    const val = parseInt(daysThresholdInput, 10);
    if (daysThresholdInput === '') {
      try { await saveSetting("days_supply_threshold", "null"); } catch {}
    } else if (!isNaN(val) && val > 0) {
      try { await saveSetting("days_supply_threshold", val); } catch {}
    }
    setDaysThresholdSaved(true);
    setTimeout(() => setDaysThresholdSaved(false), 2500);
  }

  const weekOptions = [4, 8, 12, 16, 20, 24];

  return (
    <div className="settingsPage">

      {/* ── Header ── */}
      <div className="settingsPageHeader">
        <h1 className="settingsPageTitle">Settings</h1>
        <p className="settingsPageSubtitle">
          Manage inventory alerts and production plan configuration.
        </p>
      </div>

      <div className="settingsSections">

        {/* ── Low Stock Threshold ── */}
        <div className="settingsSection">
          <p className="settingsSectionTag">Inventory Alerts</p>
          <div className="settingsSectionMeta">
            <h2 className="settingsSectionTitle">Low Stock Threshold</h2>
            <p className="settingsSectionDesc">
              By default, the dashboard uses Amazon's built-in alert system to flag
              low stock SKUs. Set a custom unit threshold to get earlier warnings
              before Amazon flags them.
            </p>
          </div>
          <div className="settingsSectionControls">
            <div className="settingsCurrentValue">
              <strong>
                {lowStockThreshold !== null ? `≤ ${lowStockThreshold} units` : 'Amazon default'}
              </strong>
            </div>
            <div className="settingsInputRow">
              <div className="settingsInputWrap">
                <input
                  className="settingsInput"
                  type="number"
                  min="0"
                  placeholder="e.g. 20"
                  value={thresholdInput}
                  onChange={e => { setThresholdInput(e.target.value); setThresholdSaved(false); setThresholdError(null); }}
                />
                <span className="settingsInputLabel">units</span>
              </div>
              <button className="settingsSaveBtn" onClick={handleSaveThreshold}>Save</button>
              <button className="settingsResetBtn" onClick={handleResetThreshold}>Reset to Default</button>
            </div>
            {thresholdSaved && !thresholdError && (
              <div className="settingsSavedMsg">
                <IoCheckmarkCircle />
                <span>{lowStockThreshold !== null ? `Flagging SKUs with ≤ ${lowStockThreshold} units.` : 'Reset to Amazon default alerts.'}</span>
              </div>
            )}
            {thresholdError && <div className="settingsErrorMsg"><span>{thresholdError}</span></div>}
            <div className="settingsHintBox">
              <p>Leave blank to rely solely on Amazon's <code>low_stock</code> alert flag.</p>
            </div>
          </div>
        </div>

        {/* ── Coverage Weeks ── */}
        <div className="settingsSection">
          <p className="settingsSectionTag">Production Plan</p>
          <div className="settingsSectionMeta">
            <h2 className="settingsSectionTitle">Inventory Coverage Target</h2>
            <p className="settingsSectionDesc">
              How many weeks of inventory to produce in each run. Calculated as
              (units sold × weeks ÷ 4) − current stock, rounded to the nearest
              valid quantity (minimum 6, multiples of 12).
            </p>
          </div>
          <div className="settingsSectionControls">
            <div className="settingsCurrentValue"><strong>{coverageWeeks}w</strong></div>
            <div className="settingsWeekOptions">
              {weekOptions.map(w => (
                <button
                  key={w}
                  className={`settingsToggleBtn ${coverageWeeks === String(w) ? 'active' : ''}`}
                  onClick={() => setCoverageWeeks(String(w))}
                >{w}w</button>
              ))}
            </div>
            <div className="settingsInputRow">
              <div className="settingsInputWrap">
                <input
                  className="settingsInput"
                  type="number"
                  min="1" max="52"
                  placeholder="custom"
                  value={coverageWeeks}
                  onChange={e => { setCoverageWeeks(e.target.value); setCoverageWeeksSaved(false); }}
                />
                <span className="settingsInputLabel">weeks</span>
              </div>
              <button className="settingsSaveBtn" onClick={handleSaveCoverageWeeks}>Save</button>
            </div>
            {coverageWeeksSaved && (
              <div className="settingsSavedMsg">
                <IoCheckmarkCircle />
                <span>Coverage target saved — {coverageWeeks} weeks.</span>
              </div>
            )}
            <div className="settingsHintBox">
              <p>Example: 12 weeks, 30 units/month sold → produce 90 − 20 on hand = 70 → rounded to <strong>72</strong>.</p>
            </div>
          </div>
        </div>

        {/* ── Days of Supply ── */}
        <div className="settingsSection">
          <p className="settingsSectionTag">Production Plan</p>
          <div className="settingsSectionMeta">
            <h2 className="settingsSectionTitle">Days of Supply Threshold</h2>
            <p className="settingsSectionDesc">
              Optionally include SKUs in the production run if their days of supply
              falls below this number — even if Amazon hasn't flagged them yet.
              Leave blank to rely only on Amazon's alert.
            </p>
          </div>
          <div className="settingsSectionControls">
            <div className="settingsCurrentValue">
              <strong>{daysThresholdInput ? `< ${daysThresholdInput}d` : 'Not set'}</strong>
            </div>
            <div className="settingsInputRow">
              <div className="settingsInputWrap">
                <input
                  className="settingsInput"
                  type="number"
                  min="1"
                  placeholder="e.g. 84"
                  value={daysThresholdInput}
                  onChange={e => { setDaysThresholdInput(e.target.value); setDaysThresholdSaved(false); }}
                />
                <span className="settingsInputLabel">days</span>
              </div>
              <button className="settingsSaveBtn" onClick={handleSaveDaysThreshold}>Save</button>
              <button className="settingsResetBtn" onClick={() => {
                setDaysThresholdInput('');
                setDaysThresholdSaved(false);
                saveSetting("days_supply_threshold", "null").catch(() => {});
              }}>Clear</button>
            </div>
            {daysThresholdSaved && (
              <div className="settingsSavedMsg">
                <IoCheckmarkCircle />
                <span>{daysThresholdInput ? `Including SKUs with < ${daysThresholdInput} days of supply.` : 'Cleared — using Amazon flags only.'}</span>
              </div>
            )}
            <div className="settingsHintBox">
              <p>Set to <strong>84</strong> (12 weeks) to match your coverage target and catch SKUs before Amazon flags them.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Settings_Tab;