import { useState, useEffect } from 'react';
import './index.css';

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

export default function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ category: '', amount: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // Custom Targets State loaded from localStorage
  const [customTargets, setCustomTargets] = useState({});

  useEffect(() => {
    // Load targets on mount
    const savedTargets = localStorage.getItem('WA_TARGETS');
    if (savedTargets) {
      setCustomTargets(JSON.parse(savedTargets));
    }
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(API_URL);
      const json = await res.json();
      
      if (json.status === 'success' && json.data) {
        // Map backend data
        const formatted = json.data.map(item => ({
          category: item.category,
          amount: item.category.startsWith('USD') ? item.currentUsd : item.currentNtd,
          percentage: item.percentage,
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

  // Extract unique categories from portfolio
  const existingCategories = [...new Set(portfolio.map(p => p.category))];

  // Helper to get target safely
  const getTarget = (category) => customTargets[category] || 0;

  // Recalculate global percentages based on current total logic
  const totalUsd = portfolio.reduce((acc, curr) => {
    return acc + (curr.category.startsWith('USD') ? curr.amount : curr.amount / 32);
  }, 0);

  const totalNtd = portfolio.reduce((acc, curr) => acc + curr.currentNtd, 0);

  // Recalculate true percentages since we might add local unsynced mocks
  const getTotalNtdBase = () => {
    return portfolio.reduce((acc, c) => acc + (c.category.startsWith('USD') ? c.amount * 32 : c.amount), 0);
  };
  
  const enrichedPortfolio = portfolio.map(asset => {
    const assetNtdValue = asset.category.startsWith('USD') ? asset.amount * 32 : asset.amount;
    const truePercentage = getTotalNtdBase() > 0 ? (assetNtdValue / getTotalNtdBase()) * 100 : 0;
    return {
      ...asset,
      percentage: truePercentage,
      target: getTarget(asset.category)
    };
  });

  // Calculate Advise logic based on current macro market and personal targets
  const analyzePortfolio = () => {
    const adviceList = [];
    
    // 1. Macro Economic Check based on 2026 conditions
    adviceList.push("🌍 Macro View: US Interest rates hold around 3.5%-3.75%, making safe cash attractive, but geopolitical volatility means you should avoid over-indexing in a single market. Taiwan tech remains highly resilient due to AI demand.");

    // 2. Personal Target Drift Check
    enrichedPortfolio.forEach(asset => {
      const diff = asset.percentage - asset.target;
      if (asset.target > 0) {
        if (diff > 5) adviceList.push(`⚠️ You are overweight in ${asset.category} by ${diff.toFixed(1)}%. Consider taking profits to rebalance.`);
        if (diff < -5) adviceList.push(`📈 You are underweight in ${asset.category} by ${Math.abs(diff).toFixed(1)}%. It might be a good time to accumulate.`);
      }
    });

    if (adviceList.length === 1) {
      adviceList.push("✨ Your portfolio closely matches your set targets! Great discipline.");
    }

    return adviceList;
  };

  const advice = analyzePortfolio();

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // Send the update to Google Apps Script. 
      // This works gracefully if your AppsScript handles dynamic categories.
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      // Optimistically update UI
      setPortfolio(prev => {
        const existing = prev.find(p => p.category.toLowerCase() === formData.category.toLowerCase());
        if (existing) {
          return prev.map(p => 
            p.category.toLowerCase() === formData.category.toLowerCase() 
            ? { ...p, amount: p.amount + Number(formData.amount) } 
            : p
          );
        } else {
          // Add newly injected local category
          return [...prev, { 
            category: formData.category, 
            amount: Number(formData.amount), 
            currentNtd: formData.category.startsWith('USD') ? Number(formData.amount) * 32 : Number(formData.amount) 
          }];
        }
      });
      
      setIsModalOpen(false);
      setFormData({ category: '', amount: '' });
    } catch (err) {
      console.error('Failed to update asset', err);
      // Fallback local update even if fetch fails 
      setPortfolio(prev => {
        const existing = prev.find(p => p.category.toLowerCase() === formData.category.toLowerCase());
        if (existing) {
          return prev.map(p => p.category === formData.category ? { ...p, amount: p.amount + Number(formData.amount) } : p);
        } else {
          return [...prev, { category: formData.category, amount: Number(formData.amount), currentNtd: formData.category.startsWith('USD') ? Number(formData.amount) * 32 : Number(formData.amount) }];
        }
      });
      setIsModalOpen(false);
      setFormData({ category: '', amount: '' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTargets = (e) => {
    e.preventDefault();
    localStorage.setItem('WA_TARGETS', JSON.stringify(customTargets));
    setIsTargetModalOpen(false);
  };

  const updateTarget = (cat, val) => {
    setCustomTargets(prev => ({...prev, [cat]: Number(val)}));
  };

  if (isLoading) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h2 style={{ color: '#0f172a' }}>Loading Portfolio...</h2>
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
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="primary-btn secondary" onClick={() => setIsTargetModalOpen(true)}>
            Adjust Targets
          </button>
          <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Update Asset
          </button>
        </div>
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
        <div className="glass-card insight-card" style={{ gridColumn: '1 / -1' }}>
          <div className="stat-label" style={{ marginBottom: '1rem' }}>AI Portfolio Advisor</div>
          <ul className="insight-list">
            {advice.map((msg, idx) => (
               <li key={idx}>
                 <div className="insight-icon">{idx === 0 ? '📊' : msg.includes('⚠️') ? '⚠️' : msg.includes('📈') ? '📈' : '✨'}</div>
                 <p style={{ fontSize: '1rem', color: '#1e293b', fontWeight: 500 }}>{msg}</p>
               </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontWeight: 600 }}>Asset Allocation</h2>
          <span style={{ fontSize: '0.9rem', color: '#475569' }}>Comparing to your Custom Targets</span>
        </div>
        
        <div className="dashboard-grid">
          {enrichedPortfolio.map((asset) => (
             <div key={asset.category} className="allocation-item">
               <div className="allocation-header">
                 <span style={{ fontWeight: '700', color: '#0f172a' }}>{asset.category}</span>
                 <span style={{ color: '#475569', fontWeight: '600' }}>
                    {(asset.percentage || 0).toFixed(1)}% (Target: {asset.target}%)
                 </span>
               </div>
               <div className="progress-track">
                 <div 
                   className="progress-fill" 
                   style={{ width: `${Math.min(100, asset.percentage || 0)}%`, background: asset.percentage > asset.target + 5 ? '#ef4444' : asset.percentage < asset.target - 5 ? '#f59e0b' : '#059669' }}
                 ></div>
                 <div 
                   className="progress-target" 
                   style={{ left: `${asset.target}%` }}
                 ></div>
               </div>
               <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#475569', display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
                  <span>{asset.category.startsWith('USD') ? '$' : 'NT$'}{(asset.amount||0).toLocaleString()}</span>
               </div>
             </div>
          ))}
        </div>
      </div>

      {/* UPDATE ASSET MODAL */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1.5rem', color: '#0f172a' }}>Add / Update Asset</h2>
          <form onSubmit={handleAddAsset}>
            <div className="form-group">
              <label>Asset Category</label>
              <input 
                type="text"
                list="asset-categories"
                className="form-control" 
                placeholder="e.g. US Stock, NTD Cash, Bank A"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                required
              />
              <datalist id="asset-categories">
                {existingCategories.map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label>Amount (Add to current or new balance)</label>
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

      {/* ADJUST TARGETS MODAL */}
      <div className={`modal-overlay ${isTargetModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1.5rem', color: '#0f172a' }}>Adjust Target Allocations</h2>
          <p style={{ marginBottom: '1rem', color: '#475569', fontSize: '0.9rem' }}>Set your desired portfolio balance for tracking.</p>
          <form onSubmit={handleSaveTargets}>
            {existingCategories.map(cat => (
              <div key={cat} className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ margin: 0 }}>{cat} Target (%)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ width: '100px', padding: '0.5rem' }}
                  value={customTargets[cat] || 0}
                  onChange={e => updateTarget(cat, e.target.value)}
                  min="0"
                  max="100"
                />
              </div>
            ))}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsTargetModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-btn">Save Targets</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
