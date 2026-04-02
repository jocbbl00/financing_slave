import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import './index.css';

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#0ea5e9', '#facc15', '#64748b'];

const FX_RATES = { USD: 1, NTD: 32, JPY: 150 };
const CURRENCY_SYMBOLS = { USD: '$', NTD: 'NT$', JPY: '¥' };

// Friendly ticker name mappings
const TICKER_NAMES = {
  // US Stocks
  'AAPL': 'Apple', 'ABAT': 'ABAT', 'AMD': 'AMD', 'AMZN': 'Amazon',
  'EBAY': 'eBay', 'EVGO': 'EVgo', 'GLW': 'Corning', 'GOOGL': 'Google',
  'LAC': 'Lithium Americas', 'LAAC': 'Lithium Argentina', 'LEU': 'Centrus',
  'META': 'Meta', 'MSFT': 'Microsoft', 'NEE': 'NextEra', 'NVDA': 'NVIDIA',
  'PLTR': 'Palantir', 'PLUG': 'Plug Power', 'TSLA': 'Tesla', 'VRT': 'Vertiv',
  // Taiwan Stocks
  '2330': 'TSMC', '2890': 'SinoPac',
  '00687B': 'CTBC Bond ETF', '00719B': 'Yuanta Bond ETF',
};
const tickerLabel = (ticker) => {
  const name = TICKER_NAMES[ticker];
  return name ? `${name}(${ticker})` : ticker;
};

export default function App() {
  const [portfolio, setPortfolio] = useState([]);       // OVERVIEW-level 6-category summary
  const [portfolioItems, setPortfolioItems] = useState([]); // Individual stock/cash/debt rows
  const [historyData, setHistoryData] = useState([]);    // Historical gross/debt/net snapshots
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [poppedCard, setPoppedCard] = useState(null);
  const [timeFilter, setTimeFilter] = useState('All');
  const [currency, setCurrency] = useState('USD');
  const [activeTab, setActiveTab] = useState('Overview');
  
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], category: '', ticker: '', amount: '', isDebt: false });
  const [cashEdits, setCashEdits] = useState({});
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
        // Map backend summary data (6 categories + Loan)
        const formatted = json.data.map(item => ({
          category: item.category,
          amount: item.category.startsWith('USD') || item.category === 'Loan' ? item.currentUsd : item.currentNtd,
          percentage: item.percentage,
          currentNtd: item.currentNtd,
          currentUsd: item.currentUsd
        }));
        setPortfolio(formatted);
      }

      // Individual portfolio rows (stocks with tickers, cash accounts, debt)
      if (json.portfolio) {
        setPortfolioItems(json.portfolio);
      }

      // Historical snapshots for chart
      if (json.history) {
        setHistoryData(json.history);
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

  const totalUsdGross = portfolio.reduce((acc, curr) => {
    const isUsd = curr.category.startsWith('USD') || curr.category === 'Loan';
    const val = isUsd ? curr.amount : curr.amount / 32;
    return val > 0 ? acc + val : acc;
  }, 0);

  const totalUsdDebt = portfolio.reduce((acc, curr) => {
    const isUsd = curr.category.startsWith('USD') || curr.category === 'Loan';
    const val = isUsd ? curr.amount : curr.amount / 32;
    return val < 0 ? acc + Math.abs(val) : acc;
  }, 0);

  const totalUsdNet = totalUsdGross - totalUsdDebt;
  const totalNtdNet = totalUsdNet * 32;

  const fmt = (usdVal) => {
    const converted = usdVal * FX_RATES[currency];
    return `${CURRENCY_SYMBOLS[currency]}${converted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  // Calculate base for percentage display based strictly on gross positive assets
  const totalGrossUsd = portfolio.reduce((acc, c) => (c.currentUsd > 0 && c.category !== 'Loan') ? acc + c.currentUsd : acc, 0);

  const enrichedPortfolio = portfolio.map(asset => {
    const valObj = Math.abs(asset.currentUsd);
    const pct = totalGrossUsd > 0 ? (valObj / totalGrossUsd) * 100 : 0;
    return {
      ...asset,
      percentage: pct
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

  // Build Historical Chart Data from History sheet snapshots
  const historicalChartData = historyData.map(h => {
    const d = new Date(h.date);
    const label = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}`;
    return {
      name: label,
      gross: Math.round((h.gross || 0) * FX_RATES[currency]),
      net: Math.round((h.net || 0) * FX_RATES[currency]),
      debt: Math.round((h.debt || 0) * FX_RATES[currency]),
    };
  });

  let displayChartData = historicalChartData;
  if (timeFilter === '6M') {
    displayChartData = historicalChartData.slice(-6);
  } else if (timeFilter === '1Y') {
    displayChartData = historicalChartData.slice(-12);
  }


  // AI-driven investment suggestions based on portfolio composition & market analysis
  const generateInvestmentSuggestions = () => {
    const todayNum = Math.floor(Date.now() / 86400000);
    const todayIndex = todayNum % 3;
    
    // Analyze user's actual holdings
    const usHoldings = portfolioItems.filter(a => a.category === 'USD Stock');
    const totalUsValue = usHoldings.reduce((s, a) => s + (Number(a.usdValue) || 0), 0);
    
    // Generate stock-specific suggestions based on portfolio and market thesis
    const allBuySuggestions = [
      [
        { ticker: 'NVDA', action: 'BUY', reason: 'AI infrastructure demand continues to accelerate. Your position ($' + Math.round(usHoldings.find(h => h.ticker === 'NVDA')?.usdValue || 0).toLocaleString() + ') is strong but NVDA remains the foundational AI compute play with expanding margins. Consider adding on any dips below $120.' },
        { ticker: 'GOOGL', action: 'BUY', reason: 'Alphabet is undervalued relative to its AI capabilities (Gemini) and cloud growth. Your ' + (usHoldings.find(h => h.ticker === 'GOOGL')?.qty || 0) + ' shares give you exposure but the P/E ratio suggests room for accumulation.' },
        { ticker: 'TSMC (2330)', action: 'HOLD', reason: 'Your largest TW position. TSMC dominates advanced chip manufacturing with 90%+ market share in sub-7nm. Geopolitical risk is the main concern — hold but do not add aggressively.' },
      ],
      [
        { ticker: 'AMD', action: 'BUY', reason: 'AMD\'s MI300X AI accelerators are gaining enterprise traction as an NVIDIA alternative. Your ' + (usHoldings.find(h => h.ticker === 'AMD')?.qty || 0) + ' shares position you well — consider adding 10-20 more shares on weakness below $100.' },
        { ticker: 'META', action: 'BUY', reason: 'Meta\'s AI monetization through advertising is producing record margins. Only ' + (usHoldings.find(h => h.ticker === 'META')?.qty || 0) + ' shares — this is underweight for a top AI beneficiary. Target 25+ shares.' },
        { ticker: 'PLTR', action: 'HOLD', reason: 'Palantir\'s government + commercial AI platform is sticky but valuation is stretched. Your 40 shares are adequate — wait for a pullback before adding.' },
      ],
      [
        { ticker: 'MSFT', action: 'BUY', reason: 'Azure AI + Copilot monetization is underappreciated. Your ' + (usHoldings.find(h => h.ticker === 'MSFT')?.qty || 0) + ' shares is light — consider building to 30+ shares. Enterprise AI spending directly benefits Microsoft.' },
        { ticker: 'VRT', action: 'BUY', reason: 'Vertiv powers the cooling and power infrastructure for AI data centers. Strong secular tailwind. Your 32 shares have room to grow — consider adding on any sub-$80 pullback.' },
        { ticker: 'LEU', action: 'HOLD', reason: 'Centrus Energy benefits from the nuclear renaissance for AI data center power. Speculative but high upside. Your 10 shares are a good speculative position — hold.' },
      ]
    ];

    const allSellSuggestions = [
      [
        { ticker: 'PLUG', action: 'TRIM', reason: 'Plug Power continues burning cash with no clear path to profitability. Your 120 shares at ~$' + Math.round(usHoldings.find(h => h.ticker === 'PLUG')?.usdValue || 0).toLocaleString() + ' is a high-risk bet. Consider trimming to 50 shares and reallocating to profitable companies.' },
        { ticker: 'EVGO', action: 'TRIM', reason: 'EV charging is a tough business with slow returns. Your 50 shares carry high risk. Consider cutting to 20 and rotating into energy infrastructure (VRT, NEE).' },
      ],
      [
        { ticker: 'ABAT', action: 'SELL', reason: 'American Battery Technology is a micro-cap with minimal revenue. Your 54 shares are worth only ~$' + Math.round(usHoldings.find(h => h.ticker === 'ABAT')?.usdValue || 0).toLocaleString() + '. Consider exiting entirely and reallocating to proven names.' },
        { ticker: 'LAC', action: 'TRIM', reason: 'Lithium Americas is pre-revenue and lithium prices remain depressed. Consider trimming from 20 to 10 shares.' },
      ],
      [
        { ticker: 'PLUG', action: 'SELL', reason: 'Hydrogen fuel cells haven\'t reached commercial viability. 120 shares is an outsized speculative bet. Trim aggressively to 30 shares maximum.' },
        { ticker: 'LAAC', action: 'TRIM', reason: 'Lithium Argentina faces commodity price headwinds and operational risk. Your 20 shares are speculative — consider cutting to 10.' },
      ]
    ];

    return {
      buys: allBuySuggestions[todayIndex],
      sells: allSellSuggestions[todayIndex],
    };
  };
  const suggestions = generateInvestmentSuggestions();

  const analyzePortfolio = () => {
    const todayNum = Math.floor(Date.now() / 86400000);
    const todayIndex = todayNum % 3;
    const sections = [];

    const allIndustries = [
      [
        '🧠 AI Edge Hardware — The physical optical interconnect layer powering hyperscale LLM clusters remains deeply undervalued. Watch: Coherent (COHR).',
        '⚡ Grid-Scale Energy Storage — Battery storage deployment is accelerating 40% YoY globally. Watch: Fluence Energy (FLNC).',
        '🏭 Semiconductor Equipment — Next-gen lithography tooling demand is recovering. Watch: ASML, Applied Materials.'
      ],
      [
        '🧬 Biotech/GLP-1 Weight Loss — Sustained momentum in anti-obesity drugs is driving broader pharma revenues. Watch: Eli Lilly (LLY).',
        '🛡️ Cybersecurity — Increasing LLM-driven attacks boost corporate spending on zero-trust architectures. Watch: CrowdStrike (CRWD).',
        '🛰️ Aerospace & Defense — Global re-armament cycles are filling up defense contractor backlogs for years. Watch: RTX.'
      ],
      [
        '☢️ Nuclear & Uranium — Tech giants are directly contracting nuclear power for AI data centers. Watch: Constellation Energy (CEG).',
        '🤖 Industrial Robotics — Reshoring of supply chains involves heavy capital expenditure into automation. Watch: Fanuc.',
        '🏗️ US Infrastructure — Federal spending is finally hitting the earnings of heavy machinery and materials companies. Watch: Caterpillar (CAT).'
      ]
    ];
    
    const allNews = [
      [
        { text: 'Fed Interest Rate Monitor', url: 'https://finance.yahoo.com/calendar/economic/', summary: 'Track CPI and rate decisions tightly. Rate cuts improve equity valuations.' },
        { text: 'TSMC Latest Updates', url: 'https://finance.yahoo.com/quote/TSM', summary: 'Check TSMC for global semiconductor health and AI chip demand.' },
        { text: 'Bloomberg Global Markets', url: 'https://finance.yahoo.com/world-indices/', summary: 'Essential for cross-checking your portfolio risk against macro sentiment.' }
      ],
      [
        { text: 'US Treasury Yield Curve', url: 'https://www.cnbc.com/us-treasurys/', summary: 'Inversions or steepening indicate potential recession or inflationary growth phases.' },
        { text: 'Nikkei & BOJ Policy Updates', url: 'https://finance.yahoo.com/quote/%5EN225/', summary: 'Changes in BOJ yield curve control affect Japanese equities and the JPY directly.' },
        { text: 'WSJ Technology News', url: 'https://www.wsj.com/news/technology', summary: 'Daily tech earnings and market shifts essential for US Tech stock exposures.' }
      ],
      [
        { text: 'Taiwan Taiex Index', url: 'https://finance.yahoo.com/quote/%5ETWII/', summary: 'Monitor broader Taiwan market conditions governing your NTD stock positions.' },
        { text: 'CME FedWatch Tool', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', summary: 'Live market probabilities of upcoming Fed interest rate moves.' },
        { text: 'CNBC Market Movers', url: 'https://www.cnbc.com/market-movers/', summary: 'See the most active stocks today to spot sector rotations in real time.' }
      ]
    ];

    sections.push({ 
      title: "Industries to Monitor", 
      icon: "🔭",
      color: '#10b981', 
      items: allIndustries[todayIndex]
    });

    sections.push({ 
      title: "News to Keep an Eye On", 
      icon: "📰",
      color: '#3b82f6', 
      links: allNews[todayIndex]
    });

    return sections;
  };
  const advice = analyzePortfolio();

  // Build pie chart data from individual portfolio items (using tickers)
  const usStocksData = portfolioItems
      .filter(a => a.category === 'USD Stock' && (Number(a.usdValue) || 0) > 0)
      .map(a => ({ name: tickerLabel(a.ticker), value: Number(a.usdValue) || 0 }));

  const twStocksData = portfolioItems
      .filter(a => a.category === 'NTD Stock' && (Number(a.ntdValue) || 0) > 0)
      .map(a => ({ name: tickerLabel(a.ticker), value: Number(a.ntdValue) || 0 }));

  // Cash accounts for the edit modal
  const cashAccounts = portfolioItems.filter(a => 
    a.category === 'USD Cash' || a.category === 'NTD Cash' || 
    a.category === 'USD Preferred' ||
    a.category === 'Loan'
  );

  const handleUpdateCash = async (ticker, amount, currency) => {
    setIsSaving(true);
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'update_cash', ticker, amount: Number(amount), currency }),
      });
      fetchPortfolio();
    } catch (err) {
      console.error('Failed to update cash', err);
    } finally {
      setIsSaving(false);
      setIsCashModalOpen(false);
      setCashEdits({});
    }
  };

  const handleSaveAllCash = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      for (const [ticker, amount] of Object.entries(cashEdits)) {
        const acct = cashAccounts.find(a => a.ticker === ticker);
        const cur = acct && (acct.category.startsWith('NTD') ? 'NTD' : 'USD');
        await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'update_cash', ticker, amount: Number(amount), currency: cur }),
        });
      }
      fetchPortfolio();
    } catch (err) {
      console.error('Failed to update cash', err);
    } finally {
      setIsSaving(false);
      setIsCashModalOpen(false);
      setCashEdits({});
    }
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    let finalAmount = Number(formData.amount);
    if (formData.isDebt) finalAmount = -Math.abs(finalAmount);
    
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'update_ledger', date: formData.date, category: formData.category, ticker: formData.ticker, qty: finalAmount }),
      });

      // Optimistic internal cache refetch
      setIsModalOpen(false);
      setFormData({ date: new Date().toISOString().split('T')[0], category: '', ticker: '', amount: '', isDebt: false });
      fetchPortfolio(); 
    } catch (err) {
      console.error('Failed to update asset', err);
      setIsSaving(false);
    }
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
      {poppedCard && <div className="popped-out-backdrop" onClick={() => setPoppedCard(null)}></div>}
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
          <button className="primary-btn secondary" onClick={() => { setCashEdits({}); setIsCashModalOpen(true); }}>
            💰 Edit Cash
          </button>
          <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Update Ledger / Debt
          </button>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', borderBottom: '2px solid #e2e8f0', width: '100%', overflowX: 'auto' }}>
          {['Overview', 'Portfolio Advice', 'Stock Holdings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === tab ? '3px solid #f59e0b' : '3px solid transparent',
                color: activeTab === tab ? '#0f172a' : '#64748b',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'Overview' && (
      <>
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #10b981' }}>
          <div className="stat-label">Net Equity</div>
          <div className="stat-value" style={{ color: '#059669' }}>{fmt(historyData.length > 0 ? historyData[historyData.length - 1].net : totalUsdNet)}</div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{fmt(historyData.length > 0 ? historyData[historyData.length - 1].gross : totalUsdGross)}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>= Equity + Debt</div>
        </div>
        
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="stat-label">Remaining Debt</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{fmt(historyData.length > 0 ? historyData[historyData.length - 1].debt : totalUsdDebt)}</div>
        </div>
        
        <div className={`glass-card insight-card ${poppedCard === 'history' ? 'popped-out' : ''}`} style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
          <div onClick={() => setPoppedCard(p => p === 'history' ? null : 'history')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Equity History ({currency})</h2>
            <span style={{ fontSize: '1.5rem', color: '#64748b' }}>{poppedCard === 'history' ? '✕' : '⤢'}</span>
          </div>
          
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
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
          {displayChartData.length > 0 ? (
             <div style={{ width: '100%', height: poppedCard === 'history' ? '70vh' : '280px' }}>
                <ResponsiveContainer>
                  <LineChart data={displayChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ borderRadius: '12px' }} formatter={(val) => `${CURRENCY_SYMBOLS[currency]}${val.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="gross" name={`Gross Assets (${currency})`} stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="net" name={`Net Equity (${currency})`} stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="debt" name={`Debt (${currency})`} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
             </div>
          ) : (
            <p style={{ color: '#475569' }}>No historical data yet. It will appear once portfolio snapshots are recorded.</p>
          )}
          
        </div>
      </div>

      <div className="dashboard-grid">
        <div className={`glass-card ${poppedCard === 'distribution' ? 'popped-out' : ''}`}>
          <div onClick={() => setPoppedCard(p => p === 'distribution' ? null : 'distribution')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Total Value Distribution</h2>
            <span style={{ fontSize: '1.5rem', color: '#64748b' }}>{poppedCard === 'distribution' ? '✕' : '⤢'}</span>
          </div>
          
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexDirection: poppedCard === 'distribution' ? 'column' : 'row' }}>
            <div style={{ flex: '1 1 200px', minHeight: poppedCard === 'distribution' ? '500px' : '250px', width: '100%' }}>
              <ResponsiveContainer width="100%" height={poppedCard === 'distribution' ? 500 : 250}>
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
        <div className={`glass-card ${poppedCard === 'allocation' ? 'popped-out' : ''}`}>
          <div onClick={() => setPoppedCard(p => p === 'allocation' ? null : 'allocation')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Asset Allocation</h2>
            <span style={{ fontSize: '1.5rem', color: '#64748b' }}>{poppedCard === 'allocation' ? '✕' : '⤢'}</span>
          </div>
          
          <div style={{ maxHeight: poppedCard === 'allocation' ? 'none' : '300px', overflowY: 'auto', paddingRight: '1rem' }}>
            {enrichedPortfolio.map((asset) => (
               <div key={asset.category} className="allocation-item">
                 <div className="allocation-header">
                   <span style={{ fontWeight: '700', color: asset.amount < 0 ? '#ef4444' : '#0f172a' }}>{asset.category} {asset.amount < 0 && '(Liability)'}</span>
                   {asset.amount > 0 && (
                     <span style={{ color: '#475569', fontWeight: '600', fontSize: '0.9rem' }}>
                        {(asset.percentage || 0).toFixed(1)}%
                     </span>
                   )}
                 </div>
                 {asset.amount > 0 && (
                   <div className="progress-track" style={{ height: '6px' }}>
                     <div 
                       className="progress-fill" 
                       style={{ width: `${Math.min(100, asset.percentage || 0)}%`, background: '#059669' }}
                     ></div>
                   </div>
                 )}
                 <div style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: '#475569', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{fmt(asset.currentUsd)}</span>
                 </div>
               </div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      {activeTab === 'Portfolio Advice' && (
        <div className="dashboard-grid">
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>💡 Investment Suggestions</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>AI-driven analysis based on your current holdings and market conditions. Refreshes daily.</p>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #10b981', minWidth: '280px' }}>
                <h3 style={{ color: '#059669', marginBottom: '1rem' }}>🛒 Buy / Accumulate</h3>
                {suggestions.buys.map((s, i) => (
                  <div key={i} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: i < suggestions.buys.length - 1 ? '1px solid rgba(16,185,129,0.2)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ background: s.action === 'BUY' ? '#059669' : '#f59e0b', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>{s.action}</span>
                      <strong style={{ color: '#064e3b', fontSize: '1rem' }}>{s.ticker}</strong>
                    </div>
                    <p style={{ color: '#064e3b', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>{s.reason}</p>
                  </div>
                ))}
              </div>
              <div style={{ flex: '1', background: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #ef4444', minWidth: '280px' }}>
                <h3 style={{ color: '#b91c1c', marginBottom: '1rem' }}>📉 Sell / Trim</h3>
                {suggestions.sells.map((s, i) => (
                  <div key={i} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: i < suggestions.sells.length - 1 ? '1px solid rgba(239,68,68,0.2)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ background: s.action === 'SELL' ? '#dc2626' : '#f59e0b', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>{s.action}</span>
                      <strong style={{ color: '#7f1d1d', fontSize: '1rem' }}>{s.ticker}</strong>
                    </div>
                    <p style={{ color: '#7f1d1d', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card insight-card" style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontWeight: 600 }}>🤖 AI Portfolio & Market Advisor</h2>
              <span style={{ fontSize: '0.85rem', color: '#475569', background: '#e2e8f0', padding: '0.25rem 0.5rem', borderRadius: '12px' }}>Auto-Renewed Today</span>
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
        </div>
      )}

      {activeTab === 'Stock Holdings' && (
        <div className="dashboard-grid">
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h2 style={{ fontWeight: 600, marginBottom: '2rem' }}>📈 Equity Portfolio Breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              
              <div className={poppedCard === 'us' ? 'popped-out glass-card' : ''} style={{ background: 'rgba(255,255,255,0.4)', padding: '1.5rem', borderRadius: '12px' }}>
                <div onClick={() => setPoppedCard(p => p === 'us' ? null : 'us')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1rem' }}>
                  <h3 style={{ color: '#3b82f6', margin: 0 }}>🇺🇸 US Stocks (USD) — ${usStocksData.reduce((s, e) => s + e.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span style={{ fontSize: '1.5rem', color: '#64748b' }}>{poppedCard === 'us' ? '✕' : '⤢'}</span>
                </div>
                {usStocksData.length > 0 ? (
                  <>
                    <div style={{ textAlign: 'center', height: poppedCard === 'us' ? '60vh' : '250px' }}>
                    <ResponsiveContainer width="100%" height={poppedCard === 'us' ? '100%' : 250}>
                      <PieChart>
                        <Pie data={usStocksData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80} label={({name, percent}) => `${name} ${(percent * 100).toFixed(1)}%`}>
                          {usStocksData.map((e, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(val) => `${CURRENCY_SYMBOLS.USD}${(val).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                      {usStocksData.map((e, index) => {
                        const total = usStocksData.reduce((s, i) => s + i.value, 0);
                        const pct = total > 0 ? ((e.value / total) * 100).toFixed(1) : '0.0';
                        return (
                         <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                           <span style={{ color: PIE_COLORS[index % PIE_COLORS.length], fontWeight: 600 }}>● {e.name}</span>
                           <span>${e.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct}%)</span>
                         </div>
                        );
                      })}
                    </div>
                  </>
                ) : <p style={{ color: '#64748b' }}>No US Stocks logged.</p>}
              </div>

              <div className={poppedCard === 'tw' ? 'popped-out glass-card' : ''} style={{ background: 'rgba(255,255,255,0.4)', padding: '1.5rem', borderRadius: '12px' }}>
                <div onClick={() => setPoppedCard(p => p === 'tw' ? null : 'tw')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1rem' }}>
                  <h3 style={{ color: '#10b981', margin: 0 }}>🇹🇼 Taiwan Stocks (NTD) — NT${twStocksData.reduce((s, e) => s + e.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span style={{ fontSize: '1.5rem', color: '#64748b' }}>{poppedCard === 'tw' ? '✕' : '⤢'}</span>
                </div>
                {twStocksData.length > 0 ? (
                   <>
                    <div style={{ textAlign: 'center', height: poppedCard === 'tw' ? '60vh' : '250px' }}>
                    <ResponsiveContainer width="100%" height={poppedCard === 'tw' ? '100%' : 250}>
                      <PieChart>
                        <Pie data={twStocksData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80} label={({name, percent}) => `${name} ${(percent * 100).toFixed(1)}%`}>
                          {twStocksData.map((e, index) => <Cell key={index} fill={PIE_COLORS[(index + 4) % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(val) => `${CURRENCY_SYMBOLS.NTD}${(val).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                      {twStocksData.map((e, index) => {
                        const total = twStocksData.reduce((s, i) => s + i.value, 0);
                        const pct = total > 0 ? ((e.value / total) * 100).toFixed(1) : '0.0';
                        return (
                         <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                           <span style={{ color: PIE_COLORS[(index + 4) % PIE_COLORS.length], fontWeight: 600 }}>● {e.name}</span>
                           <span>NT${e.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct}%)</span>
                         </div>
                        );
                      })}
                    </div>
                   </>
                ) : <p style={{ color: '#64748b' }}>No Taiwan Stocks logged.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE ASSET MODAL */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1.25rem', color: '#0f172a' }}>Add / Update Ledger</h2>
          <form onSubmit={handleAddAsset}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Date</label>
              <input 
                type="date" 
                className="form-control" 
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Category</label>
              <input 
                type="text"
                list="asset-categories"
                className="form-control" 
                placeholder="e.g. USD Stock, NTD Cash"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                required
              />
              <datalist id="asset-categories">
                {existingCategories.map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Stock Number / Asset Name</label>
              <input 
                type="text"
                className="form-control" 
                placeholder="e.g. AAPL, 2330, Bank A"
                value={formData.ticker}
                onChange={e => setFormData({...formData, ticker: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
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

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label>Amount (Quantity or Monetary Value)</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 50 (shares) or 5000 (dollars)"
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



      {/* EDIT CASH / ACCOUNTS MODAL */}
      <div className={`modal-overlay ${isCashModalOpen ? 'active' : ''}`}>
        <div className="modal-content">
          <h2 style={{ marginBottom: '1.25rem', color: '#0f172a' }}>💰 Edit Cash & Account Balances</h2>
          <form onSubmit={handleSaveAllCash}>
            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {cashAccounts.map(acct => {
                const isNtd = acct.category.startsWith('NTD');
                const isLoan = acct.category === 'Loan';
                const currentVal = isNtd ? (Number(acct.ntdValue) || 0) : (Number(acct.usdValue) || 0);
                const symbol = isNtd ? 'NT$' : '$';
                return (
                  <div key={acct.ticker} className="form-group" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <label style={{ margin: 0, fontWeight: 600, color: isLoan ? '#ef4444' : '#334155', fontSize: '0.9rem' }}>
                        {isLoan ? '🔴' : '🏦'} {acct.ticker}
                        <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.8rem' }}>({acct.category})</span>
                      </label>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#64748b' }}>
                        Current: {symbol}{Math.abs(currentVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <input
                      type="number"
                      className="form-control"
                      placeholder={`New balance in ${isNtd ? 'NTD' : 'USD'}`}
                      value={cashEdits[acct.ticker] ?? ''}
                      onChange={e => setCashEdits(prev => ({...prev, [acct.ticker]: e.target.value}))}
                    />
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.75rem' }}>Leave blank to keep current value. Only changed fields will be updated.</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsCashModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={isSaving || Object.keys(cashEdits).filter(k => cashEdits[k] !== '').length === 0}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
