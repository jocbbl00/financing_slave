import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import './index.css';

function useViewport() {
  const [state, setState] = useState(() => ({
    narrow: typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setState({ narrow: mq.matches, height: window.innerHeight });
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);
  return state;
}

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

const PIE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#0ea5e9', '#eab308', '#94a3b8'];

const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)',
};

/** Fallback before first API load; server sends live GOOGLEFINANCE rates in `fx`. */
const DEFAULT_FX = { twdPerUsd: 32, jpyPerUsd: 150 };

const CURRENCY_SYMBOLS = { USD: '$', NTD: 'NT$', JPY: '¥' };

const RADIAN = Math.PI / 180;

function renderPieLabel({ cx, cy, midAngle, outerRadius, percent, index }) {
  if (percent < 0.03) return null;
  const gap = 14;
  const lineEnd = outerRadius + gap;
  const labelR = outerRadius + gap + 4;
  const cosA = Math.cos(-midAngle * RADIAN);
  const sinA = Math.sin(-midAngle * RADIAN);
  const sx = cx + outerRadius * cosA;
  const sy = cy + outerRadius * sinA;
  const ex = cx + lineEnd * cosA;
  const ey = cy + lineEnd * sinA;
  const lx = cx + labelR * cosA;
  const ly = cy + labelR * sinA;
  const textAnchor = lx > cx ? 'start' : 'end';
  const pct = `${(percent * 100).toFixed(0)}%`;
  return (
    <g key={`label-${index}`}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--text-tertiary)" strokeWidth={1} />
      <circle cx={ex} cy={ey} r={2} fill="var(--text-tertiary)" />
      <text x={lx + (lx > cx ? 4 : -4)} y={ly} textAnchor={textAnchor} dominantBaseline="central"
        style={{ fontSize: '0.65rem', fill: 'var(--text-secondary)', fontWeight: 600 }}>
        {pct}
      </text>
    </g>
  );
}

/** Pie stores wedge size in TWD-equivalent; convert to selected display currency. */
function pieNtdEquivToDisplay(ntdEquiv, currency, fx) {
  const twd = fx.twdPerUsd > 0 ? fx.twdPerUsd : DEFAULT_FX.twdPerUsd;
  const jpy = fx.jpyPerUsd > 0 ? fx.jpyPerUsd : DEFAULT_FX.jpyPerUsd;
  if (currency === 'NTD') return ntdEquiv;
  const usd = ntdEquiv / twd;
  if (currency === 'USD') return usd;
  return usd * jpy;
}

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
  '2887E': 'Taishin Fin (Pfd)', '2882A': 'Cathay Fin (Pfd)',
};
const tickerLabel = (ticker) => {
  const name = TICKER_NAMES[ticker];
  return name ? `${name} · ${ticker}` : String(ticker);
};

/** Sheet DisplayName + symbol/code; else mapped name · code. */
const twDisplayLabel = (ticker, displayName) => {
  const d = displayName && String(displayName).trim();
  if (d) return `${d} · ${ticker}`;
  return tickerLabel(ticker);
};

const usDisplayLabel = (ticker, displayName) => {
  const d = displayName && String(displayName).trim();
  if (d) return `${d} · ${ticker}`;
  return tickerLabel(ticker);
};

export default function App() {
  const [portfolio, setPortfolio] = useState([]);       // OVERVIEW-level 6-category summary
  const [portfolioItems, setPortfolioItems] = useState([]); // Individual stock/cash/debt rows
  const [historyData, setHistoryData] = useState([]);    // Historical gross/debt/net snapshots
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    loanName: '',
    portfolioTicker: '',
    principalNtd: '',
    annualRatePct: '',
    termMonths: '',
    startDate: new Date().toISOString().split('T')[0],
    monthlyPaymentNtd: '',
    notes: '',
  });
  const [poppedCard, setPoppedCard] = useState(null);
  const [timeFilter, setTimeFilter] = useState('All');
  const [currency, setCurrency] = useState('USD');
  const [activeTab, setActiveTab] = useState('Overview');
  const [roiTab, setRoiTab] = useState('US');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    ticker: '',
    stockName: '',
    amount: '',
    type: 'Buy',
    price: '',
  });
  const [cashEdits, setCashEdits] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [fxRates, setFxRates] = useState(DEFAULT_FX);
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      void 0;
    }
  }, [theme]);
  const chartTooltipStyle = useMemo(
    () =>
      theme === 'light'
        ? { borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.12)' }
        : CHART_TOOLTIP_STYLE,
    [theme]
  );
  const displayMult = useMemo(
    () => ({
      USD: 1,
      NTD: fxRates.twdPerUsd > 0 ? fxRates.twdPerUsd : DEFAULT_FX.twdPerUsd,
      JPY: fxRates.jpyPerUsd > 0 ? fxRates.jpyPerUsd : DEFAULT_FX.jpyPerUsd,
    }),
    [fxRates.twdPerUsd, fxRates.jpyPerUsd]
  );

  const { narrow: isNarrow, height: viewportH } = useViewport();
  const poppedChartHeight = isNarrow ? Math.min(400, Math.round(viewportH * 0.52)) : 500;
  const collapsedChartHeight = isNarrow ? 300 : 320;
  const pieRadii = (popped) =>
    popped
      ? { inner: isNarrow ? '22%' : '28%', outer: isNarrow ? '42%' : '48%' }
      : { inner: isNarrow ? '26%' : '30%', outer: isNarrow ? '48%' : '52%' };

  const addFormCategory = formData.category.trim();
  const isUsdStockCat = addFormCategory === 'USD Stock';
  const isTwStockCat = addFormCategory === 'NTD Stock' || addFormCategory === 'NTD Preferred';

  useEffect(() => {
    fetchPortfolio();
  }, []);

  useEffect(() => {
    if (!poppedCard) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setPoppedCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poppedCard]);

  const fetchPortfolio = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(API_URL);
      const json = await res.json();
      
      if (json.fx && typeof json.fx.twdPerUsd === 'number' && typeof json.fx.jpyPerUsd === 'number') {
        setFxRates({
          twdPerUsd: json.fx.twdPerUsd > 0 ? json.fx.twdPerUsd : DEFAULT_FX.twdPerUsd,
          jpyPerUsd: json.fx.jpyPerUsd > 0 ? json.fx.jpyPerUsd : DEFAULT_FX.jpyPerUsd,
        });
      }

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

    } catch (err) {
      console.error('Failed to fetch portfolio data', err);
    } finally {
      setIsLoading(false);
    }
  };

  const existingCategories = [...new Set(portfolio.map(p => p.category))];

  const twdPerUsdSafe = fxRates.twdPerUsd > 0 ? fxRates.twdPerUsd : DEFAULT_FX.twdPerUsd;

  const totalUsdGross = portfolio.reduce((acc, curr) => {
    const isUsd = curr.category.startsWith('USD') || curr.category === 'Loan';
    const val = isUsd ? curr.amount : curr.amount / twdPerUsdSafe;
    return val > 0 ? acc + val : acc;
  }, 0);

  const totalUsdDebt = portfolio.reduce((acc, curr) => {
    const isUsd = curr.category.startsWith('USD') || curr.category === 'Loan';
    const val = isUsd ? curr.amount : curr.amount / twdPerUsdSafe;
    return val < 0 ? acc + Math.abs(val) : acc;
  }, 0);

  const totalUsdNet = totalUsdGross - totalUsdDebt;

  const fmt = (usdVal) => {
    const converted = usdVal * displayMult[currency];
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
    value: Math.abs(
      a.category.startsWith('NTD') ? a.amount : a.amount * twdPerUsdSafe
    ),
    fill: a.amount < 0 ? '#ef4444' : undefined // Custom fill hook for later versions, defaulting via pie mapping below
  }));

  // Build Historical Chart Data from History sheet snapshots
  const historicalChartData = historyData.map(h => {
    const d = new Date(h.date);
    const label = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}`;
    return {
      name: label,
      gross: Math.round((h.gross || 0) * displayMult[currency]),
      net: Math.round((h.net || 0) * displayMult[currency]),
      debt: Math.round((h.debt || 0) * displayMult[currency]),
    };
  });

  let displayChartData = historicalChartData;
  if (timeFilter === '6M') {
    displayChartData = historicalChartData.slice(-6);
  } else if (timeFilter === '1Y') {
    displayChartData = historicalChartData.slice(-12);
  }


  // AI-driven investment suggestions (static templates; personalized with your holdings)
  const generateInvestmentSuggestions = () => {
    const usHoldings = portfolioItems.filter(a => a.category === 'USD Stock');

    const buys = [
      { ticker: 'NVDA', action: 'BUY', reason: 'AI infrastructure demand continues to accelerate. Your position ($' + Math.round(usHoldings.find(h => h.ticker === 'NVDA')?.usdValue || 0).toLocaleString() + ') is strong but NVDA remains the foundational AI compute play with expanding margins. Consider adding on any dips below $120.' },
      { ticker: 'GOOGL', action: 'BUY', reason: 'Alphabet is undervalued relative to its AI capabilities (Gemini) and cloud growth. Your ' + (usHoldings.find(h => h.ticker === 'GOOGL')?.qty || 0) + ' shares give you exposure but the P/E ratio suggests room for accumulation.' },
      { ticker: 'TSMC (2330)', action: 'HOLD', reason: 'Your largest TW position. TSMC dominates advanced chip manufacturing with 90%+ market share in sub-7nm. Geopolitical risk is the main concern — hold but do not add aggressively.' },
    ];

    const sells = [
      { ticker: 'PLUG', action: 'TRIM', reason: 'Plug Power continues burning cash with no clear path to profitability. Your 120 shares at ~$' + Math.round(usHoldings.find(h => h.ticker === 'PLUG')?.usdValue || 0).toLocaleString() + ' is a high-risk bet. Consider trimming to 50 shares and reallocating to profitable companies.' },
      { ticker: 'EVGO', action: 'TRIM', reason: 'EV charging is a tough business with slow returns. Your 50 shares carry high risk. Consider cutting to 20 and rotating into energy infrastructure (VRT, NEE).' },
    ];

    return { buys, sells };
  };
  const suggestions = generateInvestmentSuggestions();

  const analyzePortfolio = () => {
    const sections = [];

    const industryItems = [
      '🧠 AI & data centers — Optical interconnect and power/cooling for hyperscale clusters remain key. Watch: COHR, VRT.',
      '⚡ Rates & liquidity — Fed path and real yields drive US equity multiples; check yields when sizing risk.',
      '🏭 Semis & Taiwan — Equipment demand (ASML, AMAT) and TAIEX breadth matter for your US + TW book.',
    ];

    const marketNewsLinks = [
      {
        text: 'S&P 500 (US broad market)',
        url: 'https://finance.yahoo.com/quote/%5EGSPC/',
        summary: 'Large-cap US benchmark index — use level, trend, and volatility as context for USD stocks.',
      },
      {
        text: 'TAIEX (Taiwan broad market)',
        url: 'https://finance.yahoo.com/quote/%5ETWII/',
        summary: 'Taiwan Weighted Index — overall local market tone vs your NTD / Taiwan listings.',
      },
      {
        text: 'Forbes · Why the 2026 Fintech Boom Is About More Than AI',
        url: 'https://www.forbes.com/sites/zennonkapron/2026/04/01/why-the-2026-fintech-funding-boom-is-about-more-than-ai/',
        summary: '10+ mega-rounds in Q1 alone — embedded finance, stablecoins for B2B settlement, and scaling beyond the AI hype.',
      },
      {
        text: 'Deloitte · 2026 Semiconductor Industry Outlook',
        url: 'https://www.deloitte.com/us/en/insights/industry/technology/technology-media-telecom-outlooks/semiconductor-industry-outlook.html',
        summary: 'AI chips approaching 73% of industry revenue; HBM4, advanced packaging bottlenecks, and geopolitical risks to watch.',
      },
      {
        text: 'ING · Central Banks in 2026: Rate Move Predictions',
        url: 'https://think.ing.com/articles/central-banks-predictions-for-2026',
        summary: 'Fed cutting to ~3.25%, ECB done, BOJ hiking — bank-by-bank outlook on rates, yields, and what it means for portfolios.',
      },
    ];

    sections.push({
      title: 'Industries to Monitor',
      icon: '🔭',
      color: '#10b981',
      items: industryItems,
    });

    sections.push({
      title: 'News to Keep an Eye On',
      icon: '📰',
      color: '#3b82f6',
      links: marketNewsLinks,
    });

    return sections;
  };
  const advice = analyzePortfolio();

  // Build pie chart data from individual portfolio items (using tickers)
  const usStocksData = portfolioItems
      .filter(a => a.category === 'USD Stock' && (Number(a.usdValue) || 0) > 0)
      .map(a => ({
        ticker: a.ticker,
        name: usDisplayLabel(a.ticker, a.displayName),
        value: Number(a.usdValue) || 0,
      }));

  const twStocksData = portfolioItems
      .filter(a => a.category === 'NTD Stock' && (Number(a.ntdValue) || 0) > 0)
      .map(a => ({
        ticker: a.ticker,
        name: twDisplayLabel(a.ticker, a.displayName),
        value: Number(a.ntdValue) || 0,
      }));

  // Cash accounts for the edit modal (loans: Add Loan + sheet sync in backend)
  const cashAccounts = portfolioItems.filter(a =>
    a.category === 'USD Cash' || a.category === 'NTD Cash' ||
    a.category === 'USD Preferred'
  );

  const handleSaveAllCash = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      for (const [ticker, amount] of Object.entries(cashEdits)) {
        if (amount === '') continue;
        const acct = cashAccounts.find(a => a.ticker === ticker);
        if (!acct || acct.category === 'Loan') continue;
        const cur = acct.category.startsWith('NTD') ? 'NTD' : 'USD';
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

  const handleAddLoan = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_loan',
          loanName: loanForm.loanName || loanForm.portfolioTicker,
          portfolioTicker: loanForm.portfolioTicker.trim(),
          principalNtd: Number(loanForm.principalNtd),
          annualRatePct: Number(loanForm.annualRatePct),
          termMonths: Number(loanForm.termMonths),
          startDate: loanForm.startDate,
          monthlyPaymentNtd: loanForm.monthlyPaymentNtd === '' ? '' : Number(loanForm.monthlyPaymentNtd),
          notes: loanForm.notes,
        }),
      });
      setIsLoanModalOpen(false);
      setLoanForm({
        loanName: '',
        portfolioTicker: '',
        principalNtd: '',
        annualRatePct: '',
        termMonths: '',
        startDate: new Date().toISOString().split('T')[0],
        monthlyPaymentNtd: '',
        notes: '',
      });
      fetchPortfolio();
    } catch (err) {
      console.error('Failed to add loan', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const qty = Number(formData.amount);
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ 
          action: 'update_ledger', 
          date: formData.date, 
          category: formData.category, 
          ticker: formData.ticker, 
          qty,
          type: formData.type,
          price: Number(formData.price) || 0,
          displayName: formData.stockName.trim(),
        }),
      });

      setIsModalOpen(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        category: '',
        ticker: '',
        stockName: '',
        amount: '',
        type: 'Buy',
        price: '',
      });
      fetchPortfolio();
    } catch (err) {
      console.error('Failed to update asset', err);
    } finally {
      setIsSaving(false);
    }
  };



  if (isLoading) {
    return (
      <div className="loading-screen-root">
        <h2 className="loading-screen-title">Your slave is working hard....</h2>
      </div>
    );
  }

  return (
    <div className="app-container">
      {poppedCard && <div className="popped-out-backdrop" onClick={() => setPoppedCard(null)} />}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/favicon.jpg" alt="icon" style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
          <div>
            <h1>Yarin's Accounting Slave</h1>
            <p>Real-time Portfolio Tracking & Analytics</p>
          </div>
        </div>
        <div className="header-toolbar">
          <div className="currency-tabs" role="group" aria-label="Display currency">
            {['USD', 'NTD', 'JPY'].map((c) => (
              <button
                key={c}
                type="button"
                className={`currency-tabs__btn${currency === c ? ' currency-tabs__btn--active' : ''}`}
                onClick={() => setCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀ Day' : '🌙 Night'}
          </button>
          <button className="primary-btn secondary" onClick={() => { setCashEdits({}); setIsCashModalOpen(true); }}>
            💰 Edit Cash
          </button>
          <button className="primary-btn secondary" onClick={() => setIsLoanModalOpen(true)}>
            📉 Add Loan
          </button>
          <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Stock
          </button>
        </div>
        <div className="main-tabs" role="tablist" aria-label="Main sections">
          {['Overview', 'Portfolio Advice', 'Stock Holdings'].map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`main-tabs__btn${activeTab === tab ? ' main-tabs__btn--active' : ''}`}
              onClick={() => setActiveTab(tab)}
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
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(historyData.length > 0 ? historyData[historyData.length - 1].net : totalUsdNet)}</div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{fmt(historyData.length > 0 ? historyData[historyData.length - 1].gross : totalUsdGross)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>= Equity + Debt</div>
        </div>
        
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="stat-label">Remaining Debt</div>
          <div className="stat-value" style={{ color: '#f87171' }}>{fmt(historyData.length > 0 ? historyData[historyData.length - 1].debt : totalUsdDebt)}</div>
        </div>

        <div className={`glass-card insight-card ${poppedCard === 'history' ? 'popped-out' : ''}`} style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
          <div onClick={() => setPoppedCard(p => p === 'history' ? null : 'history')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Equity History ({currency})</h2>
            <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'history' ? '✕' : '⤢'}</span>
          </div>
          
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {['6M', '1Y', 'All'].map(tf => (
                <button 
                  key={tf}
                  onClick={() => setTimeFilter(tf)}
                  style={{ 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '20px', 
                    border: '1px solid rgba(234, 179, 8, 0.25)', 
                    background: timeFilter === tf ? 'linear-gradient(135deg, #ca8a04, #eab308)' : 'transparent',
                    color: timeFilter === tf ? '#0f172a' : 'var(--text-tertiary)',
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
             <div className="chart-wrap" style={{ width: '100%', height: poppedCard === 'history' ? (isNarrow ? Math.min(380, Math.round(viewportH * 0.55)) : Math.round(viewportH * 0.65)) : 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(val) => `${CURRENCY_SYMBOLS[currency]}${val.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="gross" name={`Gross Assets (${currency})`} stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="net" name={`Net Equity (${currency})`} stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="debt" name={`Debt (${currency})`} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
             </div>
          ) : (
            <p style={{ color: 'var(--text-tertiary)' }}>No historical data yet. It will appear once portfolio snapshots are recorded.</p>
          )}
          
        </div>
      </div>

      <div className="dashboard-grid">
        <div className={`glass-card ${poppedCard === 'distribution' ? 'popped-out' : ''}`}>
          <div onClick={() => setPoppedCard(p => p === 'distribution' ? null : 'distribution')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Total Value Distribution</h2>
            <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'distribution' ? '✕' : '⤢'}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <div className="chart-wrap" style={{ width: '100%', minHeight: poppedCard === 'distribution' ? poppedChartHeight : collapsedChartHeight }}>
              <ResponsiveContainer width="100%" height={poppedCard === 'distribution' ? poppedChartHeight : collapsedChartHeight}>
                <PieChart>
                  <Pie 
                    data={pieData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={pieRadii(poppedCard === 'distribution').inner}
                    outerRadius={pieRadii(poppedCard === 'distribution').outer}
                    paddingAngle={4}
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill || PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) =>
                      `${CURRENCY_SYMBOLS[currency]}${pieNtdEquivToDisplay(value, currency, fxRates).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    } 
                    contentStyle={chartTooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="pie-legend">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="pie-legend-item">
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: entry.fill || PIE_COLORS[index % PIE_COLORS.length], flexShrink: 0 }}></span>
                  <span>{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
          
        </div>

        {/* Allocation List Card */}
        <div className={`glass-card ${poppedCard === 'allocation' ? 'popped-out' : ''}`}>
          <div onClick={() => setPoppedCard(p => p === 'allocation' ? null : 'allocation')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>Asset Allocation</h2>
            <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'allocation' ? '✕' : '⤢'}</span>
          </div>
          
          <div className="card-scroll" style={{ maxHeight: poppedCard === 'allocation' ? 'none' : '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {enrichedPortfolio.map((asset) => (
               <div key={asset.category} className="allocation-item">
                 <div className="allocation-header">
                   <span style={{ fontWeight: '700', color: asset.amount < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{asset.category} {asset.amount < 0 && '(Liability)'}</span>
                   {asset.amount > 0 && (
                     <span style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.9rem' }}>
                        {(asset.percentage || 0).toFixed(1)}%
                     </span>
                   )}
                 </div>
                 {asset.amount > 0 && (
                   <div className="progress-track" style={{ height: '6px' }}>
                     <div 
                       className="progress-fill" 
                       style={{ width: `${Math.min(100, asset.percentage || 0)}%`, background: 'var(--success)' }}
                     ></div>
                   </div>
                 )}
                 <div style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{fmt(asset.currentUsd)}</span>
                 </div>
               </div>
            ))}
          </div>
        </div>

        {/* ROI Tracking Card */}
        <div className={`glass-card ${poppedCard === 'roi' ? 'popped-out' : ''}`}>
          <div onClick={() => setPoppedCard(p => p === 'roi' ? null : 'roi')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>📈 ROI Tracking</h2>
            <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'roi' ? '✕' : '⤢'}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setRoiTab('US'); }}
              style={{
                flex: 1,
                padding: '0.4rem',
                background: roiTab === 'US' ? '#3b82f6' : 'rgba(30, 41, 59, 0.85)',
                color: roiTab === 'US' ? '#fff' : 'var(--text-secondary)',
                border: roiTab === 'US' ? '1px solid transparent' : '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >🇺🇸 US</button>
            <button
              onClick={(e) => { e.stopPropagation(); setRoiTab('TW'); }}
              style={{
                flex: 1,
                padding: '0.4rem',
                background: roiTab === 'TW' ? '#10b981' : 'rgba(30, 41, 59, 0.85)',
                color: roiTab === 'TW' ? '#fff' : 'var(--text-secondary)',
                border: roiTab === 'TW' ? '1px solid transparent' : '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >🇹🇼 TW</button>
          </div>
          
          <div className="card-scroll" style={{ maxHeight: poppedCard === 'roi' ? 'none' : '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
             {portfolioItems.filter(i => {
                const targetCategory = roiTab === 'US' ? 'USD Stock' : 'NTD Stock';
                const isTarget = i.category === targetCategory || (targetCategory === 'NTD Stock' && i.category === 'NTD Preferred');
                return isTarget && Number(i.usdValue) !== 0;
             }).length === 0 && (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '1rem' }}>No {roiTab} stocks to track.</p>
             )}
             {portfolioItems.filter(i => {
                const targetCategory = roiTab === 'US' ? 'USD Stock' : 'NTD Stock';
                const isTarget = i.category === targetCategory || (targetCategory === 'NTD Stock' && i.category === 'NTD Preferred');
                return isTarget && Number(i.usdValue) !== 0;
             }).map(item => {
               const histPrice = Number(item.histPrice) || 0;
               const qty = Number(item.qty) || 1;
               const isNtd = item.category === 'NTD Stock' || item.category === 'NTD Preferred';
               
               const curPriceUsd = Number(item.usdValue) / qty;
               const curPriceNtd = Number(item.ntdValue) / qty;
               const currentPrice = isNtd ? curPriceNtd : curPriceUsd;
               
               const roi = histPrice > 0 ? ((currentPrice / histPrice) - 1) * 100 : 0;
               const isPositive = roi >= 0;
               
               return (
                 <div key={item.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', alignItems: 'center' }}>
                   <div>
                     <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                       {item.category === 'USD Stock'
                         ? usDisplayLabel(item.ticker, item.displayName)
                         : twDisplayLabel(item.ticker, item.displayName)}
                     </strong>
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>Qty: {qty}</div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                     <div style={{ color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: '1.1rem' }}>
                       {histPrice > 0 ? `${isPositive ? '+' : ''}${roi.toFixed(2)}%` : 'TBD'}
                     </div>
                     <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                       {isNtd ? 'NT$' : '$'}{currentPrice.toFixed(2)} / {histPrice > 0 ? `${isNtd ? 'NT$' : '$'}${histPrice.toFixed(2)}` : 'Wait'}
                     </div>
                   </div>
                 </div>
               );
             })}
          </div>
        </div>
      </div>
      </>
      )}

      {activeTab === 'Portfolio Advice' && (
        <div className="dashboard-grid">
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <div className="advice-main-head">
              <h3 className="advice-card-title">💡 Investment Suggestions</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              Templates personalize with your holdings from the sheet. This is not a live AI feed — refresh after updating the spreadsheet to see numbers and names change.
            </p>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', background: 'rgba(16, 185, 129, 0.12)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(52, 211, 153, 0.25)', borderLeft: '4px solid #34d399', minWidth: '280px' }}>
                <h3 style={{ color: '#6ee7b7', marginBottom: '1rem' }}>🛒 Buy / Accumulate</h3>
                {suggestions.buys.map((s, i) => (
                  <div key={i} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: i < suggestions.buys.length - 1 ? '1px solid rgba(52, 211, 153, 0.2)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ background: s.action === 'BUY' ? '#059669' : '#d97706', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>{s.action}</span>
                      <strong style={{ color: '#ecfdf5', fontSize: '1rem' }}>{s.ticker}</strong>
                    </div>
                    <p style={{ color: '#d1fae5', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>{s.reason}</p>
                  </div>
                ))}
              </div>
              <div style={{ flex: '1', background: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(248, 113, 113, 0.25)', borderLeft: '4px solid #f87171', minWidth: '280px' }}>
                <h3 style={{ color: '#fca5a5', marginBottom: '1rem' }}>📉 Sell / Trim</h3>
                {suggestions.sells.map((s, i) => (
                  <div key={i} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: i < suggestions.sells.length - 1 ? '1px solid rgba(248, 113, 113, 0.2)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={{ background: s.action === 'SELL' ? '#dc2626' : '#d97706', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>{s.action}</span>
                      <strong style={{ color: '#fef2f2', fontSize: '1rem' }}>{s.ticker}</strong>
                    </div>
                    <p style={{ color: '#fecaca', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card insight-card" style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
            <div className="advice-main-head">
              <h3 className="advice-card-title">
                🤖 AI portfolio & market advisor
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
              {advice.map((section, idx) => (
                 <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.65)', padding: '1.25rem 1.5rem', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.2)', borderLeft: `6px solid ${section.color}` }}>
                   <div className="advice-section-head">
                     <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{section.icon}</span>
                     <h3 className="advice-card-title" style={{ margin: 0 }}>{section.title}</h3>
                   </div>
                   {section.items && section.items.map((item, i) => (
                     <p key={i} style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: '1.7', margin: '0 0 0.5rem 0', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(148, 163, 184, 0.35)' }}>{item}</p>
                   ))}
                   {section.links && (
                     <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                       {section.links.map((link, i) => (
                         <li key={i} style={{ marginBottom: '1rem' }}>
                           <a 
                             href={link.url} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             style={{ color: '#93c5fd', fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                           >
                             🔗 {link.text}
                           </a>
                           {link.summary && (
                             <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: '0.25rem 0 0 1.5rem', lineHeight: '1.5', fontWeight: 400 }}>{link.summary}</p>
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
          <div className="holdings-section">
            <h2 style={{ fontWeight: 600, marginBottom: '2rem' }}>📈 Equity Portfolio Breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              
              <div className={`glass-card ${poppedCard === 'us' ? 'popped-out' : ''}`}>
                <div
                  className="expand-card-hit"
                  onClick={() => setPoppedCard(p => p === 'us' ? null : 'us')}
                  style={{ justifyContent: 'space-between', cursor: 'pointer', marginBottom: '1rem' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPoppedCard(p => p === 'us' ? null : 'us'); } }}
                >
                  <h3 style={{ color: '#3b82f6', margin: 0 }}>🇺🇸 US Stocks (USD) — ${usStocksData.reduce((s, e) => s + e.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'us' ? '✕' : '⤢'}</span>
                </div>
                {usStocksData.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                    <div className="chart-wrap" style={{ width: '100%', minHeight: poppedCard === 'us' ? poppedChartHeight : collapsedChartHeight }}>
                      <ResponsiveContainer width="100%" height={poppedCard === 'us' ? poppedChartHeight : collapsedChartHeight}>
                        <PieChart>
                          <Pie 
                            data={usStocksData} 
                            dataKey="value" 
                            nameKey="name" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={pieRadii(poppedCard === 'us').inner}
                            outerRadius={pieRadii(poppedCard === 'us').outer}
                            paddingAngle={4}
                            label={renderPieLabel}
                            labelLine={false}
                            isAnimationActive={false}
                            activeIndex={-1}
                            activeShape={null}
                          >
                            {usStocksData.map((e, index) => <Cell key={e.ticker} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(val) => `${CURRENCY_SYMBOLS.USD}${(val).toLocaleString()}`} contentStyle={chartTooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="pie-legend">
                      {usStocksData.map((e, index) => {
                        const total = usStocksData.reduce((s, i) => s + i.value, 0);
                        const pct = total > 0 ? ((e.value / total) * 100).toFixed(1) : '0.0';
                        return (
                          <div key={e.ticker} className="pie-legend-item">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[index % PIE_COLORS.length], flexShrink: 0 }}></span>
                            <span>{e.name} - ${e.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--text-tertiary)' }}>No US Stocks logged.</p>}
              </div>

              <div className={`glass-card ${poppedCard === 'tw' ? 'popped-out' : ''}`}>
                <div
                  className="expand-card-hit"
                  onClick={() => setPoppedCard(p => p === 'tw' ? null : 'tw')}
                  style={{ justifyContent: 'space-between', cursor: 'pointer', marginBottom: '1rem' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPoppedCard(p => p === 'tw' ? null : 'tw'); } }}
                >
                  <h3 style={{ color: '#10b981', margin: 0 }}>🇹🇼 Taiwan Stocks (NTD) — NT${twStocksData.reduce((s, e) => s + e.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'tw' ? '✕' : '⤢'}</span>
                </div>
                {twStocksData.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                    <div className="chart-wrap" style={{ width: '100%', minHeight: poppedCard === 'tw' ? poppedChartHeight : collapsedChartHeight }}>
                      <ResponsiveContainer width="100%" height={poppedCard === 'tw' ? poppedChartHeight : collapsedChartHeight}>
                        <PieChart>
                          <Pie 
                            data={twStocksData} 
                            dataKey="value" 
                            nameKey="name" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={pieRadii(poppedCard === 'tw').inner}
                            outerRadius={pieRadii(poppedCard === 'tw').outer}
                            paddingAngle={4}
                            label={renderPieLabel}
                            labelLine={false}
                            isAnimationActive={false}
                            activeIndex={-1}
                            activeShape={null}
                          >
                            {twStocksData.map((e, index) => <Cell key={e.ticker} fill={PIE_COLORS[(index + 4) % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(val) => `${CURRENCY_SYMBOLS.NTD}${(val).toLocaleString()}`} contentStyle={chartTooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="pie-legend">
                      {twStocksData.map((e, index) => {
                        const total = twStocksData.reduce((s, i) => s + i.value, 0);
                        const pct = total > 0 ? ((e.value / total) * 100).toFixed(1) : '0.0';
                        return (
                          <div key={e.ticker} className="pie-legend-item">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[(index + 4) % PIE_COLORS.length], flexShrink: 0 }}></span>
                            <span>{e.name} - NT${e.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--text-tertiary)' }}>No Taiwan Stocks logged.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE ASSET MODAL */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`} onClick={() => setIsModalOpen(false)} role="presentation">
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom: '1.25rem' }}>Add Stock</h2>
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
                placeholder="e.g. USD Stock, NTD Stock"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                required
              />
              <datalist id="asset-categories">
                {existingCategories.map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>
                {isUsdStockCat
                  ? 'US ticker (exchange symbol)'
                  : isTwStockCat
                    ? 'Taiwan stock code (numeric / letter suffix)'
                    : 'Ticker / account identifier'}
              </label>
              <input 
                type="text"
                className="form-control" 
                placeholder={
                  isUsdStockCat
                    ? 'e.g. AAPL, MSFT'
                    : isTwStockCat
                      ? 'e.g. 2330, 00687B, 2887E'
                      : 'Pick category first (e.g. USD Stock or NTD Stock)'
                }
                value={formData.ticker}
                onChange={e => setFormData({...formData, ticker: e.target.value})}
                required
              />
            </div>

            {(isUsdStockCat || isTwStockCat) && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Stock name (optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. TSMC — saved to sheet DisplayName; shown in charts"
                  value={formData.stockName}
                  onChange={e => setFormData({ ...formData, stockName: e.target.value })}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.35rem', marginBottom: 0 }}>
                  The sheet keeps <strong>Ticker</strong> for prices (GOOGLEFINANCE) and <strong>DisplayName</strong> for labels.
                </p>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label>Type</label>
                <select 
                  className="form-control"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                >
                  <option value="Buy">Buy</option>
                  <option value="Sell">Sell</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Price (Per Share) *Optional</label>
                <input 
                  type="number"
                  className="form-control"
                  placeholder="e.g. 150.00"
                  value={formData.price}
                  onChange={e => setFormData({...formData, price: e.target.value})}
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label>Quantity</label>
              <input 
                type="number" 
                className="form-control" 
                placeholder="e.g. 50 (shares)"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                min="0"
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Add Stock'}
              </button>
            </div>
          </form>
        </div>
      </div>



      {/* ADD LOAN MODAL */}
      <div className={`modal-overlay ${isLoanModalOpen ? 'active' : ''}`} onClick={() => setIsLoanModalOpen(false)} role="presentation">
        <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom: '0.5rem' }}>📉 Add Loan</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1.25rem' }}>
            Stored on the <strong style={{ color: 'var(--accent-yellow)' }}>Loans</strong> sheet. Remaining balance is recalculated on each load (fixed-rate amortization). Portfolio ticker must match the <code style={{ color: 'var(--accent-yellow)' }}>Loan</code> row name (e.g. NTD Student Loan).
          </p>
          <form onSubmit={handleAddLoan}>
            <div className="form-group">
              <label>Display name</label>
              <input
                className="form-control"
                placeholder="e.g. NTD Student Loan"
                value={loanForm.loanName}
                onChange={e => setLoanForm({ ...loanForm, loanName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Portfolio ticker (unique)</label>
              <input
                className="form-control"
                placeholder="Matches Portfolio Loan row — e.g. NTD Student Loan"
                value={loanForm.portfolioTicker}
                onChange={e => setLoanForm({ ...loanForm, portfolioTicker: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Original principal (NTD)</label>
              <input
                type="number"
                className="form-control"
                min="1"
                step="1"
                value={loanForm.principalNtd}
                onChange={e => setLoanForm({ ...loanForm, principalNtd: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label>Annual interest rate (%)</label>
                <input
                  type="number"
                  className="form-control"
                  min="0"
                  step="0.01"
                  value={loanForm.annualRatePct}
                  onChange={e => setLoanForm({ ...loanForm, annualRatePct: e.target.value })}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Term (months)</label>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  step="1"
                  value={loanForm.termMonths}
                  onChange={e => setLoanForm({ ...loanForm, termMonths: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>First payment / start month</label>
              <input
                type="date"
                className="form-control"
                value={loanForm.startDate}
                onChange={e => setLoanForm({ ...loanForm, startDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Monthly payment (NTD, optional)</label>
              <input
                type="number"
                className="form-control"
                min="0"
                step="1"
                placeholder="Leave blank to use standard amortization payment"
                value={loanForm.monthlyPaymentNtd}
                onChange={e => setLoanForm({ ...loanForm, monthlyPaymentNtd: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <input
                className="form-control"
                value={loanForm.notes}
                onChange={e => setLoanForm({ ...loanForm, notes: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsLoanModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save loan'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* EDIT CASH / ACCOUNTS MODAL */}
      <div className={`modal-overlay ${isCashModalOpen ? 'active' : ''}`} onClick={() => setIsCashModalOpen(false)} role="presentation">
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom: '1.25rem' }}>💰 Edit Cash & Account Balances</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
            Loan balances are computed from the <strong style={{ color: 'var(--accent-yellow)' }}>Loans</strong> sheet (amortization). Use Add Loan to register a new facility or edit rows in the spreadsheet.
          </p>
          <form onSubmit={handleSaveAllCash}>
            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {cashAccounts.map(acct => {
                const isNtd = acct.category.startsWith('NTD');
                const currentVal = isNtd ? (Number(acct.ntdValue) || 0) : (Number(acct.usdValue) || 0);
                const symbol = isNtd ? 'NT$' : '$';
                return (
                  <div key={acct.ticker} className="form-group" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <label style={{ margin: 0, fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        🏦 {acct.ticker}
                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: '0.5rem', fontSize: '0.8rem' }}>({acct.category})</span>
                      </label>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
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
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.75rem' }}>Leave blank to keep current value. Only changed fields will be updated.</p>
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
