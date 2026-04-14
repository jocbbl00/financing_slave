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

const LOADING_DOT_PHASES = ['.', '..', '...', '....'];

function LoadingScreen() {
  const [dotPhase, setDotPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setDotPhase((p) => (p + 1) % LOADING_DOT_PHASES.length);
    }, 420);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="loading-screen-root">
      <h2 className="loading-screen-title">
        <span className="loading-screen-title-line">
          Your slave is working hard
          <span className="loading-screen-dots" aria-hidden="true">
            {LOADING_DOT_PHASES[dotPhase]}
          </span>
          <span className="loading-screen-runner" aria-hidden="true" title="Running">
            🏃‍♂️
          </span>
        </span>
      </h2>
    </div>
  );
}

const API_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec';

/** Same workbook as Code.gs `SPREADSHEET_ID_` — open in browser to edit the sheet. */
const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U/edit';

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

const UI_TEXT = {
  en: {
    appTitle: "Yarin's Accounting Slave",
    appSubtitle: 'Real-time Portfolio Tracking & Analytics',
    languageZh: '中文',
    languageEn: 'ENG',
    sheet: '📊 Sheet',
    editCash: '💰 Edit Cash',
    addLoan: '📉 Add Loan',
    addStock: 'Add Stock',
    tabs: { overview: 'Overview', advice: 'Portfolio Advice', holdings: 'Stock Holdings' },
    investmentSuggestions: '💡 Investment Suggestions',
    suggestionHint:
      'Templates personalize with your holdings from the sheet. This is not a live AI feed — refresh after updating the spreadsheet to see numbers and names change.',
    buyAccumulate: '🛒 Buy / Accumulate',
    sellTrim: '📉 Sell / Trim',
    netEquity: 'Net Equity',
    totalAssets: 'Total Assets',
    remainingDebt: 'Remaining Debt',
    equityHistory: 'Equity History',
    noHistory: 'No historical data yet. It will appear once portfolio snapshots are recorded.',
    totalValueDistribution: 'Total Value Distribution',
    assetAllocation: 'Asset Allocation',
    roiTracking: '📈 ROI Tracking',
    noRoiStocks: 'No {market} stocks to track.',
    aiAdvisorTitle: '🤖 AI portfolio & market advisor',
    equityPortfolioBreakdown: '📈 Equity Portfolio Breakdown',
    usStocksTitle: '🇺🇸 US Stocks (USD)',
    twStocksTitle: '🇹🇼 Taiwan Stocks (NTD)',
    noUsStocks: 'No US Stocks logged.',
    noTwStocks: 'No Taiwan Stocks logged.',
  },
  zh: {
    appTitle: 'Yarin 財務小助手',
    appSubtitle: '即時投資組合追蹤與分析',
    languageZh: '中文',
    languageEn: 'ENG',
    sheet: '📊 試算表',
    editCash: '💰 編輯現金',
    addLoan: '📉 新增貸款',
    addStock: '新增股票',
    tabs: { overview: '總覽', advice: '投資建議', holdings: '持股明細' },
    investmentSuggestions: '💡 投資建議',
    suggestionHint:
      '建議內容會依你的持股自動帶入。這不是即時 AI 訊號；更新試算表後重新整理可看到最新數字與名稱。',
    buyAccumulate: '🛒 買進 / 加碼',
    sellTrim: '📉 賣出 / 減碼',
    netEquity: '淨資產',
    totalAssets: '總資產',
    remainingDebt: '剩餘負債',
    equityHistory: '資產歷史',
    noHistory: '目前還沒有歷史資料，記錄後會自動顯示。',
    totalValueDistribution: '總價值分布',
    assetAllocation: '資產配置',
    roiTracking: '📈 報酬率追蹤',
    noRoiStocks: '目前沒有可追蹤的 {market} 股票。',
    aiAdvisorTitle: '🤖 AI 投資組合與市場顧問',
    equityPortfolioBreakdown: '📈 股票持倉拆解',
    usStocksTitle: '🇺🇸 美股（USD）',
    twStocksTitle: '🇹🇼 台股（NTD）',
    noUsStocks: '目前沒有美股持倉。',
    noTwStocks: '目前沒有台股持倉。',
  },
};

function getLocalRotationDayNumber(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let dayNum = Math.floor(Date.UTC(y, m, d) / 86400000);
  // Rotate to next daily set at 11:59 PM local time.
  if (now.getHours() === 23 && now.getMinutes() >= 59) dayNum += 1;
  return dayNum;
}

function makePieLabel(expanded) {
  return function PieLabel({ cx, cy, midAngle, outerRadius, name, percent, index }) {
    if (percent < 0.01) return null;
    const gap = expanded ? 34 : 24;
    const dotR = expanded ? 3 : 2;
    const fontSize = expanded ? '0.82rem' : '0.65rem';
    const cosA = Math.cos(-midAngle * RADIAN);
    const sinA = Math.sin(-midAngle * RADIAN);
    const maxXRadius = Math.max(outerRadius + 8, (cx - 12) / Math.max(Math.abs(cosA), 0.0001));
    const maxYRadius = Math.max(outerRadius + 8, (cy - 12) / Math.max(Math.abs(sinA), 0.0001));
    const maxRadius = Math.min(maxXRadius, maxYRadius);
    const lineEnd = Math.max(outerRadius + 6, Math.min(outerRadius + gap, maxRadius - 8));
    const labelR = Math.max(lineEnd + 4, Math.min(lineEnd + 8, maxRadius));
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
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--text-tertiary)" strokeWidth={expanded ? 1.5 : 1} />
        <circle cx={ex} cy={ey} r={dotR} fill="var(--text-tertiary)" />
        <text x={lx + (lx > cx ? 5 : -5)} y={ly} textAnchor={textAnchor} dominantBaseline="central"
          style={{ fontSize, fill: 'var(--text-secondary)', fontWeight: 600 }}>
          {name} {pct}
        </text>
      </g>
    );
  };
}

/** Pie leader lines (stock holdings): `Apple · 3.8% (14sh)` — name, one-decimal %, shares. */
function makeHoldingsPieLabel(expanded) {
  return function HoldingsPieLabel({ cx, cy, midAngle, outerRadius, percent, index, payload }) {
    if (percent < 0.01) return null;
    const p = payload || {};
    const legName = pieLegendStockName(p.ticker, p.displayName);
    const qty = Number(p.qty);
    const pctStr = `${Number((percent * 100).toFixed(1))}%`;
    const sharePart = Number.isFinite(qty) ? ` (${pieLegendShareSuffix(qty)})` : '';
    const labelText = `${legName} · ${pctStr}${sharePart}`;
    const gap = expanded ? 34 : 24;
    const dotR = expanded ? 3 : 2;
    const fontSize = expanded ? '0.82rem' : '0.65rem';
    const cosA = Math.cos(-midAngle * RADIAN);
    const sinA = Math.sin(-midAngle * RADIAN);
    const maxXRadius = Math.max(outerRadius + 8, (cx - 12) / Math.max(Math.abs(cosA), 0.0001));
    const maxYRadius = Math.max(outerRadius + 8, (cy - 12) / Math.max(Math.abs(sinA), 0.0001));
    const maxRadius = Math.min(maxXRadius, maxYRadius);
    const lineEnd = Math.max(outerRadius + 6, Math.min(outerRadius + gap, maxRadius - 8));
    const labelR = Math.max(lineEnd + 4, Math.min(lineEnd + 8, maxRadius));
    const sx = cx + outerRadius * cosA;
    const sy = cy + outerRadius * sinA;
    const ex = cx + lineEnd * cosA;
    const ey = cy + lineEnd * sinA;
    const lx = cx + labelR * cosA;
    const ly = cy + labelR * sinA;
    const textAnchor = lx > cx ? 'start' : 'end';
    return (
      <g key={`hlabel-${index}`}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--text-tertiary)" strokeWidth={expanded ? 1.5 : 1} />
        <circle cx={ex} cy={ey} r={dotR} fill="var(--text-tertiary)" />
        <text x={lx + (lx > cx ? 5 : -5)} y={ly} textAnchor={textAnchor} dominantBaseline="central"
          style={{ fontSize, fill: 'var(--text-secondary)', fontWeight: 600 }}>
          {labelText}
        </text>
      </g>
    );
  };
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

/** Pie legend: company name only (sheet name, else map, else ticker). */
function pieLegendStockName(ticker, displayName) {
  const d = displayName && String(displayName).trim();
  if (d) return d;
  const mapped = TICKER_NAMES[ticker];
  if (mapped) return mapped;
  return String(ticker);
}

function pieLegendShareSuffix(qty) {
  const n = Number(qty) || 0;
  const s = Number.isInteger(n) ? String(n) : String(n.toLocaleString(undefined, { maximumFractionDigits: 4 }));
  return `${s}sh`;
}

const DAILY_NEWS_POOL = {
  WIRED: [
    {
      text: 'WIRED · The AI Data Center Boom Is Warping the US Economy',
      url: 'https://www.wired.com/story/data-center-ai-boom-us-economy-jobs/',
      summary: 'Tracks how hyperscaler capex and power demand are changing jobs, local grids, and AI infrastructure economics.',
    },
    {
      text: 'WIRED · Arm Is Now Making Its Own Chips',
      url: 'https://www.wired.com/story/chip-design-firm-arm-is-making-its-own-ai-cpu',
      summary: 'Covers competitive shifts in AI compute and chip supply that can affect semiconductor valuation assumptions.',
    },
    {
      text: 'WIRED · OpenAI’s AMD Deal Is a Bet on AI Demand',
      url: 'https://www.wired.com/story/openai-amd-deal-data-center-chips/',
      summary: 'Highlights demand outlook for data-center GPUs and infrastructure, relevant to broader AI hardware momentum.',
    },
  ],
  WSJ: [
    {
      text: 'WSJ · Treasury Yields, Dollar Rise on Fed’s Hawkish Tone',
      url: 'https://on.wsj.com/48UduHJ',
      summary: 'Useful read for rate-path risk: bond yields and USD moves directly affect valuation multiples and global risk appetite.',
    },
    {
      text: 'WSJ · Markets Coverage',
      url: 'https://www.wsj.com/news/markets',
      summary: 'Daily market pulse for macro drivers (rates, dollar, equities) that feed through to portfolio risk-on/risk-off behavior.',
    },
    {
      text: 'WSJ · Economy Coverage',
      url: 'https://www.wsj.com/economy',
      summary: 'Macro and policy updates to track labor, inflation, and growth signals that influence portfolio positioning.',
    },
  ],
  ECONOMIST: [
    {
      text: 'The Economist · The Semiconductor Choke-point',
      url: 'https://www.economist.com/asia/2024/06/13/the-semiconductor-choke-point',
      summary: 'Explains Taiwan concentration risk and supply-chain geopolitics that can swing both your US chip names and TSMC exposure.',
    },
    {
      text: 'The Economist · TSMC Walks a Geopolitical Tightrope',
      url: 'https://www.economist.com/business/2024/11/14/tsmc-walks-a-geopolitical-tightrope',
      summary: 'Focuses on balancing US/China pressures and implications for semiconductor capex and supply resilience.',
    },
    {
      text: 'The Economist · Soldiers of the Silicon Supply Chain Are Worried',
      url: 'https://www.economist.com/business/2024/05/30/the-soldiers-of-the-silicon-supply-chain-are-worried',
      summary: 'Details supply-chain fragility and geopolitical scenarios that can reprice semiconductor and Taiwan risk quickly.',
    },
  ],
};

function getEtRotationDayNumber(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const y = pick('year');
  const m = pick('month');
  const d = pick('day');
  const h = pick('hour');
  const min = pick('minute');
  let dayNum = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  // Rotate to next daily set at 11:59 PM ET.
  if (h === 23 && min >= 59) dayNum += 1;
  return dayNum;
}

function selectDailyNews(dayNumber) {
  const pickFrom = (arr, offset) => arr[((dayNumber + offset) % arr.length + arr.length) % arr.length];
  return [
    pickFrom(DAILY_NEWS_POOL.WIRED, 0),
    pickFrom(DAILY_NEWS_POOL.WSJ, 1),
    pickFrom(DAILY_NEWS_POOL.ECONOMIST, 2),
  ];
}

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
  const [activeTab, setActiveTab] = useState('overview');
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
  const [newsTick, setNewsTick] = useState(() => Date.now());
  const [liveNews, setLiveNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [fxRates, setFxRates] = useState(DEFAULT_FX);
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('language') === 'zh' ? 'zh' : 'en';
    } catch {
      return 'en';
    }
  });
  const t = UI_TEXT[language];
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      void 0;
    }
  }, [theme]);
  useEffect(() => {
    try {
      localStorage.setItem('language', language);
    } catch {
      void 0;
    }
  }, [language]);
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
      ? { inner: isNarrow ? '22%' : '30%', outer: isNarrow ? '42%' : '55%' }
      : { inner: isNarrow ? '26%' : '30%', outer: isNarrow ? '48%' : '52%' };

  const addFormCategory = formData.category.trim();
  const isUsdStockCat = addFormCategory === 'USD Stock';
  const isTwStockCat = addFormCategory === 'NTD Stock' || addFormCategory === 'NTD Preferred';

  useEffect(() => {
    fetchPortfolio();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNewsTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const FEEDS = [
      { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
      { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC' },
      { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
    ];
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ONE_WEEK_MS;

    const fetchFeed = async ({ url, source }) => {
      const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=5`;
      const res = await fetch(api);
      const data = await res.json();
      if (data.status !== 'ok') return null;
      const recent = (data.items || []).find(
        (item) => new Date(item.pubDate).getTime() > cutoff
      );
      if (!recent) return null;
      return {
        text: `${source} · ${recent.title}`,
        url: recent.link,
        summary: (recent.description || '').replace(/<[^>]+>/g, '').slice(0, 160).trim() || recent.title,
        pubDate: recent.pubDate,
      };
    };

    Promise.allSettled(FEEDS.map(fetchFeed)).then((results) => {
      const articles = results
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value);
      setLiveNews(articles);
      setNewsLoading(false);
    });
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

  // Sheet may have daily snapshots; chart shows one point per calendar month (latest snapshot in that month).
  const historyLatestPerMonth = (() => {
    const byMonth = new Map();
    for (const h of historyData) {
      const d = new Date(h.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const prev = byMonth.get(key);
      if (!prev || d > new Date(prev.date)) byMonth.set(key, h);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, row]) => row);
  })();

  const historicalChartData = historyLatestPerMonth.map((h) => {
    const d = new Date(h.date);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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


  // AI-driven investment suggestions (daily rotation; personalized with your holdings)
  const generateInvestmentSuggestions = (dayNumber) => {
    const usHoldings = portfolioItems.filter(a => a.category === 'USD Stock');

    const buySets = [
      [
        { ticker: 'NVDA', action: 'BUY', reason: 'AI infrastructure demand continues to accelerate. Your position ($' + Math.round(usHoldings.find(h => h.ticker === 'NVDA')?.usdValue || 0).toLocaleString() + ') is strong but NVDA remains the foundational AI compute play with expanding margins. Consider adding on any dips below $120.' },
        { ticker: 'GOOGL', action: 'BUY', reason: 'Alphabet is undervalued relative to its AI capabilities (Gemini) and cloud growth. Your ' + (usHoldings.find(h => h.ticker === 'GOOGL')?.qty || 0) + ' shares give you exposure but the P/E ratio suggests room for accumulation.' },
        { ticker: 'TSMC (2330)', action: 'HOLD', reason: 'Your largest TW position. TSMC dominates advanced chip manufacturing with 90%+ market share in sub-7nm. Geopolitical risk is the main concern — hold but do not add aggressively.' },
      ],
      [
        { ticker: 'MSFT', action: 'BUY', reason: 'Azure + Copilot monetization continues to support earnings quality. Use pullbacks to add gradually if weighting is still below your core target.' },
        { ticker: 'AMZN', action: 'BUY', reason: 'AWS AI workloads and ad margin expansion support medium-term upside. A disciplined DCA approach can reduce timing risk.' },
        { ticker: 'TSMC (2330)', action: 'HOLD', reason: 'Keep as semiconductor core exposure. Maintain position sizing discipline because geopolitics can still create sudden volatility.' },
      ],
    ];

    const sellSets = [
      [
        { ticker: 'PLUG', action: 'TRIM', reason: 'Plug Power continues burning cash with no clear path to profitability. Your 120 shares at ~$' + Math.round(usHoldings.find(h => h.ticker === 'PLUG')?.usdValue || 0).toLocaleString() + ' is a high-risk bet. Consider trimming to 50 shares and reallocating to profitable companies.' },
        { ticker: 'EVGO', action: 'TRIM', reason: 'EV charging is a tough business with slow returns. Your 50 shares carry high risk. Consider cutting to 20 and rotating into energy infrastructure (VRT, NEE).' },
      ],
      [
        { ticker: 'PLTR', action: 'TRIM', reason: 'If position weight rises too quickly after momentum runs, trim partial gains and rebalance into lower-volatility core names.' },
        { ticker: 'High-beta small caps', action: 'TRIM', reason: 'When real yields rise, high-beta speculative names often re-rate first. Reduce exposure if macro conditions tighten.' },
      ],
    ];

    const buys = buySets[((dayNumber % buySets.length) + buySets.length) % buySets.length];
    const sells = sellSets[((dayNumber % sellSets.length) + sellSets.length) % sellSets.length];

    return { buys, sells };
  };
  const suggestionDayNumber = useMemo(() => getLocalRotationDayNumber(new Date(newsTick)), [newsTick]);
  const suggestions = useMemo(
    () => generateInvestmentSuggestions(suggestionDayNumber),
    [suggestionDayNumber, portfolioItems]
  );
  const rotatingNews = useMemo(
    () => selectDailyNews(getEtRotationDayNumber(new Date(newsTick))),
    [newsTick]
  );

  const analyzePortfolio = () => {
    const sections = [];

    const industryItems = [
      '🧠 AI & data centers — Optical interconnect and power/cooling for hyperscale clusters remain key. Watch: COHR, VRT.',
      '⚡ Rates & liquidity — Fed path and real yields drive US equity multiples; check yields when sizing risk.',
      '🏭 Semis & Taiwan — Equipment demand (ASML, AMAT) and TAIEX breadth matter for your US + TW book.',
    ];

    const newsItems = liveNews.length > 0 ? liveNews : rotatingNews;
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
      ...newsItems,
    ];

    sections.push({
      title: 'Industries to Monitor',
      icon: '🔭',
      color: '#10b981',
      items: industryItems,
    });

    sections.push({
      title: newsLoading ? 'News to Keep an Eye On (loading…)' : liveNews.length > 0 ? 'News to Keep an Eye On (past 7 days)' : 'News to Keep an Eye On',
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
        displayName: a.displayName,
        name: usDisplayLabel(a.ticker, a.displayName),
        value: Number(a.usdValue) || 0,
        qty: Number(a.qty) || 0,
      }));

  const twStocksData = portfolioItems
      .filter(a => a.category === 'NTD Stock' && (Number(a.ntdValue) || 0) > 0)
      .map(a => ({
        ticker: a.ticker,
        displayName: a.displayName,
        name: twDisplayLabel(a.ticker, a.displayName),
        value: Number(a.ntdValue) || 0,
        qty: Number(a.qty) || 0,
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
    return <LoadingScreen />;
  }

  return (
    <div className="app-container">
      {poppedCard && <div className="popped-out-backdrop" onClick={() => setPoppedCard(null)} />}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/favicon.jpg" alt="icon" style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
          <div>
            <h1>{t.appTitle}</h1>
            <p>{t.appSubtitle}</p>
          </div>
        </div>
        <div className="header-toolbar">
          <div className="currency-tabs toolbar-lang-tabs" role="group" aria-label="Language">
            {[
              { key: 'zh', label: t.languageZh },
              { key: 'en', label: t.languageEn },
            ].map((lang) => (
              <button
                key={lang.key}
                type="button"
                className={`currency-tabs__btn${language === lang.key ? ' currency-tabs__btn--active' : ''}`}
                onClick={() => setLanguage(lang.key)}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <div className="currency-tabs toolbar-currency-tabs" role="group" aria-label="Display currency">
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
            className="theme-toggle toolbar-theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀ Day' : '🌙 Night'}
          </button>
          <a
            href={SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="primary-btn secondary header-sheet-link"
            title="Open portfolio Google Sheet"
          >
            {t.sheet}
          </a>
          <button className="primary-btn secondary toolbar-editcash-btn" onClick={() => { setCashEdits({}); setIsCashModalOpen(true); }}>
            {t.editCash}
          </button>
          <button className="primary-btn secondary toolbar-loan-btn" onClick={() => setIsLoanModalOpen(true)}>
            {isNarrow ? '+ Add Loan' : t.addLoan}
          </button>
          <button className="primary-btn toolbar-add-btn" onClick={() => setIsModalOpen(true)}>
            {!isNarrow && (
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            {isNarrow ? '+ Add Stock' : t.addStock}
          </button>
        </div>
        <div className="main-tabs" role="tablist" aria-label="Main sections">
          {[
            { key: 'overview', label: t.tabs.overview },
            { key: 'advice', label: t.tabs.advice },
            { key: 'holdings', label: t.tabs.holdings },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`main-tabs__btn${activeTab === tab.key ? ' main-tabs__btn--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'overview' && (
      <>
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #10b981' }}>
          <div className="stat-label">{t.netEquity}</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(historyData.length > 0 ? historyData[historyData.length - 1].net : totalUsdNet)}</div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-label">{t.totalAssets}</div>
          <div className="stat-value">{fmt(historyData.length > 0 ? historyData[historyData.length - 1].gross : totalUsdGross)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>= Equity + Debt</div>
        </div>
        
        <div className="glass-card stat-card" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="stat-label">{t.remainingDebt}</div>
          <div className="stat-value" style={{ color: '#f87171' }}>{fmt(historyData.length > 0 ? historyData[historyData.length - 1].debt : totalUsdDebt)}</div>
        </div>

        <div className={`glass-card insight-card ${poppedCard === 'history' ? 'popped-out' : ''}`} style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
          <div onClick={() => setPoppedCard(p => p === 'history' ? null : 'history')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>{t.equityHistory} ({currency})</h2>
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
                  <LineChart data={displayChartData} margin={{ top: 8, right: 8, left: 4, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      interval={0}
                      angle={-32}
                      textAnchor="end"
                      height={48}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                    />
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
            <p style={{ color: 'var(--text-tertiary)' }}>{t.noHistory}</p>
          )}
          
        </div>
      </div>

      <div className="dashboard-grid">
        <div className={`glass-card ${poppedCard === 'distribution' ? 'popped-out' : ''}`}>
          <div onClick={() => setPoppedCard(p => p === 'distribution' ? null : 'distribution')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '1rem' }}>
            <h2 style={{ fontWeight: 600, margin: 0 }}>{t.totalValueDistribution}</h2>
            <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'distribution' ? '✕' : '⤢'}</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
            <div
              className="chart-wrap"
              style={{
                width: '100%',
                minWidth: 0,
                height: poppedCard === 'distribution' ? poppedChartHeight : collapsedChartHeight,
                minHeight: poppedCard === 'distribution' ? poppedChartHeight : collapsedChartHeight,
              }}
            >
              <ResponsiveContainer width="100%" height={poppedCard === 'distribution' ? poppedChartHeight : collapsedChartHeight}>
                <PieChart>
                  <Pie 
                    data={pieData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="48%" 
                    cy="50%" 
                    innerRadius={pieRadii(poppedCard === 'distribution').inner}
                    outerRadius={pieRadii(poppedCard === 'distribution').outer}
                    paddingAngle={4}
                    label={makePieLabel(poppedCard === 'distribution' && !isNarrow)}
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
            <h2 style={{ fontWeight: 600, margin: 0 }}>{t.assetAllocation}</h2>
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
            <h2 style={{ fontWeight: 600, margin: 0 }}>{t.roiTracking}</h2>
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
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '1rem' }}>
                  {t.noRoiStocks.replace('{market}', roiTab)}
                </p>
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

      {activeTab === 'advice' && (
        <div className="dashboard-grid">
          <div className="glass-card portfolio-advice-card" style={{ gridColumn: '1 / -1' }}>
            <div className="advice-main-head">
              <h3 className="advice-card-title">{t.investmentSuggestions}</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.55 }}>
              {t.suggestionHint}
            </p>
            <div className="advice-suggestion-columns">
              <div className="advice-suggestion-panel advice-suggestion-panel--buy">
                <h3 className="advice-suggestion-panel__heading">{t.buyAccumulate}</h3>
                {suggestions.buys.map((s, i) => (
                  <div
                    key={i}
                    className={`advice-suggestion-row advice-suggestion-row--buy${i < suggestions.buys.length - 1 ? ' advice-suggestion-row--border-buy' : ''}`}
                  >
                    <div className="advice-suggestion-row__meta">
                      <span className={`advice-suggestion-badge ${s.action === 'BUY' ? 'advice-suggestion-badge--buy' : 'advice-suggestion-badge--hold'}`}>{s.action}</span>
                      <strong className="advice-suggestion-ticker advice-suggestion-ticker--buy">{s.ticker}</strong>
                    </div>
                    <p className="advice-suggestion-reason advice-suggestion-reason--buy">{s.reason}</p>
                  </div>
                ))}
              </div>
              <div className="advice-suggestion-panel advice-suggestion-panel--sell">
                <h3 className="advice-suggestion-panel__heading">{t.sellTrim}</h3>
                {suggestions.sells.map((s, i) => (
                  <div
                    key={i}
                    className={`advice-suggestion-row advice-suggestion-row--sell${i < suggestions.sells.length - 1 ? ' advice-suggestion-row--border-sell' : ''}`}
                  >
                    <div className="advice-suggestion-row__meta">
                      <span className={`advice-suggestion-badge ${s.action === 'SELL' ? 'advice-suggestion-badge--sell' : 'advice-suggestion-badge--trim'}`}>{s.action}</span>
                      <strong className="advice-suggestion-ticker advice-suggestion-ticker--sell">{s.ticker}</strong>
                    </div>
                    <p className="advice-suggestion-reason advice-suggestion-reason--sell">{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card insight-card portfolio-advice-card" style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
            <div className="advice-main-head">
              <h3 className="advice-card-title">
                {t.aiAdvisorTitle}
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
              {advice.map((section, idx) => (
                 <div key={idx} className="advisor-section-card" style={{ borderLeft: `6px solid ${section.color}` }}>
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
                             className="advice-market-link"
                             style={{ fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
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

      {activeTab === 'holdings' && (
        <div className="dashboard-grid">
          <div className="holdings-section">
            <h2 style={{ fontWeight: 600, marginBottom: '2rem' }}>{t.equityPortfolioBreakdown}</h2>
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
                  <h3 style={{ color: '#3b82f6', margin: 0 }}>{t.usStocksTitle} — ${usStocksData.reduce((s, e) => s + e.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'us' ? '✕' : '⤢'}</span>
                </div>
                {usStocksData.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
                    <div
                      className="chart-wrap"
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: poppedCard === 'us' ? poppedChartHeight : collapsedChartHeight,
                        minHeight: poppedCard === 'us' ? poppedChartHeight : collapsedChartHeight,
                      }}
                    >
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
                            label={makeHoldingsPieLabel(poppedCard === 'us' && !isNarrow)}
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
                    <div className="pie-legend pie-legend--two-rows">
                      {usStocksData.map((e, index) => {
                        const total = usStocksData.reduce((s, i) => s + i.value, 0);
                        const pctNum = total > 0 ? (e.value / total) * 100 : 0;
                        const pctStr = `${Number(pctNum.toFixed(1))}%`;
                        const legName = pieLegendStockName(e.ticker, e.displayName);
                        return (
                          <div key={e.ticker} className="pie-legend-item">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[index % PIE_COLORS.length], flexShrink: 0 }}></span>
                            <span>{legName} · {e.ticker} · {pctStr} ({pieLegendShareSuffix(e.qty)})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--text-tertiary)' }}>{t.noUsStocks}</p>}
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
                  <h3 style={{ color: '#10b981', margin: 0 }}>{t.twStocksTitle} — NT${twStocksData.reduce((s, e) => s + e.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>{poppedCard === 'tw' ? '✕' : '⤢'}</span>
                </div>
                {twStocksData.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
                    <div
                      className="chart-wrap"
                      style={{
                        width: '100%',
                        minWidth: 0,
                        height: poppedCard === 'tw' ? poppedChartHeight : collapsedChartHeight,
                        minHeight: poppedCard === 'tw' ? poppedChartHeight : collapsedChartHeight,
                      }}
                    >
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
                            label={makeHoldingsPieLabel(poppedCard === 'tw' && !isNarrow)}
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
                    <div className="pie-legend pie-legend--one-column">
                      {twStocksData.map((e, index) => {
                        const total = twStocksData.reduce((s, i) => s + i.value, 0);
                        const pctNum = total > 0 ? (e.value / total) * 100 : 0;
                        const pctStr = `${Number(pctNum.toFixed(1))}%`;
                        const legName = pieLegendStockName(e.ticker, e.displayName);
                        return (
                          <div key={e.ticker} className="pie-legend-item">
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[(index + 4) % PIE_COLORS.length], flexShrink: 0 }}></span>
                            <span>{legName} · {e.ticker} · {pctStr} ({pieLegendShareSuffix(e.qty)})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--text-tertiary)' }}>{t.noTwStocks}</p>}
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
