"""
One-time migration: Extract portfolio from Excel and push to Google Sheets
with live GOOGLEFINANCE() formulas for all stock holdings.
"""
import json
import ssl
import urllib.request

APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec'

rows = []

# ─── US Stocks (GOOGLEFINANCE with NASDAQ/NYSE tickers) ───
us_stocks = {
    "AAPL": 14, "ABAT": 54, "AMD": 49, "AMZN": 17,
    "EBAY": 10, "EVGO": 50, "GLW": 25, "GOOGL": 55,
    "LAC": 20, "LAAC": 20, "LEU": 10, "META": 15,
    "MSFT": 22, "NEE": 40, "NVDA": 61, "PLTR": 40,
    "PLUG": 120, "TSLA": 12, "VRT": 32
}
for ticker, qty in us_stocks.items():
    if qty == 0:
        continue
    usd = f'=IFERROR({qty}*GOOGLEFINANCE("{ticker}","price"),0)'
    ntd = f'=IFERROR({qty}*GOOGLEFINANCE("{ticker}","price")*32,0)'
    rows.append(["USD Stock", ticker, qty, usd, ntd])

# ─── Taiwan Stocks (GOOGLEFINANCE with TPE: prefix, qty in shares not lots) ───
tw_stocks = {
    "2330": 3000,   # TSMC - 3 lots × 1000
    "2890": 1047,   # SinoPac
}
for ticker, qty in tw_stocks.items():
    if qty == 0:
        continue
    ntd = f'=IFERROR({qty}*GOOGLEFINANCE("TPE:{ticker}","price"),0)'
    usd = f'=IFERROR({qty}*GOOGLEFINANCE("TPE:{ticker}","price")/32,0)'
    rows.append(["NTD Stock", ticker, qty, usd, ntd])

# ─── Taiwan Preferred / Bond ETFs ───
# 00687B and 00719B - these may not work with GOOGLEFINANCE, use static values from Excel
tw_preferred = {
    "00687B": {"qty": 22000, "ntd_value": 629843},
    "00719B": {"qty": 11000, "ntd_value": 342492},
}
for ticker, info in tw_preferred.items():
    # Try GOOGLEFINANCE first, fallback to static
    ntd = f'=IFERROR({info["qty"]}*GOOGLEFINANCE("TPE:{ticker}","price"), {info["ntd_value"]})'
    usd = f'=IFERROR({info["qty"]}*GOOGLEFINANCE("TPE:{ticker}","price")/32, {info["ntd_value"]}/32)'
    rows.append(["NTD Preferred", ticker, info["qty"], usd, ntd])

# ─── USD Preferred (Fixed deposit) ───
rows.append(["USD Preferred", "Richard Fixed", "", 54093, "=D" + str(len(rows)+2) + "*32"])

# ─── USD Cash Accounts ───
usd_cash = {"Firstrade": 13769, "Wise/BOA": 10601}
for acct, amt in usd_cash.items():
    row_num = len(rows) + 2
    rows.append(["USD Cash", acct, "", amt, f"=D{row_num}*32"])

# ─── NTD Cash Accounts ───
ntd_cash = {"Cathey": 53459, "Dawho": 6507608, "Richard": 490401}
for acct, amt in ntd_cash.items():
    row_num = len(rows) + 2
    rows.append(["NTD Cash", acct, "", f"=E{row_num}/32", amt])

# ─── Debt ───
# From Excel $$$$$ sheet: Apr 2026 remaining loan is NT$3,677,746
row_num = len(rows) + 2
rows.append(["Loan", "NTD Student Loan", "", f"=-E{row_num}/32", -3677746])

print(f"Total rows to upload: {len(rows)}")
for i, r in enumerate(rows):
    print(f"  Row {i+1}: {r[0]:15s} | {r[1]:20s} | qty={r[2]}")

# Send to Google Sheets
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

payload = {"action": "init_portfolio", "data": rows}
req = urllib.request.Request(
    APPS_SCRIPT_URL,
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

print("\nBeaming portfolio to Google Sheets...")
try:
    response = urllib.request.urlopen(req, context=ctx)
    result = response.read().decode('utf-8')
    print("Success!", result)
except Exception as e:
    print("Failed:", e)
