import openpyxl
import requests
import json
import urllib.request

EXCEL_FILE = '/Users/yarinlin/Desktop/Financing/PLAN&FORECAST.xlsm'
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec'

def main():
    print("Reading Excel file...")
    wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    ws = wb['OVERVIEW']
    
    # Extract rows 3 to 8 (index 2 to 7) based on what the user's excel was earlier
    rows = list(ws.iter_rows(values_only=True))
    
    data_to_send = []
    
    for row in rows[2:8]:
        category = row[1]
        usd = row[2]
        ntd = row[3]
        percentage = row[4]
        
        # Format explicitly for Google Sheets getRange(3, 2, 6, 4)
        # That means array bounds should be: Category, USD, NTD, Percentage
        data_to_send.append([category, usd, ntd, percentage])
        
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    payload = {
        "action": "init",
        "data": data_to_send
    }
    
    req = urllib.request.Request(
        APPS_SCRIPT_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'text/plain'} # Apps script requires plain sometimes to pass CORS
    )
    
    try:
        response = urllib.request.urlopen(req, context=ctx)
        result = response.read().decode('utf-8')
        print("Success! Google Sheets replied:", result)
    except Exception as e:
        print("Failed to beam data:", e)

if __name__ == '__main__':
    main()
