import { useState } from 'react'
import './App.css';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Details from './pages/Details';
import Dashboard_Tab from './pages/Dashboard_Tab';
import Settings_Tab from './pages/Settings_Tab';
import Upload_Generate from './pages/Upload_Generate';
import Home from './pages/Home';


function App() {
  // null means "use Amazon's alert column only" (default)
  // a number means "also flag anything at or below this unit count"
  const [lowStockThreshold, setLowStockThreshold] = useState(null);

  return (
    <>
      <Router>
        <Navbar />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route
            path='/dashboard'
            element={<Dashboard_Tab lowStockThreshold={lowStockThreshold} />}
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
        </Routes>
      </Router>
    </>
  );
}

export default App;