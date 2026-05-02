import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ outOfStock: 0, lowStock: 0 });
  const [activity, setActivity] = useState({
    lastUpload: 'Apr 5',
    uploadCount: 0,
    lastRunUnits: 354,
    lastRunDate: 'Mar 1',
  });

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/restock/low-stock')
      .then(res => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setStats({
          outOfStock: rows.filter(r => r.alert === 'out_of_stock').length,
          lowStock:   rows.filter(r => r.alert === 'low_stock').length,
        });
      })
      .catch(() => {});

    axios.get('http://127.0.0.1:8000/uploads/history')
      .then(res => {
        const uploads = Array.isArray(res.data) ? res.data : [];
        if (!uploads.length) return;
        const label = new Date(uploads[0].upload_date)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setActivity(a => ({ ...a, lastUpload: label, uploadCount: uploads.length }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="home-page">
      <div className="hero">
        <img
          src="/src/assets/t-shirts_home.jpg"
          className="hero-img"
          alt="shirts on hangers"
        />
        <div className="hero-overlay" />

        <div className="hero-content">

          {/* ── Top bar ── */}
          <div className="hero-top-bar">
            <span className="hero-brand">Maventee · Ops</span>
          </div>

          {/* ── Middle — title left, cards right ── */}
          <div className="hero-middle">

            {/* Left — title */}
            <div className="hero-left">
              <p className="hero-tag">
                <span className="hero-tag-dot" />
                Inventory · Production · Planning
              </p>
              <h1 className="hero-title">
                From restock<br />
                to <em>production</em><br />
                in seconds.
              </h1>
            </div>

            {/* Right — staggered cards */}
            <div className="hero-cards">
              <div className="cards-col left-col">
                <div className="stat-card cream" onClick={() => navigate('/upload_generate')}>
                  <div className="card-top">
                    <span className="card-label orange">Production plan</span>
                    <span className="card-num orange">{activity.lastRunUnits}</span>
                    <span className="card-context dark">Units · last run {activity.lastRunDate}</span>
                  </div>
                  <div className="card-btn cream-btn">
                    <span className="card-btn-label">Upload & Generate</span>
                    <span className="card-btn-arr">→</span>
                  </div>
                </div>
                <div className="stat-card white" onClick={() => navigate('/dashboard')}>
                  <div className="card-top">
                    <span className="card-label dark">Out of stock</span>
                    <span className="card-num dark">{stats.outOfStock}</span>
                    <span className="card-context dark">SKUs with 0 available units</span>
                  </div>
                  <div className="card-btn dark-btn">
                    <span className="card-btn-label">Dashboard</span>
                    <span className="card-btn-arr">→</span>
                  </div>
                </div>
              </div>

              <div className="cards-col right-col">
                <div className="stat-card white" onClick={() => navigate('/dashboard')}>
                  <div className="card-top">
                    <span className="card-label dark">Low stock</span>
                    <span className="card-num dark">{stats.lowStock}</span>
                    <span className="card-context dark">Amazon-flagged SKUs</span>
                  </div>
                  <div className="card-btn dark-btn">
                    <span className="card-btn-label">Dashboard</span>
                    <span className="card-btn-arr">→</span>
                  </div>
                </div>
                <div className="stat-card navy" onClick={() => navigate('/details')}>
                  <div className="card-top">
                    <span className="card-label light">Reports saved</span>
                    <span className="card-num light">{activity.uploadCount}</span>
                    <span className="card-context light">Last uploaded {activity.lastUpload}</span>
                  </div>
                  <div className="card-btn navy-btn">
                    <span className="card-btn-label">Details</span>
                    <span className="card-btn-arr">→</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

         

        </div>
      </div>
    </div>
  );
}