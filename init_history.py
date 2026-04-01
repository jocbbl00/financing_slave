"""
Extract historical gross equity, debt, and net equity from Excel $$$$$ tab
and push to Google Sheets as seed data for the History sheet.
"""
import openpyxl
import json
import ssl
import urllib.request
from datetime import datetime

EXCEL_FILE = '/Users/yarinlin/Desktop/Financing/PLAN&FORECAST.xlsm'
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec'

print("Reading Excel $$$$$ sheet...")
wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
ws = wb['$$$$$']

rows = []
for row in ws.iter_rows(min_row=3, values_only=True):
    date_val = row[0]       # Column A: Date
    total_usd = row[23]     # Column X: Total_in_USD (gross assets)
    debt_usd = row[16]      # Column Q: Remaining_Loan_USD
    
    if date_val is None or total_usd is None:
        continue
    
    # Only include historical data (up to and including current month)
    if isinstance(date_val, datetime):
        if date_val > datetime(2026, 4, 1):
            continue  # Skip future forecast rows
        date_str = date_val.strftime('%Y-%m-%d')
    else:
        continue
    
    gross_usd = float(total_usd) if total_usd else 0
    remaining_debt_usd = float(debt_usd) if debt_usd else 0
    net_usd = gross_usd - remaining_debt_usd
    
    rows.append([date_str, round(gross_usd, 2), round(remaining_debt_usd, 2), round(net_usd, 2)])
    print(f"  {date_str}: Gross=${gross_usd:,.0f}  Debt=${remaining_debt_usd:,.0f}  Net=${net_usd:,.0f}")

print(f"\nTotal historical rows: {len(rows)}")

# Send to Google Sheets
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

payload = {"action": "init_history", "data": rows}
req = urllib.request.Request(
    APPS_SCRIPT_URL,
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

print("Beaming historical data to Google Sheets...")
try:
    response = urllib.request.urlopen(req, context=ctx)
    result = response.read().decode('utf-8')
    print("Success!", result)
except Exception as e:
    print("Failed:", e)
