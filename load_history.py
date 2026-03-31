import openpyxl
import datetime
import urllib.request
import json
import ssl

EXCEL_FILE = '/Users/yarinlin/Desktop/Financing/PLAN&FORECAST.xlsm'
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec'

def main():
    print("Reading Excel file for historical data...")
    wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    ws = wb['$$$$$']
    
    rows = list(ws.iter_rows(values_only=True))
    
    history_payload = []
    previous_equity = 0
    first_month = True
    
    for row in rows:
        date_cell = row[0]
        
        # Look for valid datetime rows until March 2026
        if isinstance(date_cell, datetime.datetime):
            end_equity = row[22] # EndEQUITY_USD is index 22
            
            if end_equity is None:
                continue
                
            if first_month:
                # Initialize starting point
                delta = end_equity
                first_month = False
            else:
                delta = end_equity - previous_equity
                
            previous_equity = end_equity
            
            # Format explicitly for Google Sheets Transactions header: [Date, Category, Amount]
            date_str = date_cell.strftime('%Y-%m-%dT%H:%M:%S.000Z')
            history_payload.append([date_str, 'USD Historical Delta', delta])
            
            if date_cell.year == 2026 and date_cell.month == 3:
                print("Reached March 2026! Stopping extraction.")
                break

    print(f"Extracted {len(history_payload)} historical records. Beaming to Google Sheets...")
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    payload = {
        "action": "bulk_tx",
        "data": history_payload
    }
    
    req = urllib.request.Request(
        APPS_SCRIPT_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'text/plain'}
    )
    
    try:
        response = urllib.request.urlopen(req, context=ctx)
        result = response.read().decode('utf-8')
        print("Success! Google Sheets replied:", result)
    except Exception as e:
        print("Failed to beam data:", e)

if __name__ == '__main__':
    main()
