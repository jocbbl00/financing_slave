import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import './index.css';

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#0ea5e9', '#facc15', '#64748b'];

const FX_RATES = { USD: 1, NTD: 32, JPY: 150 };
const CURRENCY_SYMBOLS = { USD: '$', NTD: 'NT$', JPY: '¥' };

export default function App() {
  const [portfolio, setPortfolio] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState('All');
  const [currency, setCurrency] = useState('USD');
  
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
        // Map backend data dynamically resolving everything from row 3 downwards!
        const formatted = json.data.map(item => ({
          category: item.category,
          amount: item.category.startsWith('USD') ? item.currentUsd : item.currentNtd,
          percentage: item.percentage,
          currentNtd: item.currentNtd
        }));
        setPortfolio(formatted);
      }

      if (json.transactions) {
        setTransactions(json.transactions);
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

  const totalUsdGross = portfolio.reduce((acc, curr) => {
    const val = curr.category.startsWith('USD') ? curr.amount : curr.amount / 32;
    return val > 0 ? acc + val : acc;
  }, 0);

  const totalUsdDebt = portfolio.reduce((acc, curr) => {
    const val = curr.category.startsWith('USD') ? curr.amount : curr.amount / 32;
    return val < 0 ? acc + Math.abs(val) : acc;
  }, 0);

  const totalUsdNet = totalUsdGross - totalUsdDebt;
  const totalNtdNet = totalUsdNet * 32;

  const fmt = (usdVal) => {
    const converted = usdVal * FX_RATES[currency];
    return `${CURRENCY_SYMBOLS[currency]}${converted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  // Calculate base for percentage display based strictly on gross positive assets
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

  // Pie Chart Data (Absolute magnitude mapping Gross Assets + Gross Liabilities)
  // so debts are visualized distinctly in the chart
  const pieData = enrichedPortfolio.map(a => ({
    name: a.category + (a.amount < 0 ? " (Debt)" : ""),
    rawAmount: a.amount,
    value: Math.abs(a.category.startsWith('USD') ? a.amount * 32 : a.amount),
    fill: a.amount < 0 ? '#ef4444' : undefined // Custom fill hook for later versions, defaulting via pie mapping below
  }));

  // Build Historical Chart Data from Transactions
  // We use the historical deltas to build the trend curve shape, then anchor it to explicitly match the current Gross Equity.
  const chartMap = {};
  let rollingValue = 0;
  
  // Sorting chronologically
  const sortedTx = [...transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
  
  sortedTx.forEach(tx => {
    if (tx.category === 'USD Historical Delta') {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}`; // YYYY-MM
      
      const txAmountUsd = tx.category.startsWith('USD') ? Number(tx.amount) : Number(tx.amount) / 32;
      rollingValue += txAmountUsd;
      
      chartMap[key] = rollingValue;
    }
  });

  const keys = Object.keys(chartMap);
  const lastKey = keys[keys.length - 1];
  const lastVal = lastKey ? chartMap[lastKey] : 0;
  const offset = totalUsdGross - lastVal;

  const historicalChartData = keys.map(dateLabel => ({
    name: dateLabel,
    equity: Math.round((chartMap[dateLabel] + offset) * FX_RATES[currency])
  }));

  // Ensure current month is plotted if it's missing from the history array
  const currentKey = `${new Date().getFullYear()}-${(new Date().getMonth()+1).toString().padStart(2, '0')}`;
  if (keys.length > 0 && lastKey !== currentKey) {
     historicalChartData.push({
        name: currentKey,
        equity: Math.round(totalUsdGross * FX_RATES[currency])
     });
  }

  let displayChartData = historicalChartData;
  if (timeFilter === '6M') {
    displayChartData = historicalChartData.slice(-6);
  } else if (timeFilter === '1Y') {
    displayChartData = historicalChartData.slice(-12);
  }


  const analyzePortfolio = () => {
    const sections = [];
    
    // Portfolio Adjustment Based on Current Market & Targets
    let adjustments = [];
    enrichedPortfolio.forEach(asset => {
      if (asset.amount < 0) return; 
      const diff = asset.percentage - asset.target;
      if (asset.target > 0) {
        if (diff > 5) {
          adjustments.push(`⚠️ ${asset.category} is overweight by ${diff.toFixed(1)}%. With US rates at 3.5%-3.75%, consider rotating excess into short-duration Treasury ETFs (e.g. SHV, BIL) to lock in risk-free yield while reducing concentration risk.`);
        } else if (diff < -5) {
          adjustments.push(`📈 ${asset.category} is underweight by ${Math.abs(diff).toFixed(1)}%. Dollar-cost average back toward target. If this is an equity position, current market pullbacks present favorable entry points.`);
        }
      }
    });
    if (adjustments.length === 0) {
      adjustments.push('✅ Your portfolio allocation closely tracks your custom targets. No rebalancing action needed at this time. Continue monitoring monthly.');
    }
    sections.push({ 
      title: "Portfolio Advice", 
      icon: "📊", 
      color: '#f59e0b',
      items: adjustments 
    });

    // Industry Monitoring
    sections.push({ 
      title: "Industries to Monitor", 
      icon: "🔭",
      color: '#10b981', 
      items: [
        '🧠 AI Edge Hardware & Silicon Photonics — While software-layer AI is saturated with capital, the physical optical interconnect layer (800G/1.6T transceivers) powering hyperscale LLM clusters remains deeply undervalued. Key names: Coherent (COHR), II-VI.',
        '⚡ Grid-Scale Energy Storage — Battery storage deployment is accelerating 40% YoY globally as renewable intermittency becomes the #1 grid bottleneck. Watch: Fluence Energy (FLNC), EnerSys (ENS).',
        '🏥 Taiwan Biotech ADRs — Taiwan\'s biotech sector trades at significant discounts to US peers despite strong Phase III pipelines and growing FDA approvals. An overlooked hedge within your NTD exposure.'
      ]
    });

    // News with clickable links and summaries
    sections.push({ 
      title: "News to Keep an Eye On", 
      icon: "📰",
      color: '#3b82f6', 
      links: [
        { text: 'Fed Interest Rate Decision & FOMC Minutes', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', summary: 'The Fed\'s rate stance directly controls your USD cash yield. With rates at 3.5-3.75%, any dovish pivot would reduce returns on your USD Cash & Preferred holdings while boosting equity valuations.' },
        { text: 'TSMC Monthly Revenue Report', url: 'https://www.tsmc.com/english/investorRelations/monthly_revenue', summary: 'TSMC is the backbone of Taiwan\'s tech sector. Their monthly revenue data is a leading indicator for your NTD Stock positions and reflects AI chip demand health globally.' },
        { text: 'US-China Tariff & Trade Policy Updates', url: 'https://www.reuters.com/business/us-china-trade/', summary: 'Escalating tariffs disrupt semiconductor supply chains and impact cross-strait capital flows. Critical for anyone holding both USD and NTD-denominated assets simultaneously.' },
        { text: 'Bank of Japan Rate Policy (JPY)', url: 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm', summary: 'BOJ policy shifts cause massive JPY volatility. If you hold or plan to hold JPY-denominated assets, rate normalization could strengthen JPY 10-15% against USD.' },
        { text: 'Bloomberg Markets Daily Briefing', url: 'https://www.bloomberg.com/markets', summary: 'Comprehensive daily snapshot of global equity, bond, and commodity markets. Essential for cross-checking whether your portfolio\'s risk exposure matches the day\'s macro sentiment.' }
      ]
    });

    return sections;
  };
  const advice = analyzePortfolio();

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    let finalAmount = Number(formData.amount);
    if (formData.isDebt) finalAmount = -Math.abs(finalAmount);
    
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ category: formData.category, amount: finalAmount }),
      });

      // Optimistic internal cache refetch
      setIsModalOpen(false);
      setFormData({ category: '', amount: '', isDebt: false });
      fetchPortfolio(); 
    } catch (err) {
      console.error('Failed to update asset', err);
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
        <h2 style={{ color: '#0f172a' }}>Loading Historical Spreadsheets...</h2>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/favicon.jpg" alt="icon" style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
          <div>
            <h1>Yarin's Accounting Slave</h1>
            <p>Real-time Portfolio Tracking & Analytics</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.3)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.5)' }}>
            {['USD', 'NTD', 'JPY'].map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                style={{
                  padding: '0.4rem 0.75rem',
                  border: 'none',
                  background: currency === c ? '#facc15' : 'transparent',
                  color: currency === c ? '#0f172a' : '#475569',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s'
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <button className="primary-btn secondary" onClick={() => setIsTargetModalOpen(true)}>
            Adjust Targets
          </button>
          <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Update Ledger / Debt
          </button>
        </div>
      </header>

      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="glass-card stat-card">
          <div className="stat-label">Net Equity</div>
          <div className="stat-value">{fmt(totalUsdNet)}</div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-label">Gross Assets</div>
          <div className="stat-value">{fmt(totalUsdGross)}</div>
        </div>
        
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="stat-label">Remaining Debt</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{fmt(totalUsdDebt)}</div>
        </div>
        
        <div className="glass-card insight-card" style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 600 }}>Historical Gross Equity Trend ({currency})</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['6M', '1Y', 'All'].map(tf => (
                <button 
                  key={tf}
                  onClick={() => setTimeFilter(tf)}
                  style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '20px', 
                    border: '1px solid #cbd5e1', 
                    background: timeFilter === tf ? '#facc15' : 'transparent',
                    color: timeFilter === tf ? '#0f172a' : '#475569',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          {displayChartData.length > 0 ? (
             <div style={{ width: '100%', height: '250px' }}>
                <ResponsiveContainer>
                  <LineChart data={displayChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ borderRadius: '12px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="equity" name={`Gross Equity (${currency})`} stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
             </div>
          ) : (
            <p style={{ color: '#475569' }}>No historical transactions populated from the spreadsheet yet.</p>
          )}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Pie Chart Card */}
        <div className="glass-card insight-card" style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 600 }}>🤖 AI Portfolio & Market Advisor</h2>
            <span style={{ fontSize: '0.85rem', color: '#475569', background: '#e2e8f0', padding: '0.25rem 0.5rem', borderRadius: '12px' }}>Live Analysis</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
            {advice.map((section, idx) => (
               <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '1.25rem 1.5rem', borderRadius: '16px', borderLeft: `6px solid ${section.color}` }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                   <span style={{ fontSize: '1.3rem' }}>{section.icon}</span>
                   <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: '700' }}>{section.title}</h3>
                 </div>
                 {section.items && section.items.map((item, i) => (
                   <p key={i} style={{ fontSize: '0.95rem', color: '#334155', fontWeight: 500, lineHeight: '1.7', margin: '0 0 0.5rem 0', paddingLeft: '0.5rem', borderLeft: '2px solid #e2e8f0' }}>{item}</p>
                 ))}
                 {section.links && (
                   <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                     {section.links.map((link, i) => (
                       <li key={i} style={{ marginBottom: '1rem' }}>
                         <a 
                           href={link.url} 
                           target="_blank" 
                           rel="noopener noreferrer" 
                           style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                         >
                           🔗 {link.text}
                         </a>
                         {link.summary && (
                           <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.25rem 0 0 1.5rem', lineHeight: '1.5', fontWeight: 400 }}>{link.summary}</p>
                         )}
                       </li>
                     ))}
                   </ul>
                 )}
               </div>
            ))}
          </div>
        </div>
        <div className="glass-card">
          <h2 style={{ marginBottom: '1rem', fontWeight: 600 }}>Total Value Distribution</h2>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px', minHeight: '250px' }}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie 
                    data={pieData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={50} 
                    outerRadius={85} 
                    paddingAngle={4}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill || PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => `${CURRENCY_SYMBOLS[currency]}${(value * FX_RATES[currency] / 32).toLocaleString(undefined, {maximumFractionDigits: 0})}`} 
                    contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
              {pieData.map((entry, index) => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: entry.fill || PIE_COLORS[index % PIE_COLORS.length], flexShrink: 0 }}></span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{entry.name}</span>
                </div>
              ))}
            </div>
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
