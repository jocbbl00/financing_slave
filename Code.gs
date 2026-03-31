// This is the updated Google Apps Script backend for the Wealth Allocator

function doGet(e) {
  const spreadsheetId = '1CEpGfVGioL5dphTxNxAJD-UyzrMo7HuxtZZBtPOeI_U';
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('OVERVIEW');
  if(!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet OVERVIEW not found" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Assuming row 3 to 8 are the assets: USD Cash, USD Preferred, USD Stock, NTD Cash, NTD Preferred, NTD Stock
  // Column B is Category, Column C is USD amount or NTD amount etc.
  const data = sheet.getRange(3, 2, 6, 4).getValues(); 
  // e.g., get categories, current USD, current NTD, current %
  
  const formattedData = data.map(row => {
    return {
      category: row[0],
      currentUsd: row[1],
      currentNtd: row[2],
      percentage: row[3] * 100, // convert decimal to percentage
    };
  });
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    data: formattedData
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
  
  // Custom script injection to load from initial Excel payload
  if (requestData.action === 'init') {
    let sheet = spreadsheet.getSheetByName('OVERVIEW');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('OVERVIEW');
    }
    
    const data = requestData.data; 
    // Format is a nested array. Needs to write specifically to B3
    // because doGet looks at getRange(3, 2, 6, 4).
    sheet.getRange(3, 2, data.length, data[0].length).setValues(data);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Successfully populated the Google Sheet with Excel payload!'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const { category, amount } = requestData;
  let txSheet = spreadsheet.getSheetByName('Transactions');
  if(!txSheet) {
    txSheet = spreadsheet.insertSheet('Transactions');
    txSheet.appendRow(['Date', 'Category', 'Amount']);
  }
  txSheet.appendRow([new Date(), category, amount]);
  
  // Dynamically update the OVERVIEW sheet actuals
  let overview = spreadsheet.getSheetByName('OVERVIEW');
  if (overview) {
    let rawData;
    // Safe lookup size to prevent overflowing if new sheet is small
    const numRows = Math.min(20, overview.getLastRow() - 2);
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
