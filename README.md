# ACB Tracker

A React application for tracking Adjusted Cost Base (ACB), capital gains, and ETF distributions for Canadian investors.

## Features

- Multiple portfolio support
- Track transactions: Buy, Sell, Return of Capital, Reinvested Distributions, Capital Gains Distributions, Stock Splits, Superficial Losses, ACB Adjustments
- Automatic ACB calculation per CRA rules
- Capital gains/losses reporting by tax year (Schedule 3)
- Export capital gains report as PDF (Schedule 3 format)
- Export transactions as CSV
- Auto-fetch ETF distribution data (ROC, capital gains) via API
- CSV import/export
- Transaction auto-calculation: enter shares + price to auto-fill amount, or enter shares + amount to auto-fill price
- Security names wrap rather than truncate throughout the app
- Capital gains report scrolls horizontally on small screens
- Mobile-friendly dark UI

## Getting Started

```bash
npm install
npm run dev      # development build
npm run preview  # serve the built app locally
```

## Build

```bash
npm run build
```

## Tech Stack

- React 18
- esbuild (bundler)
- jsPDF + jspdf-autotable (PDF export)
- PapaParse (CSV parsing)
- SheetJS / xlsx (Excel/spreadsheet parsing)
- pdfjs-dist (PDF import)

## Version

Current version is defined solely in `package.json` and injected at build time via esbuild's `define` — no need to update it in multiple places.
