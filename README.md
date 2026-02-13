# ACB Tracker

A React application for tracking Adjusted Cost Base (ACB), capital gains, and ETF distributions for Canadian investors.

## Features

- Multiple portfolio support
- Track transactions: Buy, Sell, Return of Capital, Reinvested Distributions, Capital Gains Distributions, Stock Splits, Superficial Losses, ACB Adjustments
- Automatic ACB calculation per CRA rules
- Capital gains/losses reporting by tax year
- Auto-fetch ETF distribution data (ROC, capital gains) via API
- CSV import/export
- Mobile-friendly dark UI

## Getting Started

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

## Build

```bash
npm run build
```

## Tech Stack

- React 18
- Vite
- PapaParse (CSV parsing)
