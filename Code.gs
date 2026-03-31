// This is the Google Apps Script backend for the Wealth Allocator
// Setup Instructions:
// 1. Unzip or open your target Google Sheet
// 2. Go to Extensions > Apps Script
// 3. Paste this code into Code.gs
// 4. Hit "Deploy" > "New Deployment"
// 5. Select type "Web app"
// 6. Execute as "Me", Who has access "Anyone"
// 7. Copy the Web App URL and place it in your frontend code (App.jsx)

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OVERVIEW');
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
  
  const { category, amount } = requestData;
  // Here you can use the category to find the row in Stock_Input or OVERVIEW and modify it
  // For demonstration, let's append it to a "Transactions" sheet or modify inline
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Transactions');
  if(sheet) {
    sheet.appendRow([new Date(), category, amount]);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: `Recorded ${amount} for ${category}`
  })).setMimeType(ContentService.MimeType.JSON);
}

// Ensure CORS is allowed
function doOptions(e) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"
  };
  return ContentService.createTextOutput("").setHeaders(headers);
}
