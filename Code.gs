// Wealth Allocator - Google Apps Script Backend

function doGet(e) {
  const spreadsheetId = '1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const txSheet = spreadsheet.getSheetByName('Transactions');
  const portfolioSheet = spreadsheet.getSheetByName('Portfolio');
  
  // Read Portfolio sheet (individual holdings)
  let portfolio = [];
  if (portfolioSheet) {
    const lastRow = portfolioSheet.getLastRow();
    if (lastRow >= 2) {
      const rawData = portfolioSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      portfolio = rawData
        .filter(row => row[0] !== '')
        .map(row => ({
          category: row[0],   // e.g. "USD Stock", "NTD Cash", "Loan"
          ticker: row[1],     // e.g. "AAPL", "Firstrade", "NTD Loan"
          qty: row[2],        // shares or blank for cash
          usdValue: row[3],   // computed by GOOGLEFINANCE formula or static
          ntdValue: row[4],   // computed or static
        }));
    }
  }

  // Build OVERVIEW summary from portfolio data
  const categories = ['USD Cash', 'USD Preferred', 'USD Stock', 'NTD Cash', 'NTD Preferred', 'NTD Stock', 'Loan'];
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

  // Fetch Transactions for historical chart
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
    transactions: txData
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
  
  // ===== ADD STOCK: Add a new stock holding =====
  if (requestData.action === 'add_stock') {
    const { category, ticker, qty } = requestData;
    let sheet = spreadsheet.getSheetByName('Portfolio');
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Portfolio sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1).setValue(category);
    sheet.getRange(newRow, 2).setValue(ticker);
    sheet.getRange(newRow, 3).setValue(Number(qty));
    
    if (category === 'USD Stock') {
      sheet.getRange(newRow, 4).setFormula(`=${qty}*GOOGLEFINANCE("${ticker}","price")`);
      sheet.getRange(newRow, 5).setFormula(`=D${newRow}*32`);
    } else if (category === 'NTD Stock') {
      sheet.getRange(newRow, 5).setFormula(`=${qty}*GOOGLEFINANCE("TPE:${ticker}","price")`);
      sheet.getRange(newRow, 4).setFormula(`=E${newRow}/32`);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Added ${qty} shares of ${ticker} as ${category}`
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // ===== LEGACY: Bulk load historical transactions =====
  if (requestData.action === 'bulk_tx') {
    let txSheet = spreadsheet.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = spreadsheet.insertSheet('Transactions');
      txSheet.appendRow(['Date', 'Category', 'Amount']);
    }
    
    const rows = requestData.data;
    if(rows && rows.length > 0) {
      txSheet.getRange(txSheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Successfully loaded ${rows.length} historical transactions!`
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ===== LEGACY: Single transaction update =====
  const { category, amount, date } = requestData;
  let txSheet = spreadsheet.getSheetByName('Transactions');
  if(!txSheet) {
    txSheet = spreadsheet.insertSheet('Transactions');
    txSheet.appendRow(['Date', 'Category', 'Amount']);
  }
  const insertDate = date ? new Date(date) : new Date();
  txSheet.appendRow([insertDate, category, amount]);

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: `Recorded ${amount} for ${category}`
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
