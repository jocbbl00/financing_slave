import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import './index.css';

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

// Professional modern colors for the pie chart
const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#0ea5e9', '#facc15', '#64748b'];

export default function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ category: '', amount: '', isDebt: false });
  const [isSaving, setIsSaving] = useState(false);
  
  // Custom Targets State loaded from localStorage
  const [customTargets, setCustomTargets] = useState({});

  useEffect(() => {
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

  const existingCategories = [...new Set(portfolio.map(p => p.category))];
  const getTarget = (category) => customTargets[category] || 0;
  const totalTarget = existingCategories.reduce((acc, cat) => acc + (customTargets[cat] || 0), 0);

  // Recalculate true percentages & handle Debt logically
  // If an amount is negative or mapped as debt, it lowers net worth.
  // We'll calculate Gross Assets (only positive bounds) vs Net Equity (subtracting debts).
  const totalUsdGross = portfolio.reduce((acc, curr) => {
    const val = curr.category.startsWith('USD') ? curr.amount : curr.amount / 32;
    return val > 0 ? acc + val : acc;
  }, 0);

  const totalUsdNet = portfolio.reduce((acc, curr) => {
    return acc + (curr.category.startsWith('USD') ? curr.amount : curr.amount / 32);
  }, 0);

  const totalUsdDebt = portfolio.reduce((acc, curr) => {
    const val = curr.category.startsWith('USD') ? curr.amount : curr.amount / 32;
    return val < 0 ? acc + Math.abs(val) : acc;
  }, 0);

  const totalNtdNet = portfolio.reduce((acc, curr) => acc + curr.currentNtd, 0);

  // Calculate base for percentage display (usually based on gross positive assets)
  const getTotalNtdBase = () => {
    return portfolio.reduce((acc, c) => {
      const val = c.category.startsWith('USD') ? c.amount * 32 : c.amount;
      return val > 0 ? acc + val : acc;
    }, 0);
  };
  
  const enrichedPortfolio = portfolio.map(asset => {
    const assetNtdValue = asset.category.startsWith('USD') ? asset.amount * 32 : asset.amount;
    const truePercentage = (getTotalNtdBase() > 0 && assetNtdValue > 0) ? (assetNtdValue / getTotalNtdBase()) * 100 : 0;
    return {
      ...asset,
      percentage: truePercentage,
      target: getTarget(asset.category)
    };
  });

  // Prepare Pie Chart data (filtering out negative debt balances so pie renders correctly)
  const pieData = enrichedPortfolio
    .filter(a => a.amount > 0)
    .map(a => ({
      name: a.category,
      value: a.category.startsWith('USD') ? a.amount * 32 : a.amount // normalized pie values
    }));

  const analyzePortfolio = () => {
    const adviceList = [];
    adviceList.push("🌍 Macro View: US Interest rates hold around 3.5%-3.75%, making safe cash attractive, but geopolitical volatility highlights the need for diversification. Your transactions map Net Equity directly onto Google Sheets historical logs.");

    let flagged = false;
    enrichedPortfolio.forEach(asset => {
      if (asset.amount < 0) return; // skip target analysis for debt
      const diff = asset.percentage - asset.target;
      if (asset.target > 0) {
        if (diff > 5) { adviceList.push(`⚠️ You are overweight in ${asset.category} by ${diff.toFixed(1)}%.`); flagged = true; }
        if (diff < -5) { adviceList.push(`📈 You are underweight in ${asset.category} by ${Math.abs(diff).toFixed(1)}%.`); flagged = true; }
      }
    });

    if (!flagged) {
      adviceList.push("✨ Your assets are moving tightly with your targeted goals.");
    }
    return adviceList;
  };
  const advice = analyzePortfolio();

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    let finalAmount = Number(formData.amount);
    if (formData.isDebt) finalAmount = -Math.abs(finalAmount); // Ensure it's negative if marked as liability
    
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ category: formData.category, amount: finalAmount }),
      });

      setPortfolio(prev => {
        const existing = prev.find(p => p.category.toLowerCase() === formData.category.toLowerCase());
        if (existing) {
          return prev.map(p => p.category.toLowerCase() === formData.category.toLowerCase() ? { ...p, amount: p.amount + finalAmount, currentNtd: p.currentNtd + (formData.category.startsWith('USD') ? finalAmount*32 : finalAmount) } : p);
        } else {
          return [...prev, { category: formData.category, amount: finalAmount, currentNtd: formData.category.startsWith('USD') ? finalAmount * 32 : finalAmount }];
        }
      });
      setIsModalOpen(false);
      setFormData({ category: '', amount: '', isDebt: false });
    } catch (err) {
      console.error('Failed to update asset', err);
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
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="primary-btn secondary" onClick={() => setIsTargetModalOpen(true)}>
            Adjust Targets
          </button>
          <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Update Asset / Debt
          </button>
        </div>
      </header>

      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="glass-card stat-card">
          <div className="stat-label">Net Equity (USD)</div>
          <div className="stat-value">${totalUsdNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="change-indicator change-positive">
            Gross Assets: ${totalUsdGross.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="stat-label">Remaining Debt (USD)</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>${totalUsdDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="change-indicator" style={{ color: '#dc2626' }}>
            NTD Debt Equivalent: NT${(totalUsdDebt * 32).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-label">Net Equity (NTD)</div>
          <div className="stat-value">NT${totalNtdNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
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

      <div className="dashboard-grid">
        {/* Pie Chart Card */}
        <div className="glass-card" style={{ minHeight: '350px' }}>
          <h2 style={{ marginBottom: '1rem', fontWeight: 600 }}>Wealth Distribution</h2>
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie 
                  data={pieData} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={70} 
                  outerRadius={100} 
                  paddingAngle={5}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => `NT$${value.toLocaleString(undefined, {maximumFractionDigits: 0})}`} 
                  contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Allocation List Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600 }}>Asset Allocation</h2>
            <span style={{ fontSize: '0.9rem', color: '#475569' }}>Comparing to Targets</span>
          </div>
          
          <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '1rem' }}>
            {enrichedPortfolio.map((asset) => (
               <div key={asset.category} className="allocation-item">
                 <div className="allocation-header">
                   <span style={{ fontWeight: '700', color: asset.amount < 0 ? '#ef4444' : '#0f172a' }}>{asset.category} {asset.amount < 0 && '(Liability)'}</span>
                   {asset.amount > 0 && (
                     <span style={{ color: '#475569', fontWeight: '600', fontSize: '0.9rem' }}>
                        {(asset.percentage || 0).toFixed(1)}% (Target: {asset.target}%)
                     </span>
                   )}
                 </div>
                 {asset.amount > 0 && (
                   <div className="progress-track" style={{ height: '6px' }}>
                     <div 
                       className="progress-fill" 
                       style={{ width: `${Math.min(100, asset.percentage || 0)}%`, background: asset.percentage > asset.target + 5 ? '#ef4444' : asset.percentage < asset.target - 5 ? '#f59e0b' : '#059669' }}
                     ></div>
                     <div 
                       className="progress-target" 
                       style={{ left: `${asset.target}%`, width: '2px' }}
                     ></div>
                   </div>
                 )}
                 <div style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: '#475569', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{asset.category.startsWith('USD') ? '$' : 'NT$'}{(asset.amount||0).toLocaleString()}</span>
                 </div>
               </div>
            ))}
          </div>
        </div>
      </div>

      {/* UPDATE ASSET MODAL */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1.25rem', color: '#0f172a' }}>Add / Update Ledger</h2>
          <form onSubmit={handleAddAsset}>
            <div className="form-group">
              <label>Category (Type new or select)</label>
              <input 
                type="text"
                list="asset-categories"
                className="form-control" 
                placeholder="e.g. Bank A, Student Loan"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                required
              />
              <datalist id="asset-categories">
                {existingCategories.map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>
            
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
              <input 
                type="checkbox" 
                id="isDebt" 
                checked={formData.isDebt}
                onChange={e => setFormData({...formData, isDebt: e.target.checked})}
                style={{ width: '1.1rem', height: '1.1rem', accentColor: '#ef4444' }}
              />
              <label htmlFor="isDebt" style={{ margin: 0, fontWeight: 500, color: formData.isDebt ? '#ef4444' : '#475569' }}>
                This is a Liability / Debt (deducts from Net Equity)
              </label>
            </div>

            <div className="form-group">
              <label>Amount (Add to balance)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 5000"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                min="0" /* Negative dynamically handled by checkbox */
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : formData.isDebt ? 'Record Debt' : 'Record Asset'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ADJUST TARGETS MODAL */}
      <div className={`modal-overlay ${isTargetModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1rem', color: '#0f172a' }}>Adjust Target Allocations</h2>
          
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1rem', 
            borderRadius: '12px', 
            background: totalTarget === 100 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
            color: totalTarget === 100 ? '#059669' : '#dc2626', 
            fontWeight: 600, 
            display: 'flex', 
            justifyContent: 'space-between' 
          }}>
            <span>Total Allocation:</span>
            <span>{totalTarget}% / 100%</span>
          </div>
          
          <form onSubmit={handleSaveTargets}>
            {existingCategories.map(cat => (
              <div key={cat} className="form-group" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <label style={{ margin: 0, fontWeight: 600, color: '#334155', fontSize: '0.85rem' }}>{cat}</label>
                  <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{customTargets[cat] || 0}%</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="range" 
                    style={{ flex: 1, accentColor: '#eab308' }}
                    value={customTargets[cat] || 0}
                    onChange={e => updateTarget(cat, e.target.value)}
                    min="0"
                    max="100"
                  />
                  <input 
                    type="number" 
                    className="form-control" 
                    style={{ width: '60px', padding: '0.4rem', textAlign: 'center', fontSize: '0.85rem' }}
                    value={customTargets[cat] || 0}
                    onChange={e => updateTarget(cat, e.target.value)}
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            ))}
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsTargetModalOpen(false)}>Cancel</button>
              <button 
                type="submit" 
                className="primary-btn" 
                disabled={totalTarget !== 100} 
                style={{ opacity: totalTarget === 100 ? 1 : 0.5, cursor: totalTarget === 100 ? 'pointer' : 'not-allowed' }}
              >
                Save Targets
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
