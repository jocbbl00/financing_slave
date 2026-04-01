// This is the updated Google Apps Script backend for the Wealth Allocator

function doGet(e) {
  const spreadsheetId = '1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const overviewSheet = spreadsheet.getSheetByName('OVERVIEW');
  const txSheet = spreadsheet.getSheetByName('Transactions');
  
  if(!overviewSheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet OVERVIEW not found" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Dynamically get all rows in OVERVIEW starting from Row 3
  const lastRow = overviewSheet.getLastRow();
  let overviewData = [];
  if (lastRow >= 3) {
    const rawData = overviewSheet.getRange(3, 2, lastRow - 2, 4).getValues();
    overviewData = rawData.map(row => ({
      category: row[0],
      currentUsd: row[1],
      currentNtd: row[2],
      percentage: row[3] * 100, // convert decimal to percentage
    })).filter(r => r.category !== ""); // filter out empty rows
  }

  // Fetch Transactions for historical chart
  let txData = [];
  if (txSheet) {
    const txLastRow = txSheet.getLastRow();
    if (txLastRow >= 2) {
      const rawTx = txSheet.getRange(2, 1, txLastRow - 1, 3).getValues(); // Date, Category, Amount
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
  
  // Custom script injection to load historical tx payload
  if (requestData.action === 'bulk_tx') {
    let txSheet = spreadsheet.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = spreadsheet.insertSheet('Transactions');
      txSheet.appendRow(['Date', 'Category', 'Amount']);
    }
    
    const rows = requestData.data; // Expected: [[Date, Category, Amount], ...]
    if(rows && rows.length > 0) {
      txSheet.getRange(txSheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Successfully loaded ${rows.length} historical transactions!`
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Custom script injection to load initial live stocks with GOOGLEFINANCE
  if (requestData.action === 'init_live_portfolio') {
    let overview = spreadsheet.getSheetByName('OVERVIEW');
    if (!overview) {
      overview = spreadsheet.insertSheet('OVERVIEW');
      overview.appendRow(["", "Category", "USD Amount", "NTD Amount", "Target %"]);
    } else {
      const lastRow = overview.getLastRow();
      if (lastRow >= 3) {
         overview.getRange(3, 1, lastRow - 2, 5).clearContent();
      }
    }
    
    const rows = requestData.data; 
    if(rows && rows.length > 0) {
      // Use setFormulas instead of setValues if we want to ensure formulas are parsed, 
      // but setValues automatically parses strings starting with '=' in Google Sheets.
      overview.getRange(3, 1, rows.length, 5).setValues(rows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: `Successfully initialized live portfolio!`
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const { category, amount, date } = requestData;
  let txSheet = spreadsheet.getSheetByName('Transactions');
  if(!txSheet) {
    txSheet = spreadsheet.insertSheet('Transactions');
    txSheet.appendRow(['Date', 'Category', 'Amount']);
  }
  const insertDate = date ? new Date(date) : new Date();
  txSheet.appendRow([insertDate, category, amount]);
  
  // Dynamically update the OVERVIEW sheet actuals
  let overview = spreadsheet.getSheetByName('OVERVIEW');
  if (overview) {
    let rawData;
    const numRows = Math.max(0, overview.getLastRow() - 2);
    if(numRows > 0) {
      rawData = overview.getRange(3, 2, numRows, 4).getValues();
      let found = false;
      for (let i = 0; i < rawData.length; i++) {
        if (rawData[i][0] === category) {
          found = true;
          const isUsd = category.startsWith('USD');
          if (isUsd) {
             let oldUsd = Number(rawData[i][1]) || 0;
             overview.getRange(3 + i, 3).setValue(oldUsd + Number(amount));
             overview.getRange(3 + i, 4).setValue((oldUsd + Number(amount)) * 32); 
          } else {
             let oldNtd = Number(rawData[i][2]) || 0;
             overview.getRange(3 + i, 4).setValue(oldNtd + Number(amount));
             overview.getRange(3 + i, 3).setValue((oldNtd + Number(amount)) / 32);
          }
          break;
        }
      }
      
      if (!found) {
        overview.appendRow(["", category, category.startsWith('USD') ? amount : amount/32, category.startsWith('USD') ? amount*32 : amount, 0.0]);
      }
    } else {
      overview.appendRow(["", category, category.startsWith('USD') ? amount : amount/32, category.startsWith('USD') ? amount*32 : amount, 0.0]);
    }
  }

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
