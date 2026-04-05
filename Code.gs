// Wealth Allocator - Google Apps Script Backend

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
  var portfolioSheet = spreadsheet.getSheetByName('Portfolio');
  if (!portfolioSheet) return;
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
          portfolioSheet.getRange(rowIdx, 5).setValue(-Math.abs(bal));
          portfolioSheet.getRange(rowIdx, 4).setFormula('=E' + rowIdx + '/32');
          portfolioSheet.getRange(rowIdx, 3).setValue('');
          found = true;
          break;
        }
      }
    }
    if (!found) {
      var newRow = pLast < 2 ? 2 : pLast + 1;
      portfolioSheet.getRange(newRow, 1).setValue('Loan');
      portfolioSheet.getRange(newRow, 2).setValue(ticker);
      portfolioSheet.getRange(newRow, 3).setValue('');
      portfolioSheet.getRange(newRow, 5).setValue(-Math.abs(bal));
      portfolioSheet.getRange(newRow, 4).setFormula('=E' + newRow + '/32');
    }
  }
}

function doGet(e) {
  const spreadsheetId = '1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  syncLoansToPortfolio_(spreadsheet);
  const loansSheet = spreadsheet.getSheetByName('Loans');
  const loansApi = loansSheet ? readLoansForApi_(loansSheet) : [];

  const txSheet = spreadsheet.getSheetByName('Transactions');
  const portfolioSheet = spreadsheet.getSheetByName('Portfolio');
  
  // Read Portfolio sheet (individual holdings)
  let portfolio = [];
  if (portfolioSheet) {
    const lastRow = portfolioSheet.getLastRow();
    if (lastRow >= 2) {
      const rawData = portfolioSheet.getRange(2, 1, lastRow - 1, 6).getValues();
      portfolio = rawData
        .filter(row => row[0] !== '')
        .map((row, index) => {
          let histPriceStr = row[5];
          const isStock = row[0] === 'USD Stock' || row[0] === 'NTD Stock' || row[0] === 'NTD Preferred';
          
          if (!histPriceStr && isStock) {
             const tickerPrefix = (row[0] === 'NTD Stock' || row[0] === 'NTD Preferred') ? `"TPE:${row[1]}"` : `"${row[1]}"`;
             portfolioSheet.getRange(index + 2, 6).setFormula(`=INDEX(GOOGLEFINANCE(${tickerPrefix},"price",DATE(2025,1,1)),2,2)`);
             histPriceStr = 0;
          }

          return {
            category: row[0] === 'NTD Preferred' ? 'NTD Stock' : row[0],   // e.g. "USD Stock", "NTD Cash", "Loan", handling legacy NTD Preferred
            ticker: row[1],     // e.g. "AAPL", "Firstrade", "NTD Loan"
            qty: row[2],        // shares or blank for cash
            usdValue: row[3],   // computed by GOOGLEFINANCE formula or static
            ntdValue: row[4],   // computed or static
            histPrice: histPriceStr
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

  // Fetch Transactions for legacy chart
  let txData = [];
  if (txSheet) {
    const txLastRow = txSheet.getLastRow();
    if (txLastRow >= 2) {
      const rawTx = txSheet.getRange(2, 1, txLastRow - 1, 3).getValues();
      txData = rawTx.map(row => ({
        date: row[0],
        category: row[1],
        amount: row[2]
      }));
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: overviewData,
    portfolio: portfolio,
    history: historyData,
    transactions: txData,
    loans: loansApi
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let requestData;
  try {
    requestData = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Invalid JSON payload" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const spreadsheetId = '1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  
  // ===== INIT PORTFOLIO: One-time bulk load with GOOGLEFINANCE formulas =====
  if (requestData.action === 'init_portfolio') {
    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Portfolio');
    } else {
      sheet.clear();
    }
    
    // Header row
    sheet.getRange(1, 1, 1, 5).setValues([['Category', 'Ticker', 'Qty', 'USD Value', 'NTD Value']]);
    // Bold header
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    
    const rows = requestData.data;
    if (rows && rows.length > 0) {
      // We need to detect formula strings (starting with '=') and use setFormulas for those cells
      const range = sheet.getRange(2, 1, rows.length, 5);
      
      // First set all values
      const cleanRows = rows.map(row => row.map(cell => {
        if (typeof cell === 'string' && cell.startsWith('=')) return ''; // placeholder
        return cell;
      }));
      range.setValues(cleanRows);
      
      // Then set individual formula cells
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < 5; c++) {
          const cell = rows[r][c];
          if (typeof cell === 'string' && cell.startsWith('=')) {
            sheet.getRange(2 + r, 1 + c).setFormula(cell);
          }
        }
      }
    }
    
    // Auto-resize columns
    for (let i = 1; i <= 5; i++) sheet.autoResizeColumn(i);
    
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
    const { ticker, amount, currency } = requestData; // ticker = account name, amount = new balance
    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Portfolio sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    
    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][1] === ticker) { // match by ticker/account name
        if (data[i][0] === 'Loan') {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Loan balances are computed from the Loans sheet. Use Add Loan or edit the Loans tab.'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        found = true;
        const rowIdx = i + 2;
        if (currency === 'USD' || data[i][0].startsWith('USD')) {
          sheet.getRange(rowIdx, 4).setValue(Number(amount));       // USD Value
          sheet.getRange(rowIdx, 5).setFormula(`=D${rowIdx}*32`);   // NTD Value
        } else {
          sheet.getRange(rowIdx, 5).setValue(Number(amount));       // NTD Value
          sheet.getRange(rowIdx, 4).setFormula(`=E${rowIdx}/32`);   // USD Value
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
  
  // ===== UPDATE LEDGER: Core Transaction & Portfolio holding append/update =====
  if (requestData.action === 'update_ledger') {
    const { category, ticker, qty, date, type, price } = requestData;
    
    // Determine mathematical quantity
    const mathQty = (type === 'Sell') ? -Math.abs(Number(qty)) : Number(qty);
    
    // 1. Log to Transactions
    let txSheet = spreadsheet.getSheetByName('Transactions');
    if(!txSheet) {
      txSheet = spreadsheet.insertSheet('Transactions');
      txSheet.appendRow(['Date', 'Category', 'Ticker', 'Amount', 'Type', 'Price']);
    } else {
      // Ensure header has Type and Price
      const header = txSheet.getRange(1, 1, 1, txSheet.getLastColumn()).getValues()[0];
      if (header.length < 5 || header[4] !== 'Type') {
        txSheet.getRange(1, 5).setValue('Type');
        txSheet.getRange(1, 6).setValue('Price');
      }
    }
    const insertDate = date ? new Date(date) : new Date();
    txSheet.appendRow([insertDate, category, ticker, mathQty, type || 'Buy', price || 0]);

    // 2. Update Portfolio
    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Portfolio sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    let foundRow = -1;
    let newQty = mathQty;
    let oldQty = 0;

    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      for (let i = 0; i < data.length; i++) {
        if (data[i][1] === ticker && data[i][0] === category) {
          foundRow = i + 2;
          oldQty = Number(data[i][2]);
          newQty = oldQty + mathQty;
          break;
        }
      }
    }

    if (foundRow > -1) {
      // Update existing row
      sheet.getRange(foundRow, 3).setValue(newQty);
      if (category === 'USD Stock') {
        sheet.getRange(foundRow, 4).setFormula(`=${newQty}*GOOGLEFINANCE("${ticker}","price")`);
        sheet.getRange(foundRow, 5).setFormula(`=D${foundRow}*32`);
        if (type !== 'Sell' && Number(price) > 0 && newQty > 0) {
          const oldCb = Number(sheet.getRange(foundRow, 6).getValue()) || 0;
          const newCb = ((oldQty * oldCb) + (mathQty * Number(price))) / newQty;
          sheet.getRange(foundRow, 6).setValue(newCb);
        }
      } else if (category === 'NTD Stock') {
        sheet.getRange(foundRow, 5).setFormula(`=${newQty}*GOOGLEFINANCE("TPE:${ticker}","price")`);
        sheet.getRange(foundRow, 4).setFormula(`=E${foundRow}/32`);
        if (type !== 'Sell' && Number(price) > 0 && newQty > 0) {
          const oldCb = Number(sheet.getRange(foundRow, 6).getValue()) || 0;
          const newCb = ((oldQty * oldCb) + (mathQty * Number(price))) / newQty;
          sheet.getRange(foundRow, 6).setValue(newCb);
        }
      } else {
        // Cash or Loan
        if (category.startsWith('USD') || category === 'Loan') {
          sheet.getRange(foundRow, 4).setValue(newQty);
          sheet.getRange(foundRow, 5).setFormula(`=D${foundRow}*32`);
        } else {
          sheet.getRange(foundRow, 5).setValue(newQty);
          sheet.getRange(foundRow, 4).setFormula(`=E${foundRow}/32`);
        }
      }
    } else {
      // Create new row
      const newRow = lastRow + 1;
      sheet.getRange(newRow, 1).setValue(category);
      sheet.getRange(newRow, 2).setValue(ticker);
      sheet.getRange(newRow, 3).setValue(newQty);
      
      if (category === 'USD Stock') {
        sheet.getRange(newRow, 4).setFormula(`=${newQty}*GOOGLEFINANCE("${ticker}","price")`);
        sheet.getRange(newRow, 5).setFormula(`=D${newRow}*32`);
        if (Number(price) > 0) {
          sheet.getRange(newRow, 6).setValue(Number(price));
        } else {
          sheet.getRange(newRow, 6).setFormula(`=INDEX(GOOGLEFINANCE("${ticker}","price",DATE(2025,1,1)),2,2)`);
        }
      } else if (category === 'NTD Stock') {
        sheet.getRange(newRow, 5).setFormula(`=${newQty}*GOOGLEFINANCE("TPE:${ticker}","price")`);
        sheet.getRange(newRow, 4).setFormula(`=E${newRow}/32`);
        if (Number(price) > 0) {
          sheet.getRange(newRow, 6).setValue(Number(price));
        } else {
          sheet.getRange(newRow, 6).setFormula(`=INDEX(GOOGLEFINANCE("TPE:${ticker}","price",DATE(2025,1,1)),2,2)`);
        }
      } else {
        // Cash or Loan
        if (category.startsWith('USD') || category === 'Loan') {
          sheet.getRange(newRow, 4).setValue(newQty);
          sheet.getRange(newRow, 5).setFormula(`=D${newRow}*32`);
        } else {
          sheet.getRange(newRow, 5).setValue(newQty);
          sheet.getRange(newRow, 4).setFormula(`=E${newRow}/32`);
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
