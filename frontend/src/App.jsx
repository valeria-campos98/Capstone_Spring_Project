import { useState, useEffect } from 'react'
import './App.css';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Navigate } from "react-router-dom";
import Details from './pages/Details';
import Dashboard_Tab from './pages/Dashboard_Tab';
import Settings_Tab from './pages/Settings_Tab';
import Upload_Generate from './pages/Upload_Generate';
import Home from './pages/Home';
import Warehouse from './pages/Warehouse';
import axios from 'axios';

// Wrapper so we can use useLocation inside Router
function AppInner({ lowStockThreshold, setLowStockThreshold, settingsLoaded }) {
  const location = useLocation();
  const isWarehouse = location.pathname === '/warehouse';

  return (
    <>
      {/* Hide navbar entirely on warehouse page */}
      {!isWarehouse && <Navbar />}
      <Routes>
        <Route path="/" element ={<Navigate to="/dashboard" replace />} />
        <Route
          path='/dashboard'
          element={
            settingsLoaded
              ? <Dashboard_Tab lowStockThreshold={lowStockThreshold} />
              : null
          }
        />
        <Route path='/details' element={<Details />} />
        <Route
          path='/settings'
          element={
            <Settings_Tab
              lowStockThreshold={lowStockThreshold}
              setLowStockThreshold={setLowStockThreshold}
            />
          }
        />
        <Route path='/upload_generate' element={<Upload_Generate />} />
        <Route path='/warehouse'       element={<Warehouse />} />
      </Routes>
    </>
  );
}

function App() {
  const [lowStockThreshold, setLowStockThreshold] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/settings/low_stock_threshold")
      .then((res) => {
        const val = res.data?.value;
        if (val !== null && val !== undefined && val !== "null") {
          setLowStockThreshold(Number(val));
        } else {
          setLowStockThreshold(null);
        }
      })
      .catch(() => {
        const saved = localStorage.getItem("lowStockThreshold");
        if (saved !== null && saved !== "null") {
          setLowStockThreshold(Number(saved));
        }
      })
      .finally(() => setSettingsLoaded(true));
  }, []);

  return (
    <Router>
      <AppInner
        lowStockThreshold={lowStockThreshold}
        setLowStockThreshold={setLowStockThreshold}
        settingsLoaded={settingsLoaded}
      />
    </Router>
  );
}

export default App;