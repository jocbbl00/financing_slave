"""
One-time migration: Extract portfolio from Excel and push to Google Sheets
with live GOOGLEFINANCE() formulas for all stock holdings.

Portfolio columns: Category | Ticker | DisplayName | Qty | USD Value | NTD Value | AvgCost
(Quantity is user input; values are formulas where applicable.)
"""
import json
import ssl
import urllib.request

APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfNl53aUdseOlPdl6-6ffWlZotHqwQmw6tPZJCMO8veRLnUWVaGNasy4jLCNdhkAexf0w/exec'

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
    rows.append(["USD Stock", ticker, "", qty, usd, ntd, ""])

# ─── Taiwan Stocks (GOOGLEFINANCE with TPE: prefix, qty in shares not lots) ───
tw_stocks = {
    "2330": ("TSMC", 3000),
    "2890": ("SinoPac", 1047),
}
for ticker, (disp, qty) in tw_stocks.items():
    if qty == 0:
        continue
    ntd = f'=IFERROR({qty}*GOOGLEFINANCE("TPE:{ticker}","price"),0)'
    usd = f'=IFERROR({qty}*GOOGLEFINANCE("TPE:{ticker}","price")/32,0)'
    rows.append(["NTD Stock", ticker, disp, qty, usd, ntd, ""])

# ─── Taiwan Preferred / Bond ETFs ───
tw_preferred = {
    "00687B": {"disp": "CTBC Bond ETF", "qty": 22000, "ntd_value": 629843},
    "00719B": {"disp": "Yuanta Bond ETF", "qty": 11000, "ntd_value": 342492},
}
for ticker, info in tw_preferred.items():
    ntd = f'=IFERROR({info["qty"]}*GOOGLEFINANCE("TPE:{ticker}","price"), {info["ntd_value"]})'
    usd = f'=IFERROR({info["qty"]}*GOOGLEFINANCE("TPE:{ticker}","price")/32, {info["ntd_value"]}/32)'
    rows.append(["NTD Preferred", ticker, info["disp"], info["qty"], usd, ntd, ""])

# ─── USD Preferred (Fixed deposit) — Col E USD, F NTD ───
row_num = len(rows) + 2
rows.append(["USD Preferred", "Richard Fixed", "", "", 54093, f"=E{row_num}*32", ""])

# ─── USD Cash Accounts ───
usd_cash = {"Firstrade": 13769, "Wise/BOA": 10601}
for acct, amt in usd_cash.items():
    row_num = len(rows) + 2
    rows.append(["USD Cash", acct, "", "", amt, f"=E{row_num}*32", ""])

# ─── NTD Cash Accounts ───
ntd_cash = {"Cathey": 53459, "Dawho": 6507608, "Richard": 490401}
for acct, amt in ntd_cash.items():
    row_num = len(rows) + 2
    rows.append(["NTD Cash", acct, "", "", f"=F{row_num}/32", amt, ""])

# ─── Debt (placeholder — overwritten by Apps Script from Loans sheet) ───
row_num = len(rows) + 2
rows.append(["Loan", "NTD Student Loan", "", "", f"=-F{row_num}/32", -3677746, ""])

print(f"Total rows to upload: {len(rows)}")
for i, r in enumerate(rows):
    print(f"  Row {i+1}: {r[0]:15s} | {r[1]:20s} | {r[2]!s:12s} | qty={r[3]!s}")

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
