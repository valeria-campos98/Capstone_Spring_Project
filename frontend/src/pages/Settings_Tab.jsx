import React, { useState } from 'react';
import './Settings_Tab.css';
import { IoCheckmarkCircle } from 'react-icons/io5';

function Settings_Tab({ lowStockThreshold, setLowStockThreshold }) {
  const [inputValue, setInputValue] = useState(
    lowStockThreshold !== null ? String(lowStockThreshold) : ''
  );
  const [saved, setSaved] = useState(false);

  function handleSave() {
    const parsed = parseInt(inputValue, 10);
    if (!inputValue || isNaN(parsed) || parsed < 0) {
      setLowStockThreshold(null); // reset to Amazon default
    } else {
      setLowStockThreshold(parsed);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    setInputValue('');
    setLowStockThreshold(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="settingsPage">

      <div className="settingsHero">
        <p className="settingsEyebrow">Configuration</p>
        <h1>Settings</h1>
        <p className="settingsSubtext">
          Customize how the dashboard flags and displays inventory alerts.
        </p>
      </div>

      <div className="settingsGrid">

        {/* Low Stock Threshold Card */}
        <div className="settingsCard">
          <div className="settingsCardHeader">
            <div>
              <p className="settingsCardEyebrow">Inventory Alerts</p>
              <h2 className="settingsCardTitle">Low Stock Threshold</h2>
            </div>
          </div>

          <p className="settingsCardDesc">
            By default, the dashboard uses Amazon's built-in alert system to flag
            low stock SKUs. You can set a custom unit threshold below — any SKU
            at or under that number will also be flagged as low stock, even if
            Amazon hasn't alerted it yet.
          </p>

          <div className="settingsCurrentBadge">
            <span>Current setting: </span>
            <strong>
              {lowStockThreshold !== null
                ? `≤ ${lowStockThreshold} units`
                : 'Amazon default alerts only'}
            </strong>
          </div>

          <div className="settingsInputRow">
            <div className="settingsInputWrap">
              <input
                className="settingsInput"
                type="number"
                min="0"
                placeholder="e.g. 20"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setSaved(false);
                }}
              />
              <span className="settingsInputLabel">units</span>
            </div>

            <button className="settingsSaveBtn" onClick={handleSave}>
              Save
            </button>

            <button className="settingsResetBtn" onClick={handleReset}>
              Reset to Default
            </button>
          </div>

          {saved && (
            <div className="settingsSavedMsg">
              <IoCheckmarkCircle />
              <span>
                {lowStockThreshold !== null
                  ? `Threshold saved — flagging SKUs with ≤ ${lowStockThreshold} units.`
                  : 'Reset to Amazon default alerts.'}
              </span>
            </div>
          )}

          <div className="settingsHintBox">
            <p>
              <strong>Tip:</strong> Leave blank or click "Reset to Default" to
              rely solely on Amazon's <code>low_stock</code> alert flag. Set a
              number (e.g. <strong>20</strong>) to get earlier warnings before
              Amazon flags them.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Settings_Tab;