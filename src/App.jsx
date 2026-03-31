import { useState, useEffect } from 'react';
import './index.css';

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

// Hardcoded targets based on your Excel sheet plan
const TARGETS = {
  'USD Cash': 10,
  'USD Preferred': 15,
  'USD Stock': 20,
  'NTD Cash': 10,
  'NTD Preferred': 20,
  'NTD Stock': 25
};

export default function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ category: 'USD Cash', amount: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(API_URL);
      const json = await res.json();
      
      if (json.status === 'success' && json.data) {
        // Map the backend data to match our frontend needs and append Target %
        const formatted = json.data.map(item => ({
          category: item.category,
          amount: item.category.startsWith('USD') ? item.currentUsd : item.currentNtd,
          percentage: item.percentage,
          target: TARGETS[item.category] || 0,
          currentNtd: item.currentNtd
        }));
        setPortfolio(formatted);
      }
    } catch (err) {
      console.error('Failed to fetch portfolio data', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate totals
  const totalUsd = portfolio.reduce((acc, curr) => {
    return acc + (curr.category.startsWith('USD') ? curr.amount : curr.amount / 32);
  }, 0);

  const totalNtd = portfolio.reduce((acc, curr) => acc + curr.currentNtd, 0);

  // Calculate Advise logic
  const analyzePortfolio = () => {
    return portfolio.map(asset => {
      const diff = asset.percentage - asset.target;
      if (diff > 5) return `You are overweight in ${asset.category} by ${diff.toFixed(1)}%. Consider rebalancing into under-allocated assets.`;
      if (diff < -5) return `You are underweight in ${asset.category} by ${Math.abs(diff).toFixed(1)}%. Good opportunity to accumulate.`;
      return null;
    }).filter(msg => msg !== null);
  };

  const advice = analyzePortfolio();

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // Send the update to Google Apps Script
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      // Optimistically update UI
      setPortfolio(prev => prev.map(p => {
        if (p.category === formData.category) {
          return { ...p, amount: p.amount + Number(formData.amount) };
        }
        return p;
      }));
      
      setIsModalOpen(false);
      setFormData({ category: 'USD Cash', amount: '' });
    } catch (err) {
      console.error('Failed to update asset', err);
      alert('Failed to update asset. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h2>Loading Portfolio Data from Google Sheets...</h2>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div>
          <h1>Wealth Allocator</h1>
          <p>Real-time Portfolio Tracking & Analytics</p>
        </div>
        <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Update Asset
        </button>
      </header>

      <div className="dashboard-grid">
        <div className="glass-card stat-card">
          <div className="stat-label">Total Net Worth (USD)</div>
          <div className="stat-value">${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="change-indicator change-positive">
            ▲ Live Sync Active
          </div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-label">Total Net Worth (NTD)</div>
          <div className="stat-value">NT${totalNtd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="glass-card insight-card">
          <div className="stat-label" style={{ marginBottom: '1rem' }}>AI Portfolio Advisor</div>
          <ul className="insight-list">
            {advice.length > 0 ? advice.map((msg, idx) => (
               <li key={idx}>
                 <div className="insight-icon">💡</div>
                 <p style={{ fontSize: '0.95rem', color: '#e2e8f0' }}>{msg}</p>
               </li>
            )) : (
              <li>
                 <div className="insight-icon">✨</div>
                 <p style={{ fontSize: '0.95rem', color: '#e2e8f0' }}>Your portfolio is beautifully balanced and near target allocations.</p>
               </li>
            )}
          </ul>
        </div>
      </div>

      <div className="glass-card">
        <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Asset Allocation</h2>
        <div className="dashboard-grid">
          {portfolio.map((asset) => (
             <div key={asset.category} className="allocation-item">
               <div className="allocation-header">
                 <span>{asset.category}</span>
                 <span style={{ color: '#94a3b8' }}>
                    {(asset.percentage !== undefined ? asset.percentage : 0).toFixed(1)}% (Target: {asset.target}%)
                 </span>
               </div>
               <div className="progress-track">
                 <div 
                   className="progress-fill" 
                   style={{ width: `${Math.min(100, asset.percentage || 0)}%`, background: asset.percentage > asset.target + 5 ? '#ef4444' : asset.percentage < asset.target - 5 ? '#f59e0b' : '#10b981' }}
                 ></div>
                 <div 
                   className="progress-target" 
                   style={{ left: `${asset.target}%` }}
                 ></div>
               </div>
               <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{asset.category.startsWith('USD') ? '$' : 'NT$'}{(asset.amount||0).toLocaleString()}</span>
                  <span>Target: {asset.category.startsWith('USD') ? '$' : 'NT$'}{((totalUsd * (asset.category.startsWith('USD') ? 1 : 32)) * (asset.target/100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
               </div>
             </div>
          ))}
        </div>
      </div>

      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1.5rem' }}>Update Asset Amount</h2>
          <form onSubmit={handleAddAsset}>
            <div className="form-group">
              <label>Asset Category</label>
              <select 
                className="form-control" 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                {portfolio.map(p => <option key={p.category} value={p.category}>{p.category}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Amount (Add to current)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 5000"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Asset'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
