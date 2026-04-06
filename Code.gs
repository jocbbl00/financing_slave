// Wealth Allocator - Google Apps Script Backend

/** Live FX: Portfolio formulas reference these cells (one GOOGLEFINANCE each). */
var FX_SHEET_NAME_ = 'FX';
var FX_TWD_PER_USD_REF_ = 'FX!$B$1';

/** Workbook the web app reads/writes — must match your real file. */
var SPREADSHEET_ID_ = '1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U';

function ensureFxSheet_(spreadsheet) {
  var sh = spreadsheet.getSheetByName(FX_SHEET_NAME_);
  if (!sh) sh = spreadsheet.insertSheet(FX_SHEET_NAME_);
  sh.getRange('A1').setValue('TWD per 1 USD');
  sh.getRange('B1').setFormula('=GOOGLEFINANCE("CURRENCY:USDTWD")');
  sh.getRange('A2').setValue('JPY per 1 USD');
  sh.getRange('B2').setFormula('=GOOGLEFINANCE("CURRENCY:USDJPY")');
  // Keep FX visible so you can confirm rates; if it was hidden before, show it again.
  try {
    sh.showSheet();
  } catch (e) {}
  return sh;
}

/** Numeric rates for API (fallback if formulas not yet calculated). */
function readFxRates_(spreadsheet) {
  ensureFxSheet_(spreadsheet);
  var sh = spreadsheet.getSheetByName(FX_SHEET_NAME_);
  var twd = Number(sh.getRange('B1').getValue());
  var jpy = Number(sh.getRange('B2').getValue());
  if (!twd || twd <= 0 || isNaN(twd)) twd = 32;
  if (!jpy || jpy <= 0 || isNaN(jpy)) jpy = 150;
  return { twdPerUsd: twd, jpyPerUsd: jpy };
}

/** Full calendar months from start → as-of (inclusive of partial months by day rule). */
function paymentMonthsElapsed_(startDate, asOfDate, termMonths) {
  const s = new Date(startDate);
  const a = new Date(asOfDate);
  if (isNaN(s.getTime()) || isNaN(a.getTime())) return 0;
  let k = (a.getFullYear() - s.getFullYear()) * 12 + (a.getMonth() - s.getMonth());
  if (a.getDate() < s.getDate()) k -= 1;
  const n = Math.floor(Number(termMonths) || 0);
  return Math.max(0, Math.min(n, k));
}

/** Standard fixed-rate amortization: remaining principal after k payments. */
function remainingBalanceNtd_(principal, annualRatePct, termMonths, paymentsMade) {
  const n = Math.floor(Number(termMonths) || 0);
  const P = Number(principal);
  if (n <= 0 || P <= 0) return 0;
  const k = Math.min(n, Math.max(0, Math.floor(paymentsMade)));
  const r = Number(annualRatePct) / 100 / 12;
  if (r <= 0) return Math.max(0, P - (P / n) * k);
  const A = Math.pow(1 + r, n);
  if (Math.abs(A - 1) < 1e-14) return Math.max(0, P - (P / n) * k);
  return P * (A - Math.pow(1 + r, k)) / (A - 1);
}

function monthlyPaymentNtd_(principal, annualRatePct, termMonths) {
  const n = Math.floor(Number(termMonths) || 0);
  const P = Number(principal);
  if (n <= 0 || P <= 0) return 0;
  const r = Number(annualRatePct) / 100 / 12;
  if (r <= 0) return P / n;
  const A = Math.pow(1 + r, n);
  return P * r * A / (A - 1);
}

function ensureLoansSheet_(spreadsheet) {
  let sh = spreadsheet.getSheetByName('Loans');
  if (!sh) {
    sh = spreadsheet.insertSheet('Loans');
    sh.getRange(1, 1, 1, 8).setValues([[
      'LoanName', 'PortfolioTicker', 'PrincipalNtd', 'AnnualRatePct', 'TermMonths', 'StartDate', 'MonthlyPaymentNtd', 'Notes'
    ]]);
    sh.getRange(1, 1, 1, 8).setFontWeight('bold');
    for (let c = 1; c <= 8; c++) sh.autoResizeColumn(c);
    // Calibrated: NT$61,705/mo, balance NT$3,677,746 Apr 2026 → ~2.1% APR, P≈NT$12.08M, 240 mo, start 2011-07
    sh.appendRow([
      'NTD Student Loan',
      'NTD Student Loan',
      12084039,
      2.1,
      240,
      new Date(2011, 6, 1),
      61705,
      'Reverse-engineered from Apr 2026 snapshot (61,705/mo, 3,677,746 remaining, 20y term)'
    ]);
  }
  return sh;
}

function readLoansForApi_(loansSheet) {
  const last = loansSheet.getLastRow();
  if (last < 2) return [];
  const rows = loansSheet.getRange(2, 1, last, 8).getValues();
  const asOf = new Date();
  return rows.filter(function (r) { return r[0] && r[1]; }).map(function (r) {
    var principal = Number(r[2]) || 0;
    var rate = Number(r[3]) || 0;
    var term = Number(r[4]) || 0;
    var start = r[5] instanceof Date ? r[5] : new Date(r[5]);
    var overrideM = (r[6] !== '' && r[6] != null && !isNaN(Number(r[6]))) ? Number(r[6]) : null;
    var k = paymentMonthsElapsed_(start, asOf, term);
    var bal = remainingBalanceNtd_(principal, rate, term, k);
    var m = overrideM != null ? overrideM : monthlyPaymentNtd_(principal, rate, term);
    return {
      loanName: r[0],
      portfolioTicker: r[1],
      principalNtd: principal,
      annualRatePct: rate,
      termMonths: term,
      startDate: Utilities.formatDate(start, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      monthlyPaymentNtd: Math.round(m * 100) / 100,
      remainingNtd: Math.round(bal * 100) / 100,
      paymentsApplied: k,
      notes: r[7] || ''
    };
  });
}

/** Writes computed loan balances into Portfolio (Loan rows). */
function syncLoansToPortfolio_(spreadsheet) {
  ensureFxSheet_(spreadsheet);
  var portfolioSheet = spreadsheet.getSheetByName('Portfolio');
  if (!portfolioSheet) return;
  var L = getPortfolioLayout_(portfolioSheet);
  var loansSheet = ensureLoansSheet_(spreadsheet);
  var last = loansSheet.getLastRow();
  if (last < 2) return;
  var data = loansSheet.getRange(2, 1, last, 8).getValues();
  var asOf = new Date();

  for (var ri = 0; ri < data.length; ri++) {
    var row = data[ri];
    if (!row[0] || !row[1]) continue;
    var ticker = String(row[1]).trim();
    var principal = Number(row[2]) || 0;
    var rate = Number(row[3]) || 0;
    var term = Number(row[4]) || 0;
    var start = row[5] instanceof Date ? row[5] : new Date(row[5]);
    var k = paymentMonthsElapsed_(start, asOf, term);
    var bal = remainingBalanceNtd_(principal, rate, term, k);

    var pLast = portfolioSheet.getLastRow();
    var found = false;
    if (pLast >= 2) {
      var pData = portfolioSheet.getRange(2, 1, pLast, 2).getValues();
      for (var i = 0; i < pData.length; i++) {
        if (pData[i][0] === 'Loan' && String(pData[i][1]).trim() === ticker) {
          var rowIdx = i + 2;
          portfolioSheet.getRange(rowIdx, L.colNtd).setValue(-Math.abs(bal));
          portfolioSheet.getRange(rowIdx, L.colUsd).setFormula('=' + columnToLetter_(L.colNtd) + rowIdx + '/' + FX_TWD_PER_USD_REF_);
          portfolioSheet.getRange(rowIdx, L.colQty).setValue('');
          if (L.colName) portfolioSheet.getRange(rowIdx, L.colName).setValue('');
          if (L.colCost) portfolioSheet.getRange(rowIdx, L.colCost).clearContent();
          found = true;
          break;
        }
      }
    }
    if (!found) {
      var newRow = pLast < 2 ? 2 : pLast + 1;
      portfolioSheet.getRange(newRow, L.colCat).setValue('Loan');
      portfolioSheet.getRange(newRow, L.colTick).setValue(ticker);
      if (L.colName) portfolioSheet.getRange(newRow, L.colName).setValue('');
      portfolioSheet.getRange(newRow, L.colQty).setValue('');
      portfolioSheet.getRange(newRow, L.colNtd).setValue(-Math.abs(bal));
      portfolioSheet.getRange(newRow, L.colUsd).setFormula('=' + columnToLetter_(L.colNtd) + newRow + '/' + FX_TWD_PER_USD_REF_);
    }
  }
}

/** 1-based column indices for Portfolio sheet (legacy: Qty in col C; new: DisplayName col C, Qty col D). */
function getPortfolioLayout_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) {
    return { colCat: 1, colTick: 2, colName: 3, colQty: 4, colUsd: 5, colNtd: 6, colCost: 7, readWidth: 7, hasName: true };
  }
  var nc = Math.max(5, Math.min(sheet.getLastColumn(), 8));
  var header = sheet.getRange(1, 1, 1, nc).getValues()[0];
  var h2 = String(header[2] || '').trim();
  if (h2 === 'Qty') {
    return {
      colCat: 1, colTick: 2, colName: 0, colQty: 3, colUsd: 4, colNtd: 5,
      colCost: nc >= 6 ? 6 : 0, readWidth: Math.max(6, nc), hasName: false
    };
  }
  return { colCat: 1, colTick: 2, colName: 3, colQty: 4, colUsd: 5, colNtd: 6, colCost: 7, readWidth: 7, hasName: true };
}

function columnToLetter_(col) {
  var s = '';
  var c = col;
  while (c > 0) {
    var r = (c - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function ensureTransactionsSchema_(txSheet) {
  if (!txSheet) return;
  var a1 = String(txSheet.getRange(1, 1).getValue() || '').trim();
  if (a1 === 'TxID') return;
  var lr = txSheet.getLastRow();
  if (lr < 1) {
    txSheet.getRange(1, 1, 1, 7).setValues([['TxID', 'Date', 'Category', 'Ticker', 'Qty', 'Type', 'UnitPrice']]);
    txSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    return;
  }
  if (a1 !== 'Date') return;
  var lc = Math.max(6, txSheet.getLastColumn());
  var data = txSheet.getRange(1, 1, lr, lc).getValues();
  txSheet.clear();
  txSheet.getRange(1, 1, 1, 7).setValues([['TxID', 'Date', 'Category', 'Ticker', 'Qty', 'Type', 'UnitPrice']]);
  txSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    txSheet.getRange(r + 1, 1, r + 1, 7).setValues([[
      r,
      row[0],
      row[1],
      row[2],
      row[3],
      row[4] || 'Buy',
      row[5] != null && row[5] !== '' ? row[5] : 0
    ]]);
  }
}

function nextTxId_(txSheet) {
  var lr = txSheet.getLastRow();
  if (lr < 2) return 1;
  var ids = txSheet.getRange(2, 1, lr, 1).getValues();
  var m = 0;
  for (var i = 0; i < ids.length; i++) {
    var v = Number(ids[i][0]);
    if (!isNaN(v) && v > m) m = v;
  }
  return m + 1;
}

/** Weighted average cost per share after a buy; sells keep prior avg. Opening basis stays GOOGLEFINANCE 2025-01-01 until a buy with unit price. */
function updateAvgCostAfterTrade_(sheet, L, rowIdx, category, type, mathQty, unitPrice) {
  if (category !== 'USD Stock' && category !== 'NTD Stock' && category !== 'NTD Preferred') return;
  if (!L.colCost) return;
  var qCell = sheet.getRange(rowIdx, L.colQty);
  var cCell = sheet.getRange(rowIdx, L.colCost);
  var newQty = Number(qCell.getValue()) || 0;
  if (newQty <= 0) {
    cCell.clearContent();
    return;
  }
  if (type === 'Sell' || mathQty < 0) return;
  if (!(Number(unitPrice) > 0 && mathQty > 0)) return;
  var pq = newQty - mathQty;
  if (pq < 0) pq = 0;
  var oldAvg = Number(cCell.getValue());
  if (isNaN(oldAvg)) oldAvg = 0;
  var newAvg = pq <= 0 ? Number(unitPrice) : (pq * oldAvg + mathQty * Number(unitPrice)) / newQty;
  cCell.setValue(Math.round(newAvg * 10000) / 10000);
}

function doGet(e) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID_);
  const fxRates = readFxRates_(spreadsheet);
  syncLoansToPortfolio_(spreadsheet);
  const loansSheet = spreadsheet.getSheetByName('Loans');
  const loansApi = loansSheet ? readLoansForApi_(loansSheet) : [];

  const txSheet = spreadsheet.getSheetByName('Transactions');
  if (txSheet) ensureTransactionsSchema_(txSheet);

  const portfolioSheet = spreadsheet.getSheetByName('Portfolio');
  const L = portfolioSheet ? getPortfolioLayout_(portfolioSheet) : null;

  let portfolio = [];
  if (portfolioSheet && L) {
    const lastRow = portfolioSheet.getLastRow();
    if (lastRow >= 2) {
      const w = Math.max(L.readWidth, 6);
      const rawData = portfolioSheet.getRange(2, 1, lastRow, w).getValues();
      portfolio = rawData
        .filter(function (row) { return row[L.colCat - 1] !== ''; })
        .map(function (row, index) {
          var cat = row[L.colCat - 1];
          var tick = row[L.colTick - 1];
          var disp = L.colName ? row[L.colName - 1] : '';
          var qty = row[L.colQty - 1];
          var usd = row[L.colUsd - 1];
          var ntd = row[L.colNtd - 1];
          var costCell = L.colCost ? row[L.colCost - 1] : '';
          var isStock = cat === 'USD Stock' || cat === 'NTD Stock' || cat === 'NTD Preferred';

          if (isStock && L.colCost && (costCell === '' || costCell === null)) {
            var r = index + 2;
            var tickerPrefix = (cat === 'NTD Stock' || cat === 'NTD Preferred') ? '"TPE:' + tick + '"' : '"' + tick + '"';
            portfolioSheet.getRange(r, L.colCost).setFormula('=INDEX(GOOGLEFINANCE(' + tickerPrefix + ',"price",DATE(2025,1,1)),2,2)');
            costCell = 0;
          }

          return {
            category: cat === 'NTD Preferred' ? 'NTD Stock' : cat,
            ticker: tick,
            displayName: disp != null ? String(disp) : '',
            qty: qty,
            usdValue: usd,
            ntdValue: ntd,
            histPrice: costCell
          };
        });
    }
  }

  // Build OVERVIEW summary from portfolio data
  const categories = ['USD Cash', 'USD Preferred', 'USD Stock', 'NTD Cash', 'NTD Stock', 'Loan'];
  let overviewData = [];
  let totalUsd = 0;

  for (const cat of categories) {
    const items = portfolio.filter(p => p.category === cat);
    const sumUsd = items.reduce((s, i) => s + (Number(i.usdValue) || 0), 0);
    const sumNtd = items.reduce((s, i) => s + (Number(i.ntdValue) || 0), 0);
    if (cat !== 'Loan') totalUsd += sumUsd;
    overviewData.push({
      category: cat,
      currentUsd: sumUsd,
      currentNtd: sumNtd,
      percentage: 0, // will be computed below
    });
  }

  // Compute percentages (exclude Loan from total for percentage calc)
  if (totalUsd > 0) {
    for (let item of overviewData) {
      if (item.category !== 'Loan') {
        item.percentage = (item.currentUsd / totalUsd) * 100;
      }
    }
  }

  // Compute debt total
  const loanItem = overviewData.find(d => d.category === 'Loan');
  const totalDebtUsd = Math.abs(loanItem ? loanItem.currentUsd : 0);
  const totalNetUsd = totalUsd - totalDebtUsd;

  // ===== DAILY SNAPSHOT: Record to History sheet (once per day) =====
  let historySheet = spreadsheet.getSheetByName('History');
  if (!historySheet) {
    historySheet = spreadsheet.insertSheet('History');
    historySheet.appendRow(['Date', 'Gross Equity (USD)', 'Debt (USD)', 'Net Equity (USD)']);
    historySheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const histLastRow = historySheet.getLastRow();
  let alreadyRecorded = false;
  if (histLastRow >= 2) {
    const lastDate = historySheet.getRange(histLastRow, 1).getValue();
    if (lastDate && Utilities.formatDate(new Date(lastDate), Session.getScriptTimeZone(), 'yyyy-MM-dd') === today) {
      alreadyRecorded = true;
      // Update today's row with latest values
      historySheet.getRange(histLastRow, 2, 1, 3).setValues([[Math.round(totalUsd * 100) / 100, Math.round(totalDebtUsd * 100) / 100, Math.round(totalNetUsd * 100) / 100]]);
    }
  }
  if (!alreadyRecorded && totalUsd > 0) {
    historySheet.appendRow([new Date(), Math.round(totalUsd * 100) / 100, Math.round(totalDebtUsd * 100) / 100, Math.round(totalNetUsd * 100) / 100]);
  }

  // Read History sheet for frontend chart
  let historyData = [];
  const histRows = historySheet.getLastRow();
  if (histRows >= 2) {
    const rawHist = historySheet.getRange(2, 1, histRows - 1, 4).getValues();
    historyData = rawHist.filter(r => r[0]).map(row => ({
      date: row[0],
      gross: row[1],
      debt: row[2],
      net: row[3]
    }));
  }

  let txData = [];
  if (txSheet && txSheet.getLastRow() >= 2) {
    const rawTx = txSheet.getRange(2, 1, txSheet.getLastRow(), 7).getValues();
    txData = rawTx.map(row => ({
      txId: row[0],
      date: row[1],
      category: row[2],
      ticker: row[3],
      qty: row[4],
      type: row[5],
      unitPrice: row[6]
    }));
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: overviewData,
    portfolio: portfolio,
    history: historyData,
    transactions: txData,
    loans: loansApi,
    fx: fxRates
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let requestData;
  try {
    requestData = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid JSON payload" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID_);
  ensureFxSheet_(spreadsheet);

  // ===== INIT PORTFOLIO: One-time bulk load with GOOGLEFINANCE formulas =====
  if (requestData.action === 'init_portfolio') {
    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Portfolio');
    } else {
      sheet.clear();
    }
    
    sheet.getRange(1, 1, 1, 7).setValues([[
      'Category', 'Ticker', 'DisplayName', 'Qty', 'USD Value', 'NTD Value', 'AvgCost (per share)'
    ]]);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');

    const rows = requestData.data;
    if (rows && rows.length > 0) {
      const range = sheet.getRange(2, 1, rows.length + 1, 7);
      const cleanRows = rows.map(row => {
        let src = row;
        if (row.length <= 5) {
          src = [row[0], row[1], '', row[2], row[3], row[4], ''];
        }
        const out = new Array(7);
        for (let c = 0; c < 7; c++) {
          const cell = c < src.length ? src[c] : '';
          out[c] = (typeof cell === 'string' && cell.startsWith('=')) ? '' : cell;
        }
        return out;
      });
      range.setValues(cleanRows);
      for (let r = 0; r < rows.length; r++) {
        let src = rows[r];
        if (rows[r].length <= 5) {
          src = [rows[r][0], rows[r][1], '', rows[r][2], rows[r][3], rows[r][4], ''];
        }
        for (let c = 0; c < Math.min(src.length, 7); c++) {
          const cell = src[c];
          if (typeof cell === 'string' && cell.startsWith('=')) {
            sheet.getRange(2 + r, 1 + c).setFormula(cell);
          }
        }
      }
    }
    for (let i = 1; i <= 7; i++) sheet.autoResizeColumn(i);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Portfolio initialized with ${rows ? rows.length : 0} rows!`
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===== INIT HISTORY: Bulk load historical gross/debt/net data =====
  if (requestData.action === 'init_history') {
    let histSheet = spreadsheet.getSheetByName('History');
    if (!histSheet) {
      histSheet = spreadsheet.insertSheet('History');
    } else {
      histSheet.clear();
    }
    
    histSheet.getRange(1, 1, 1, 4).setValues([['Date', 'Gross Equity (USD)', 'Debt (USD)', 'Net Equity (USD)']]);
    histSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    
    const rows = requestData.data;
    if (rows && rows.length > 0) {
      // Convert date strings to Date objects
      const formattedRows = rows.map(r => [new Date(r[0]), r[1], r[2], r[3]]);
      histSheet.getRange(2, 1, formattedRows.length, 4).setValues(formattedRows);
      // Format date column
      histSheet.getRange(2, 1, formattedRows.length, 1).setNumberFormat('yyyy-mm-dd');
    }
    
    for (let i = 1; i <= 4; i++) histSheet.autoResizeColumn(i);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `History initialized with ${rows ? rows.length : 0} rows!`
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ===== ADD LOAN: Append Loans sheet + sync Portfolio balance from amortization =====
  if (requestData.action === 'add_loan') {
    const loanName = requestData.loanName || requestData.portfolioTicker || 'Loan';
    const portfolioTicker = requestData.portfolioTicker || loanName;
    const principalNtd = Number(requestData.principalNtd);
    const annualRatePct = Number(requestData.annualRatePct);
    const termMonths = Math.floor(Number(requestData.termMonths));
    const startDate = requestData.startDate ? new Date(requestData.startDate) : new Date();
    const monthlyPaymentNtd = requestData.monthlyPaymentNtd !== undefined && requestData.monthlyPaymentNtd !== ''
      ? Number(requestData.monthlyPaymentNtd) : '';
    const notes = requestData.notes || '';

    if (!portfolioTicker || !principalNtd || principalNtd <= 0 || !termMonths || termMonths <= 0) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Invalid loan: need portfolioTicker, positive principalNtd, and termMonths'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const sh = ensureLoansSheet_(spreadsheet);
    sh.appendRow([loanName, portfolioTicker, principalNtd, annualRatePct, termMonths, startDate, monthlyPaymentNtd, notes]);
    syncLoansToPortfolio_(spreadsheet);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Loan added and portfolio balance updated'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===== UPDATE CASH: Update a specific cash/preferred/debt account amount =====
  if (requestData.action === 'update_cash') {
    const { ticker, amount, currency } = requestData;
    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Portfolio sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    const L = getPortfolioLayout_(sheet);
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow, L.readWidth).getValues();

    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][L.colTick - 1] === ticker) {
        if (data[i][L.colCat - 1] === 'Loan') {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Loan balances are computed from the Loans sheet. Use Add Loan or edit the Loans tab.'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        found = true;
        const rowIdx = i + 2;
        const uLet = columnToLetter_(L.colUsd);
        const nLet = columnToLetter_(L.colNtd);
        if (currency === 'USD' || String(data[i][L.colCat - 1]).startsWith('USD')) {
          sheet.getRange(rowIdx, L.colUsd).setValue(Number(amount));
          sheet.getRange(rowIdx, L.colNtd).setFormula('=' + uLet + rowIdx + '*' + FX_TWD_PER_USD_REF_);
        } else {
          sheet.getRange(rowIdx, L.colNtd).setValue(Number(amount));
          sheet.getRange(rowIdx, L.colUsd).setFormula('=' + nLet + rowIdx + '/' + FX_TWD_PER_USD_REF_);
        }
        break;
      }
    }
    
    if (!found) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: `Account "${ticker}" not found in Portfolio sheet`
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Updated ${ticker} to ${amount}`
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ===== UPDATE LEDGER: Add stock / adjust quantity; log transaction with ID & unit price =====
  if (requestData.action === 'update_ledger') {
    const { category, ticker, qty, date, type, price, displayName } = requestData;
    const mathQty = (type === 'Sell') ? -Math.abs(Number(qty)) : Number(qty);
    const unitPrice = Number(price) || 0;
    const nameTrim = displayName != null ? String(displayName).trim() : '';

    let txSheet = spreadsheet.getSheetByName('Transactions');
    if (!txSheet) txSheet = spreadsheet.insertSheet('Transactions');
    ensureTransactionsSchema_(txSheet);
    const insertDate = date ? new Date(date) : new Date();
    const tid = nextTxId_(txSheet);
    txSheet.appendRow([tid, insertDate, category, ticker, mathQty, type || 'Buy', unitPrice]);

    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Portfolio sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    const L = getPortfolioLayout_(sheet);
    const lastRow = sheet.getLastRow();
    let foundRow = -1;
    let newQty = mathQty;
    let oldQty = 0;

    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow, L.readWidth).getValues();
      for (let i = 0; i < data.length; i++) {
        if (data[i][L.colTick - 1] === ticker && data[i][L.colCat - 1] === category) {
          foundRow = i + 2;
          oldQty = Number(data[i][L.colQty - 1]) || 0;
          newQty = oldQty + mathQty;
          break;
        }
      }
    }

    const qLet = columnToLetter_(L.colQty);
    const uLet = columnToLetter_(L.colUsd);
    const nLet = columnToLetter_(L.colNtd);

    if (foundRow > -1) {
      if (category === 'USD Stock') {
        sheet.getRange(foundRow, L.colQty).setValue(newQty);
        sheet.getRange(foundRow, L.colUsd).setFormula('=' + qLet + foundRow + '*GOOGLEFINANCE("' + ticker + '","price")');
        sheet.getRange(foundRow, L.colNtd).setFormula('=' + uLet + foundRow + '*' + FX_TWD_PER_USD_REF_);
        updateAvgCostAfterTrade_(sheet, L, foundRow, category, type || 'Buy', mathQty, unitPrice);
        if (nameTrim && L.colName) sheet.getRange(foundRow, L.colName).setValue(nameTrim);
      } else if (category === 'NTD Stock' || category === 'NTD Preferred') {
        sheet.getRange(foundRow, L.colQty).setValue(newQty);
        sheet.getRange(foundRow, L.colNtd).setFormula('=' + qLet + foundRow + '*GOOGLEFINANCE("TPE:' + ticker + '","price")');
        sheet.getRange(foundRow, L.colUsd).setFormula('=' + nLet + foundRow + '/' + FX_TWD_PER_USD_REF_);
        updateAvgCostAfterTrade_(sheet, L, foundRow, category, type || 'Buy', mathQty, unitPrice);
        if (nameTrim && L.colName) sheet.getRange(foundRow, L.colName).setValue(nameTrim);
      } else {
        if (category.startsWith('USD') || category === 'Loan') {
          var curUsd2 = Number(sheet.getRange(foundRow, L.colUsd).getValue()) || 0;
          sheet.getRange(foundRow, L.colUsd).setValue(curUsd2 + mathQty);
          sheet.getRange(foundRow, L.colNtd).setFormula('=' + uLet + foundRow + '*' + FX_TWD_PER_USD_REF_);
        } else {
          var curNtd2 = Number(sheet.getRange(foundRow, L.colNtd).getValue()) || 0;
          sheet.getRange(foundRow, L.colNtd).setValue(curNtd2 + mathQty);
          sheet.getRange(foundRow, L.colUsd).setFormula('=' + nLet + foundRow + '/' + FX_TWD_PER_USD_REF_);
        }
      }
    } else {
      const newRow = lastRow < 2 ? 2 : lastRow + 1;
      sheet.getRange(newRow, L.colCat).setValue(category);
      sheet.getRange(newRow, L.colTick).setValue(ticker);
      if (L.colName) {
        var isStockRow = category === 'USD Stock' || category === 'NTD Stock' || category === 'NTD Preferred';
        sheet.getRange(newRow, L.colName).setValue(isStockRow && nameTrim ? nameTrim : '');
      }

      if (category === 'USD Stock') {
        sheet.getRange(newRow, L.colQty).setValue(newQty);
        sheet.getRange(newRow, L.colUsd).setFormula('=' + qLet + newRow + '*GOOGLEFINANCE("' + ticker + '","price")');
        sheet.getRange(newRow, L.colNtd).setFormula('=' + uLet + newRow + '*' + FX_TWD_PER_USD_REF_);
        if (L.colCost) {
          if (unitPrice > 0) sheet.getRange(newRow, L.colCost).setValue(unitPrice);
          else sheet.getRange(newRow, L.colCost).setFormula('=INDEX(GOOGLEFINANCE("' + ticker + '","price",DATE(2025,1,1)),2,2)');
        }
      } else if (category === 'NTD Stock' || category === 'NTD Preferred') {
        sheet.getRange(newRow, L.colQty).setValue(newQty);
        sheet.getRange(newRow, L.colNtd).setFormula('=' + qLet + newRow + '*GOOGLEFINANCE("TPE:' + ticker + '","price")');
        sheet.getRange(newRow, L.colUsd).setFormula('=' + nLet + newRow + '/' + FX_TWD_PER_USD_REF_);
        if (L.colCost) {
          if (unitPrice > 0) sheet.getRange(newRow, L.colCost).setValue(unitPrice);
          else sheet.getRange(newRow, L.colCost).setFormula('=INDEX(GOOGLEFINANCE("TPE:' + ticker + '","price",DATE(2025,1,1)),2,2)');
        }
      } else {
        sheet.getRange(newRow, L.colQty).setValue('');
        if (category.startsWith('USD') || category === 'Loan') {
          sheet.getRange(newRow, L.colUsd).setValue(mathQty);
          sheet.getRange(newRow, L.colNtd).setFormula('=' + uLet + newRow + '*' + FX_TWD_PER_USD_REF_);
        } else {
          sheet.getRange(newRow, L.colNtd).setValue(mathQty);
          sheet.getRange(newRow, L.colUsd).setFormula('=' + nLet + newRow + '/' + FX_TWD_PER_USD_REF_);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Ledger updated: ${qty} for ${ticker} (${category})`
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Catch-all response for unmatched actions
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ignored',
    message: 'Action not matched or unsupported in this version.'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"
  };
  return ContentService.createTextOutput("").setHeaders(headers);
}

/**
 * If you never see an FX tab: open this script in Apps Script, choose
 * "createOrRepairFxSheet" in the function dropdown, click Run (▶), authorize.
 * That creates sheet "FX" with live rates in B1 (TWD/USD) and B2 (JPY/USD).
 */
function createOrRepairFxSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_);
  ensureFxSheet_(ss);
  SpreadsheetApp.flush();
  Logger.log('Done. Open the spreadsheet and check the "' + FX_SHEET_NAME_ + '" tab.');
}

/**
 * Only runs when this project is bound to a spreadsheet (File opened from
 * Extensions → Apps Script on that sheet). Adds a menu to create FX without the editor.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Portfolio tools')
    .addItem('Create / refresh FX sheet', 'menuFxSheet')
    .addToUi();
}

function menuFxSheet() {
  ensureFxSheet_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('FX tab is ready. Rates: B1 = TWD per USD, B2 = JPY per USD.');
}
