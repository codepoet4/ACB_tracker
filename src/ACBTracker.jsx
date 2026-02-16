import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const APP_VERSION = "1.5.4";
const uid = () => Math.random().toString(36).slice(2, 10);
let _dp = 2;
const fmt = (n) => { const v = (n != null && !isNaN(n)) ? Number(n) : 0; return `$${v.toLocaleString("en-CA", { minimumFractionDigits: _dp, maximumFractionDigits: _dp })}`; };
const fmtPrice = (n) => { const v = Number(n); if (n == null || isNaN(v)) return fmt(0); const d = _dp > 2 ? _dp : (Math.abs(v) < 1 ? 5 : 2); return `$${v.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d })}`; };
const shortSym = (s, max = 24) => s && s.length > max ? s.slice(0, max) + "\u2026" : s;
const today = () => new Date().toISOString().slice(0, 10);

const TX_TYPES = [
  { value: "BUY", label: "Buy", color: "#34d399" },
  { value: "SELL", label: "Sell", color: "#f87171" },
  { value: "ROC", label: "Return of Capital", color: "#fbbf24" },
  { value: "REINVESTED_DIST", label: "Reinvested Dist.", color: "#60a5fa" },
  { value: "CAPITAL_GAINS_DIST", label: "Cap. Gains Dist.", color: "#2dd4bf" },
  { value: "REINVESTED_CAP_GAINS", label: "Reinvested Cap. Gains", color: "#22d3ee" },
  { value: "STOCK_SPLIT", label: "Stock Split", color: "#a78bfa" },
  { value: "SUPERFICIAL_LOSS", label: "Superficial Loss", color: "#fb923c" },
  { value: "ACB_ADJUSTMENT", label: "ACB Adjustment", color: "#f472b6" },
];
const txColor = (t) => TX_TYPES.find((x) => x.value === t)?.color || "#9ca3af";
const txLabel = (t) => TX_TYPES.find((x) => x.value === t)?.label || t;

function computeACB(transactions) {
  let shares = 0, totalACB = 0;
  const rows = [];
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || (a._order || 0) - (b._order || 0));
  for (const tx of sorted) {
    const qty = Number(tx.shares) || 0, price = Number(tx.pricePerShare) || 0, commission = Number(tx.commission) || 0, amount = Number(tx.amount) || 0;
    let gainLoss = null, note = "", txProceeds = null, txDispositionACB = null, txOutlays = null;
    switch (tx.type) {
      case "BUY": { const cost = amount || qty * price; totalACB += cost + commission; shares += qty; break; }
      case "SELL": if (shares > 0) { const proceeds = amount || qty * price; const dACB = (totalACB / shares) * qty; gainLoss = proceeds - commission - dACB; totalACB -= dACB; shares -= qty; txProceeds = proceeds; txDispositionACB = dACB; txOutlays = commission; } break;
      case "ROC": { const rocAmt = amount || qty * price; totalACB -= rocAmt; if (totalACB < 0) { gainLoss = -totalACB; note = "Excess ROC → gain"; totalACB = 0; } break; }
      case "REINVESTED_DIST": { const cost = amount || qty * price; totalACB += cost + commission; shares += qty; note = "DRIP"; break; }
      case "CAPITAL_GAINS_DIST": { note = "Cap. gains dist (no ACB impact)"; break; }
      case "REINVESTED_CAP_GAINS": { const distAmt = amount || qty * price; totalACB += distAmt; note = "Reinvested cap. gains → ACB"; break; }
      case "STOCK_SPLIT": shares *= (qty || 2); note = `Split ${qty || 2}:1`; break;
      case "SUPERFICIAL_LOSS": { const slAmt = amount || qty * price; totalACB += slAmt; note = "Denied loss → ACB"; break; }
      case "ACB_ADJUSTMENT": { const adjAmt = amount || qty * price; totalACB += adjAmt; if (totalACB < 0) { gainLoss = -totalACB; totalACB = 0; } break; }
    }
    rows.push({ ...tx, runningShares: shares, runningACB: totalACB, acbPerShare: shares > 0 ? totalACB / shares : 0, gainLoss, proceeds: txProceeds, dispositionACB: txDispositionACB, outlays: txOutlays, note: tx.note || note });
  }
  return { rows, totalShares: shares, totalACB: totalACB, acbPerShare: shares > 0 ? totalACB / shares : 0 };
}

const CSV_HEADERS = ["portfolio","symbol","date","type","shares","pricePerShare","commission","amount","note"];
function exportCSV(portfolios) {
  const rows = [];
  for (const p of portfolios) for (const sym of Object.keys(p.holdings)) for (const tx of p.holdings[sym])
    rows.push({ portfolio: p.name, symbol: sym, date: tx.date, type: tx.type, shares: tx.shares||"", pricePerShare: tx.pricePerShare||"", commission: tx.commission||"", amount: tx.amount||"", note: tx.note||"" });
  return Papa.unparse(rows, { columns: CSV_HEADERS });
}
function importCSV(csvText, existing) {
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: true, delimitersToGuess: [",","\t",";"] });
  const portfolios = [...existing]; const pMap = {};
  portfolios.forEach((p, i) => { pMap[p.name.toLowerCase()] = i; });
  for (const row of result.data) {
    const pName = (row.portfolio||"Imported").trim(), sym = (row.symbol||"").trim().toUpperCase();
    if (!sym) continue;
    let pIdx = pMap[pName.toLowerCase()];
    if (pIdx === undefined) { pIdx = portfolios.length; portfolios.push({ id: uid(), name: pName, holdings: {} }); pMap[pName.toLowerCase()] = pIdx; }
    if (!portfolios[pIdx].holdings[sym]) portfolios[pIdx].holdings[sym] = [];
    portfolios[pIdx].holdings[sym].push({ id: uid(), _order: portfolios[pIdx].holdings[sym].length, date: row.date?String(row.date):today(), type: row.type||"BUY", shares: row.shares??0, pricePerShare: row.pricePerShare??0, commission: row.commission??0, amount: row.amount??0, note: row.note||"" });
  }
  return portfolios;
}
// ─── AdjustedCostBase.ca CSV Import ───
const ACB_MONTHS = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06", Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
function convertACBDate(d) { const m = (d||"").match(/^(\d{4})-(\w{3})-(\d{2})$/); return m ? `${m[1]}-${ACB_MONTHS[m[2]]||"01"}-${m[3]}` : d||today(); }
function isACBcaFormat(text) { return (text.split(/\r?\n/)[0]||"").includes("Adjusted Cost Base and Capital Gains Report"); }
function importACBca(csvText, existing) {
  const lines = csvText.split(/\r?\n/);
  // Extract portfolio name
  let portfolioName = "Imported";
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const m = lines[i].match(/Portfolio:\s*([^"]+)/);
    if (m) { portfolioName = m[1].trim(); break; }
  }
  // Find section boundaries
  let summaryStart = -1, txStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('"Name","Ticker"') === 0 && summaryStart < 0) summaryStart = i;
    if (lines[i].indexOf('"Security","Date","Transaction"') === 0) txStart = i;
  }
  if (txStart < 0) throw new Error("No transaction table found in AdjustedCostBase.ca CSV");
  // Build name→ticker lookup from summary
  const nameToTicker = {};
  if (summaryStart >= 0) {
    const sumRows = Papa.parse(lines.slice(summaryStart, txStart).join("\n"), { header: true, skipEmptyLines: true }).data;
    for (const r of sumRows) {
      const name = (r["Name"]||"").trim(), tick = (r["Ticker"]||"").trim().toUpperCase();
      if (name && tick) nameToTicker[name] = tick;
    }
  }
  const resolveTicker = (name) => {
    let t = (nameToTicker[name] || "").replace(/\?/g, "").trim().toUpperCase();
    if (t && t.length >= 2 && /^[A-Z0-9.]+$/.test(t)) return t;
    return name || "UNKNOWN";
  };
  // Parse transactions
  const txRows = Papa.parse(lines.slice(txStart).join("\n"), { header: true, skipEmptyLines: true }).data;
  const portfolios = [...existing]; const pMap = {};
  portfolios.forEach((p, i) => { pMap[p.name.toLowerCase()] = i; });
  for (const row of txRows) {
    const sec = (row["Security"]||"").trim();
    if (!sec || sec.startsWith("Total") || sec.startsWith("Grand")) continue;
    const ticker = resolveTicker(sec);
    const rawType = (row["Transaction"]||"").trim();
    const date = convertACBDate((row["Date"]||"").trim());
    const amount = parseFloat(row["Amount"]) || 0;
    const shares = parseFloat(row["Shares"]) || 0;
    const comm = parseFloat(row["Commission"]) || 0;
    const aps = parseFloat(row["Amount/Share"]) || 0;
    const dacb = parseFloat(row["Change in ACB"]) || 0;
    const memo = (row["Memo"]||"").trim();
    let type, tShares = "", tPrice = "", tComm = "0", tAmt = "";
    if (rawType.toLowerCase().includes("split")) {
      type = "STOCK_SPLIT";
      // Parse "old -> new" from Shares column (e.g. "14300 -> 143")
      const splitMatch = (row["Shares"] || "").match(/([\d.]+)\s*->\s*([\d.]+)/);
      if (splitMatch) {
        const oldS = parseFloat(splitMatch[1]), newS = parseFloat(splitMatch[2]);
        tShares = oldS > 0 ? newS / oldS : 2;
      } else { tShares = shares || 2; }
    } else {
      const rt = rawType.toLowerCase();
      if (rt === "buy") { type = "BUY"; tShares = shares; tPrice = aps || (shares > 0 ? amount / shares : 0); tComm = comm; tAmt = amount; }
      else if (rt === "sell") { type = "SELL"; tShares = shares; tPrice = aps || (shares > 0 ? amount / shares : 0); tComm = comm; tAmt = amount; }
      else if (rt.includes("return of capital")) { type = "ROC"; tShares = shares; tPrice = aps || (shares > 0 ? Math.abs(amount) / shares : 0); tAmt = (aps > 0 && shares > 0) ? aps * shares : Math.abs(amount); }
      else if (rt.includes("reinvest") && (rt.includes("cap") || rt.includes("gain"))) { type = "REINVESTED_CAP_GAINS"; tShares = shares; tPrice = aps || (shares > 0 ? Math.abs(dacb) / shares : 0); tAmt = (aps > 0 && shares > 0) ? aps * shares : Math.abs(dacb); }
      else if (rt.includes("reinvest") || rt.includes("drip")) { type = "REINVESTED_DIST"; tShares = shares; tPrice = aps || (shares > 0 ? Math.abs(amount) / shares : 0); tComm = comm; tAmt = (aps > 0 && shares > 0) ? aps * shares : Math.abs(amount); }
      else if (rt.includes("non-cash") || rt.includes("non cash") || rt.includes("phantom")) { type = "REINVESTED_CAP_GAINS"; tShares = shares; tPrice = aps || (shares > 0 ? Math.abs(dacb) / shares : 0); tAmt = (aps > 0 && shares > 0) ? aps * shares : Math.abs(dacb); }
      else if (rt.includes("capital gain")) { type = "CAPITAL_GAINS_DIST"; tShares = shares; tPrice = aps || (shares > 0 ? Math.abs(amount) / shares : 0); tAmt = (aps > 0 && shares > 0) ? aps * shares : Math.abs(amount); }
      else { type = "ACB_ADJUSTMENT"; tShares = shares; tPrice = aps; tAmt = dacb; }
    }
    let pIdx = pMap[portfolioName.toLowerCase()];
    if (pIdx === undefined) { pIdx = portfolios.length; portfolios.push({ id: uid(), name: portfolioName, holdings: {} }); pMap[portfolioName.toLowerCase()] = pIdx; }
    if (!portfolios[pIdx].holdings[ticker]) portfolios[pIdx].holdings[ticker] = [];
    portfolios[pIdx].holdings[ticker].push({ id: uid(), _order: portfolios[pIdx].holdings[ticker].length, date, type, shares: tShares, pricePerShare: tPrice, commission: tComm, amount: tAmt, note: memo || `ACB.ca: ${rawType}` });
  }
  return portfolios;
}
function generateCapGainsReport(holdings, year) {
  const allRows = [];
  for (const sym of Object.keys(holdings)) {
    const { rows } = computeACB(holdings[sym]);
    // Find earliest acquisition date for this symbol
    const firstBuy = rows.find(r => r.type === "BUY" || r.type === "REINVESTED_DIST");
    const acqYear = firstBuy ? firstBuy.date.slice(0, 4) : "";
    for (const r of rows) if ((r.gainLoss != null || r.type === "STOCK_SPLIT") && r.date.startsWith(String(year)))
      allRows.push({ symbol: sym, date: r.date, type: r.type, shares: r.shares, proceeds: r.proceeds, dispositionACB: r.dispositionACB, outlays: r.outlays, gainLoss: r.gainLoss, acquisitionYear: acqYear, note: r.note });
  }
  const g = allRows.filter(r => r.gainLoss > 0).reduce((s, r) => s + r.gainLoss, 0);
  const l = allRows.filter(r => r.gainLoss < 0).reduce((s, r) => s + r.gainLoss, 0);
  const tProceeds = allRows.reduce((s, r) => s + (r.proceeds || 0), 0);
  const tACB = allRows.reduce((s, r) => s + (r.dispositionACB || 0), 0);
  const tOutlays = allRows.reduce((s, r) => s + (r.outlays || 0), 0);
  return { rows: allRows, totalGains: g, totalLosses: l, net: g + l, totalProceeds: tProceeds, totalACB: tACB, totalOutlays: tOutlays };
}

function exportSchedule3PDF(report, portfolioName, year) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Schedule 3 \u2014 Capital Gains (Losses)", 14, 15);
  doc.setFontSize(11);
  doc.text(`Portfolio: ${portfolioName}`, 14, 23);
  doc.text(`Tax Year: ${year}`, 14, 29);
  doc.setFontSize(9);
  doc.text("Publicly traded shares, mutual fund units, and other shares", 14, 35);

  const f = (n) => n != null ? `$${Number(n).toFixed(2)}` : "";

  autoTable(doc, {
    startY: 40,
    head: [["Description", "Year\nAcquired", "Proceeds of\nDisposition", "Adjusted\nCost Base", "Outlays &\nExpenses", "Gain (Loss)"]],
    body: report.rows.map(r => r.type === "STOCK_SPLIT"
      ? [shortSym(r.symbol, 30), { content: r.note || "Stock Split", colSpan: 5, styles: { fontStyle: "italic", textColor: [200, 160, 50] } }]
      : [shortSym(r.symbol, 30), r.acquisitionYear || "", f(r.proceeds), f(r.dispositionACB), f(r.outlays), f(r.gainLoss)]
    ),
    foot: [["Totals", "", f(report.totalProceeds), f(report.totalACB), f(report.totalOutlays), f(report.net)]],
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: "bold" },
    footStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Generated by ACB Tracker", 14, doc.internal.pageSize.height - 10);
    },
  });

  // Summary below table
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`Total Gains: ${f(report.totalGains)}`, 14, finalY);
  doc.text(`Total Losses: ${f(report.totalLosses)}`, 14, finalY + 6);
  doc.text(`Net Capital Gains (Losses): ${f(report.net)}`, 14, finalY + 12);
  doc.text(`Taxable Capital Gains / Losses (50%): ${f(report.net * 0.5)}`, 14, finalY + 18);

  doc.save(`schedule3_${portfolioName.replace(/\s+/g, "_")}_${year}.pdf`);
}

// ─── CDS Tax Breakdown Service (Auto-Fetch + Upload + Manual) ───
const CDS_BASE = "https://services.cds.ca";
const CDS_BASE_NEW = "https://ctbsext.posttrade.cds.ca";
// URLs to try for the fund index, in order of preference
const CDS_INDEX_URLS = (year) => year >= 2025
  ? [`${CDS_BASE_NEW}/ctbsExt/external-landing`]
  : [
      `${CDS_BASE}/taxforms/index.html`,
      `${CDS_BASE}/applications/taxforms/taxforms.nsf/PROCESSED-EN-?OpenView&Start=1&Count=3000&RestrictToCategory=T3-${year}`,
    ];
const CDS_LINKS = {
  current: "https://ctbsext.posttrade.cds.ca/ctbsExt/",
  legacy: "https://services.cds.ca/taxforms/index.html",
};
const CORS_PROXIES = [
  { name: "corsproxy.io", fn: (u) => "https://corsproxy.io/?" + encodeURIComponent(u) },
  { name: "allorigins.win", fn: (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u) },
];

async function proxyFetch(url, responseType = "text", onLog) {
  const log = onLog || (() => {});
  const errors = [];
  for (const proxy of CORS_PROXIES) {
    log(`Trying proxy: ${proxy.name}...`);
    const proxyUrl = proxy.fn(url);
    try {
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        const size = resp.headers.get("content-length");
        log(`${proxy.name}: HTTP ${resp.status} OK${size ? ` (${(size / 1024).toFixed(1)} KB)` : ""}`);
        return responseType === "arraybuffer" ? await resp.arrayBuffer() : await resp.text();
      } else {
        const msg = `${proxy.name}: HTTP ${resp.status} ${resp.statusText}`;
        log(msg);
        errors.push(msg);
      }
    } catch (e) {
      const msg = `${proxy.name}: ${e.message || "Network error"}`;
      log(msg);
      errors.push(msg);
    }
  }
  const err = new Error("CORS_BLOCKED");
  err.details = errors;
  throw err;
}

function parseCDSIndexHTML(html, onLog, sourceUrl) {
  const log = onLog || (() => {});
  const doc = new DOMParser().parseFromString(html, "text/html");
  log(`Received ${html.length.toLocaleString()} bytes of HTML`);

  const title = doc.querySelector("title")?.textContent?.trim() || "";
  if (title) log(`Page title: "${title}"`);

  const resolveUrl = (href) => {
    if (!href) return "";
    if (href.startsWith("http")) return href;
    try { return new URL(href, sourceUrl || CDS_BASE).href; } catch { return CDS_BASE + href; }
  };

  // Classify a link as "download" (file link) or "name" (external/navigation)
  const isDownloadHref = (href) => {
    const h = href.toLowerCase();
    return h.endsWith(".xls") || h.endsWith(".xlsx") || h.endsWith(".xlsm") || h.endsWith(".pdf") || h.includes("$file")
      || h.includes("/taxforms/") || h.includes("openfileresource") || h.includes("openelement");
  };
  const isExternalHref = (href) => {
    try {
      const u = new URL(href, sourceUrl || CDS_BASE);
      return !u.hostname.includes("cds.ca") && !u.hostname.includes("services.cds") && !u.hostname.includes("ctbs");
    } catch { return false; }
  };
  const fileType = (href) => {
    const h = href.toLowerCase();
    if (h.endsWith(".pdf")) return "pdf";
    return "xls";
  };

  // Strategy 1: Look for table#taxlist (old Domino format)
  const taxlistTable = doc.querySelector("table#taxlist");
  if (taxlistTable) {
    log(`Found table#taxlist with ${taxlistTable.rows.length} rows (Domino format)`);
    return parseDominoTable(taxlistTable, log, resolveUrl);
  }

  // Strategy 2: Try every table on the page — look for rows with BOTH a name and a download link
  const tables = doc.querySelectorAll("table");
  log(`No table#taxlist. Found ${tables.length} table(s), scanning for fund data...`);
  for (let ti = 0; ti < tables.length; ti++) {
    const t = tables[ti];
    if (t.rows.length < 3) continue;
    const result = parseGenericTable(t, log, resolveUrl, isDownloadHref, isExternalHref, fileType, ti);
    if (result.length > 0) return result;
  }

  // Strategy 3: Scan ALL links on the page for direct file downloads (no table context)
  const allLinks = doc.querySelectorAll("a[href]");
  log(`No table results. Scanning all ${allLinks.length} links for file downloads...`);
  const fileLinks = [];
  const debugLinks = [];
  for (const link of allLinks) {
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript")) continue;
    const text = link.textContent.trim();
    if (isDownloadHref(href)) {
      const fullUrl = resolveUrl(href);
      fileLinks.push({ name: text || href.split("/").pop(), cusip: "", date: "", xlsUrl: fullUrl, fileType: fileType(href) });
    }
    debugLinks.push({ href: href.slice(0, 80), text: text.slice(0, 40) });
  }
  if (fileLinks.length > 0) {
    log(`Found ${fileLinks.length} direct file download links`);
    return fileLinks;
  }

  // Nothing found — show diagnostics
  log(`No file downloads found on the page.`);
  const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  log(`Page body preview: ${bodyText.slice(0, 400)}`);
  if (debugLinks.length > 0) {
    log(`Sample links (first 15):`);
    for (const dl of debugLinks.slice(0, 15)) log(`  href="${dl.href}" text="${dl.text}"`);
  }
  return [];
}

// Parse old Domino-style table#taxlist (span.Cusip, span.Date, a[href])
function parseDominoTable(table, log, resolveUrl) {
  const funds = [], seen = {};
  let rowsSkipped = 0, rowsNoLink = 0, rowsParsed = 0;
  for (const row of table.rows) {
    const cols = row.cells;
    if (!cols || cols.length < 2) { rowsSkipped++; continue; }
    const cusipEl = row.querySelector("span.Cusip");
    const dateEl = row.querySelector("span.Date");
    const linkEl = row.querySelector("a[href]");
    if (!linkEl) { rowsNoLink++; continue; }
    const cusip = cusipEl ? cusipEl.textContent.trim() : "";
    const date = dateEl ? dateEl.textContent.trim() : "";
    const href = linkEl.getAttribute("href") || "";
    const name = linkEl.textContent.trim();
    if (!name && !cusip) continue;
    const fullUrl = resolveUrl(href);
    const key = cusip || name;
    if (!seen[key] || date > seen[key].date) { seen[key] = { cusip, name, date, xlsUrl: fullUrl }; }
    rowsParsed++;
  }
  const result = Object.values(seen);
  log(`Domino table: ${rowsParsed} data rows, ${result.length} unique funds (${rowsSkipped} skipped, ${rowsNoLink} no link)`);
  if (result.length === 0 && table.rows.length > 1) {
    const sr = table.rows[Math.min(1, table.rows.length - 1)];
    log(`Sample row HTML: ${sr.innerHTML.slice(0, 300)}`);
  }
  return result;
}

// Parse any table — for each row, separate download links from name/external links
function parseGenericTable(table, log, resolveUrl, isDownloadHref, isExternalHref, fileType, tableIndex) {
  const funds = [], seen = {};
  let rowsAnalyzed = 0, rowsWithDownload = 0;
  const sampleRows = [];
  for (const row of table.rows) {
    if (!row.cells || row.cells.length < 2) continue;
    rowsAnalyzed++;
    const links = Array.from(row.querySelectorAll("a[href]"));
    if (links.length === 0) continue;

    // Separate download links from name/navigation links
    let downloadLink = null, nameLink = null;
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript")) continue;
      if (isDownloadHref(href)) {
        downloadLink = a;
      } else if (isExternalHref(href) || a.textContent.trim().length > 5) {
        nameLink = a;
      }
    }

    // If no dedicated download link, check if ANY link looks like a CDS-hosted file
    if (!downloadLink) {
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const resolved = resolveUrl(href);
        if (resolved.includes("cds.ca") && (href.includes("/") || href.includes("."))) {
          const h = href.toLowerCase();
          if (h.endsWith(".xls") || h.endsWith(".xlsx") || h.endsWith(".pdf") || h.includes("$file") || h.includes("taxform")) {
            downloadLink = a; break;
          }
        }
      }
    }

    if (!downloadLink) {
      if (sampleRows.length < 3) sampleRows.push(row);
      continue;
    }
    rowsWithDownload++;

    const dlHref = downloadLink.getAttribute("href") || "";
    const fullUrl = resolveUrl(dlHref);
    const fType = fileType(dlHref);

    // Get fund name: prefer the name link text, then cell text
    const cells = Array.from(row.cells).map(c => c.textContent.trim());
    const name = (nameLink ? nameLink.textContent.trim() : "") || cells.find(c => c.length > 10 && !/^\d+$/.test(c)) || downloadLink.textContent.trim() || "";
    const cusip = cells.find(c => /^\d{8,9}$/.test(c)) || "";
    const date = cells.find(c => /\d{4}[-/]\d{2}[-/]\d{2}/.test(c)) || "";

    const key = cusip || name;
    if (key && !seen[key]) { seen[key] = { cusip, name, date, xlsUrl: fullUrl, fileType: fType }; funds.push(seen[key]); }
  }
  if (rowsAnalyzed > 2) {
    log(`Table[${tableIndex}]: ${table.rows.length} rows, ${rowsAnalyzed} data rows, ${rowsWithDownload} with download links, ${funds.length} funds extracted`);
    if (funds.length === 0 && sampleRows.length > 0) {
      log(`Sample row with no download link detected:`);
      for (const sr of sampleRows.slice(0, 2)) {
        const linksInfo = Array.from(sr.querySelectorAll("a[href]")).map(a => `href="${(a.getAttribute("href")||"").slice(0,60)}" text="${a.textContent.trim().slice(0,30)}"`).join(" | ");
        log(`  Links: ${linksInfo}`);
        log(`  Cells: ${Array.from(sr.cells).map((c,i) => `[${i}]="${c.textContent.trim().slice(0,30)}"`).join(", ")}`);
      }
    }
  }
  return funds;
}

// Parse CDS Excel using exact cell positions from the CDS spreadsheet format
// Cell positions (0-indexed, matching xlrd): Symbol=(4,12), distribution data columns 3-16
// Row 18: Total$/unit, 19: Record date, 20: Payment date, 22: Total non-cash, 31: Return of Capital
function parseCDSExcel(data) {
  const wb = XLSX.read(new Uint8Array(data), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { found: false, error: "Empty spreadsheet" };

  const cell = (r, c) => { const a = XLSX.utils.encode_cell({ r, c }); return ws[a] ? ws[a].v : null; };

  // Extract fund name and symbol from header area
  const symbol = cell(4, 12) || "";
  let fundName = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      const v = cell(r, c);
      if (v && typeof v === "string" && v.trim().length > 10
        && !/cds|tax breakdown|limited partner|income trust/i.test(v)) {
        fundName = v.trim(); break;
      }
    }
    if (fundName) break;
  }

  // Check calculation method (BMO uses percentages)
  let calcMethod = "dollar";
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 40, c: 20 } };
  for (let r = 0; r <= Math.min(range.e.r, 17); r++) {
    for (let c = 0; c <= Math.min(range.e.c, 20); c++) {
      const v = cell(r, c);
      if (v && typeof v === "string" && /calc.*method/i.test(v)) {
        const next = cell(r, c + 1);
        if (next && /cent|%/i.test(String(next))) calcMethod = "percent";
      }
    }
  }

  // Scan distribution columns (3-16) using known CDS row positions
  let totalNonCash = 0, totalROC = 0, totalPerUnitSum = 0, lastRecordDate = "";
  let columnsFound = 0;
  for (let col = 3; col <= 16; col++) {
    const tpu = cell(18, col);
    if (tpu === null || tpu === undefined || tpu === 0 || tpu === "") continue;
    columnsFound++;
    const perUnit = typeof tpu === "number" ? tpu : parseFloat(tpu) || 0;
    totalPerUnitSum += perUnit;
    const nc = cell(22, col); // Total non-cash
    const roc = cell(31, col); // Return of capital
    const rd = cell(19, col); // Record date
    totalNonCash += typeof nc === "number" ? nc : parseFloat(nc) || 0;
    totalROC += typeof roc === "number" ? roc : parseFloat(roc) || 0;
    if (rd) lastRecordDate = String(rd);
  }

  // Handle BMO percentage method
  if (calcMethod === "percent" && totalPerUnitSum > 0) {
    totalNonCash = (totalNonCash / 100) * totalPerUnitSum;
    totalROC = (totalROC / 100) * totalPerUnitSum;
  }

  // If exact positions found nothing, fall back to label scanning
  if (columnsFound === 0) {
    const fallback = parseCDSExcelByLabels(ws, range);
    if (fallback.found) return { ...fallback, symbol, fundName };
  }

  // Format record date
  let recordDate = "";
  if (lastRecordDate) {
    if (typeof lastRecordDate === "number") {
      try { const d = XLSX.SSF.parse_date_code(lastRecordDate); recordDate = `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`; } catch {}
    } else { const m = String(lastRecordDate).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if (m) recordDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`; }
  }

  return {
    found: totalNonCash > 0 || totalROC > 0,
    symbol, fundName, calcMethod, recordDate,
    perUnit: { nonCashDistribution: Math.round(totalNonCash * 1e6) / 1e6, returnOfCapital: Math.round(totalROC * 1e6) / 1e6 },
  };
}

// Fallback: scan for labels in the spreadsheet (for non-standard layouts)
function parseCDSExcelByLabels(ws, range) {
  let roc = 0, nc = 0, calcMethod = "dollar", totalDist = 0;
  for (let r = range.s.r; r <= range.e.r; r++) {
    let label = "";
    for (let c = range.s.c; c <= Math.min(range.e.c, 3); c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })];
      if (v && typeof v.v === "string") label += " " + v.v;
    }
    label = label.toLowerCase();
    const findNum = () => {
      for (let c = 1; c <= Math.min(range.e.c, 20); c++) {
        const v = ws[XLSX.utils.encode_cell({ r, c })];
        if (v && typeof v.v === "number" && v.v !== 0) return v.v;
      }
      return 0;
    };
    if (label.includes("return of capital") && !label.includes("total")) roc = findNum();
    if ((label.includes("non-cash") || label.includes("non cash")) && label.includes("total")) nc = findNum();
    if (nc === 0 && (label.includes("non-cash dist") || label.includes("non cash dist"))) nc = findNum();
    if (label.includes("calculation method") && (label.includes("cent") || label.includes("%"))) calcMethod = "percent";
    if (label.includes("total distribution") && label.includes("per unit")) totalDist = findNum();
  }
  if (calcMethod === "percent" && totalDist > 0) { roc = (roc / 100) * totalDist; nc = (nc / 100) * totalDist; }
  return { found: roc > 0 || nc > 0, calcMethod, perUnit: { nonCashDistribution: Math.round(nc * 1e6) / 1e6, returnOfCapital: Math.round(roc * 1e6) / 1e6 } };
}

// ─── Styles ───
const S = {
  page: { minHeight: "100vh", background: "#0f1219", color: "#e5e7eb", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif", WebkitTextSizeAdjust: "100%" },
  header: { background: "#1a1f2e", borderBottom: "1px solid #2d3548", padding: "12px 16px", position: "sticky", top: 0, zIndex: 40 },
  title: { fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 },
  subtitle: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  nav: { display: "flex", gap: 4, marginTop: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" },
  navBtn: (active) => ({ padding: "8px 14px", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", whiteSpace: "nowrap", background: active ? "#0f1219" : "#252d3d", color: active ? "#fff" : "#9ca3af" }),
  body: { padding: 16, maxWidth: 900, margin: "0 auto" },
  card: { background: "#1a1f2e", border: "1px solid #2d3548", borderRadius: 12, padding: 16, marginBottom: 12 },
  statRow: { display: "flex", gap: 8, marginBottom: 12 },
  stat: { flex: 1, background: "#1a1f2e", border: "1px solid #2d3548", borderRadius: 12, padding: 12 },
  statLabel: { fontSize: 11, color: "#6b7280" },
  statVal: { fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 4 },
  btn: (bg = "#3b82f6") => ({ background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }),
  btnSm: (bg = "#3b82f6") => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" }),
  input: { width: "100%", boxSizing: "border-box", background: "#252d3d", border: "1px solid #374151", borderRadius: 10, padding: "10px 12px", fontSize: 16, color: "#fff", WebkitAppearance: "none" },
  select: { width: "100%", boxSizing: "border-box", background: "#252d3d", border: "1px solid #374151", borderRadius: 10, padding: "10px 12px", fontSize: 16, color: "#fff", WebkitAppearance: "none" },
  label: { display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 4 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { background: "#1a1f2e", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 500, maxHeight: "85vh", overflowY: "auto", padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" },
  txCard: { background: "#141820", border: "1px solid #2d3548", borderRadius: 10, padding: 12, marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  divider: { border: "none", borderTop: "1px solid #2d3548", margin: "8px 0" },
};

// ─── Bottom Sheet Modal ───
function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={S.sheetTitle}><span>{title}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 24, cursor: "pointer", padding: 4 }}>×</button></div>
        {children}
      </div>
    </div>
  );
}

// ─── Transaction Form ───
function TxForm({ tx, onChange, onSave, onCancel, isEdit }) {
  const needsShares = true;
  const needsPrice = tx.type !== "STOCK_SPLIT";
  const needsAmount = ["BUY","SELL","ROC","REINVESTED_DIST","SUPERFICIAL_LOSS","ACB_ADJUSTMENT","CAPITAL_GAINS_DIST","REINVESTED_CAP_GAINS"].includes(tx.type);
  const needsComm = ["BUY","SELL","REINVESTED_DIST"].includes(tx.type);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={S.label}>Date</label><input type="date" value={tx.date} onChange={e => onChange({ ...tx, date: e.target.value })} style={S.input} /></div>
        <div><label style={S.label}>Type</label><select value={tx.type} onChange={e => onChange({ ...tx, type: e.target.value })} style={S.select}>{TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {needsShares && <div><label style={S.label}>{tx.type === "STOCK_SPLIT" ? "Multiplier" : "Shares"}</label><input type="number" inputMode="decimal" step="any" value={tx.shares} onChange={e => onChange({ ...tx, shares: e.target.value })} style={S.input} placeholder="0" /></div>}
        {needsPrice && <div><label style={S.label}>Price/Share</label><input type="text" inputMode="decimal" value={tx.pricePerShare} onChange={e => { const v = e.target.value; if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) onChange({ ...tx, pricePerShare: v }); }} onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange({ ...tx, pricePerShare: n.toFixed(6).replace(/0{1,4}$/, "") }); }} style={S.input} placeholder="0.00" /></div>}
        {needsAmount && <div><label style={S.label}>Amount ($)</label><input type="text" inputMode="decimal" value={tx.amount} onChange={e => { const v = e.target.value; if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) onChange({ ...tx, amount: v }); }} onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange({ ...tx, amount: n.toFixed(6).replace(/0{1,4}$/, "") }); }} style={S.input} placeholder="0.00" /></div>}
        {needsComm && <div><label style={S.label}>Commission</label><input type="text" inputMode="decimal" value={tx.commission} onChange={e => { const v = e.target.value; if (v === "" || /^\d*\.?\d{0,6}$/.test(v)) onChange({ ...tx, commission: v }); }} onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange({ ...tx, commission: n.toFixed(6).replace(/0{1,4}$/, "") }); }} style={S.input} placeholder="0.00" /></div>}
        {!needsShares && !needsAmount && <div />}
        {!needsPrice && !needsComm && <div />}
      </div>
      <div style={{ marginBottom: 14 }}><label style={S.label}>Note</label><input type="text" value={tx.note || ""} onChange={e => onChange({ ...tx, note: e.target.value })} style={S.input} placeholder="Optional" /></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSave} style={{ ...S.btn("#3b82f6"), flex: 1 }}>{isEdit ? "Update" : "Add"}</button>
        <button onClick={onCancel} style={{ ...S.btn("#374151"), flex: 0, minWidth: 80 }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── ETF Distribution Panel (CDS Tax Breakdown Service) ───
function ETFPanel({ symbol, holdings, onAdd, onClose }) {
  const [status, setStatus] = useState("idle"); // idle|loading|fundlist|found|applied|error|noitems
  const [result, setResult] = useState(null);
  const [proposed, setProposed] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);
  const [errMsg, setErrMsg] = useState("");
  const [mode, setMode] = useState("search"); // search|upload|manual
  const [manualNonCash, setManualNonCash] = useState("");
  const [manualROC, setManualROC] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [fundList, setFundList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchingXls, setFetchingXls] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const fileRef = useRef(null);
  const addLog = (msg) => setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg }]);

  const appliedYears = useMemo(() => {
    const s = {};
    for (const tx of holdings) { const m = (tx.note || "").match(/\[(?:CDS|Auto-fetched) (\d{4})\]/); if (m) s[m[1]] = true; }
    return s;
  }, [holdings]);

  const sharesAtYearEnd = useMemo(() => {
    const txs = holdings.filter(tx => tx.date <= `${selectedYear}-12-31`);
    return computeACB(txs).totalShares;
  }, [holdings, selectedYear]);

  const buildProposed = (nonCashPerUnit, rocPerUnit, recordDate, source) => {
    const txs = [], d = recordDate || `${selectedYear}-12-31`;
    if (nonCashPerUnit > 0) txs.push({ id: uid(), date: d, type: "REINVESTED_CAP_GAINS", shares: sharesAtYearEnd, pricePerShare: nonCashPerUnit, commission: "0", amount: Math.round(nonCashPerUnit * sharesAtYearEnd * 1e6) / 1e6, note: `[CDS ${selectedYear}] Reinvested cap. gains $${nonCashPerUnit}/u \u00d7 ${sharesAtYearEnd}`, _perUnit: nonCashPerUnit, _comp: "Reinvested Cap. Gains" });
    if (rocPerUnit > 0) txs.push({ id: uid(), date: d, type: "ROC", shares: sharesAtYearEnd, pricePerShare: rocPerUnit, commission: "0", amount: Math.round(rocPerUnit * sharesAtYearEnd * 1e6) / 1e6, note: `[CDS ${selectedYear}] ROC $${rocPerUnit}/u \u00d7 ${sharesAtYearEnd}`, _perUnit: rocPerUnit, _comp: "Return of Capital" });
    return txs;
  };

  const applyResult = (r) => {
    if (r.found) {
      setResult(r);
      const pu = r.perUnit || {};
      const txs = buildProposed(pu.nonCashDistribution || 0, pu.returnOfCapital || 0, r.recordDate || null, "CDS");
      setProposed(txs);
      setStatus(txs.length > 0 ? "found" : "noitems");
    } else {
      setResult(r);
      setErrMsg(r.error || "No Return of Capital or Non-Cash Distribution data found. Verify this is the correct CDS Tax Breakdown spreadsheet.");
      setStatus("error");
    }
  };

  // CDS Search: fetch index page(s), parse, show fund list
  const doFetchIndex = async () => {
    if (appliedYears[String(selectedYear)] || disabled) return;
    setStatus("loading"); setFundList([]); setErrMsg(""); setLogs([]); setShowLogs(false);
    setSearchQuery(symbol.replace(/\.TO$/i, ""));
    const urls = CDS_INDEX_URLS(selectedYear);
    addLog(`Tax year: ${selectedYear} — will try ${urls.length} URL(s)`);
    if (selectedYear >= 2025) addLog("Note: 2025+ data is hosted on the new CTBS portal (may use PDF format)");

    let lastError = null;
    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      addLog(`\n--- Attempt ${i + 1}/${urls.length}: ${targetUrl}`);
      try {
        const html = await proxyFetch(targetUrl, "text", addLog);
        addLog("Parsing HTML response...");
        const funds = parseCDSIndexHTML(html, addLog, targetUrl);
        if (funds.length > 0) {
          addLog(`Success! ${funds.length} funds loaded from attempt ${i + 1}.`);
          // Check if any funds are PDF-only
          const pdfOnly = funds.filter(f => f.fileType === "pdf");
          const xlsFunds = funds.filter(f => f.fileType !== "pdf");
          if (pdfOnly.length > 0 && xlsFunds.length === 0) {
            addLog(`All ${funds.length} files are PDFs (2025+ format). PDF auto-parsing is not yet supported.`);
            addLog("Use Upload mode with Excel files, or Manual mode to enter values from the PDF.");
          }
          setFundList(funds);
          setStatus("fundlist");
          return;
        }
        addLog(`No funds extracted from this URL. Trying next...`);
        lastError = new Error("Page returned HTML but no fund entries could be extracted. See log for details.");
      } catch (e) {
        if (e.message === "CORS_BLOCKED") {
          const details = e.details?.join("; ") || "All proxies failed";
          addLog(`CORS blocked: ${details}`);
          lastError = e;
        } else {
          addLog(`Error: ${e.message}`);
          lastError = e;
        }
      }
    }

    // All URLs failed
    addLog(`\n--- All ${urls.length} URL(s) exhausted. No funds loaded.`);
    if (lastError?.message === "CORS_BLOCKED") {
      setErrMsg("Could not connect to CDS automatically. All CORS proxies were blocked or returned errors. Use Upload or Manual mode.");
    } else {
      setErrMsg(lastError?.message || "No funds found. Check the log for details.");
    }
    setShowLogs(true);
    setStatus("error");
  };

  // Fetch a specific fund's XLS and parse it
  const doFetchXls = async (fund) => {
    setFetchingXls(true); setErrMsg(""); setLogs([]); setShowLogs(false);
    addLog(`Selected fund: ${fund.name} (CUSIP: ${fund.cusip})`);
    addLog(`Downloading Excel: ${fund.xlsUrl}`);
    try {
      const buf = await proxyFetch(fund.xlsUrl, "arraybuffer", addLog);
      addLog(`Downloaded ${(buf.byteLength / 1024).toFixed(1)} KB. Parsing Excel...`);
      const r = parseCDSExcel(buf);
      addLog(`Parse result: symbol="${r.symbol || "?"}", fundName="${r.fundName || "?"}", calcMethod=${r.calcMethod || "dollar"}`);
      addLog(`Per-unit: nonCash=${r.perUnit?.nonCashDistribution}, ROC=${r.perUnit?.returnOfCapital}`);
      applyResult(r);
    } catch (e) {
      if (e.message === "CORS_BLOCKED") {
        const details = e.details?.join("\n") || "All proxies failed";
        addLog(`All CORS proxies failed:\n${details}`);
        setErrMsg("Could not download the spreadsheet automatically. Try uploading it manually.");
      } else {
        addLog(`Error: ${e.message}`);
        setErrMsg("Failed to parse: " + e.message);
      }
      setShowLogs(true);
      setStatus("error");
    }
    setFetchingXls(false);
  };

  // Upload file handler
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (appliedYears[String(selectedYear)]) return;
    setStatus("loading"); setResult(null); setProposed([]); setErrMsg("");
    try {
      const buf = await file.arrayBuffer();
      applyResult(parseCDSExcel(buf));
    } catch (err) {
      setErrMsg("Could not parse file: " + err.message);
      setStatus("error");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  // Manual entry handler
  const doManual = () => {
    if (appliedYears[String(selectedYear)]) return;
    const nc = parseFloat(manualNonCash) || 0, roc = parseFloat(manualROC) || 0;
    if (nc === 0 && roc === 0) { setErrMsg("Enter at least one per-unit amount."); setStatus("error"); return; }
    const txs = buildProposed(nc, roc, manualDate || `${selectedYear}-12-31`, "CDS");
    setProposed(txs);
    setStatus("found");
  };

  const disabled = sharesAtYearEnd <= 0 || appliedYears[String(selectedYear)];
  const cdsUrl = selectedYear >= 2025 ? CDS_LINKS.current : CDS_LINKS.legacy;

  // Filter fund list by search query
  const filteredFunds = useMemo(() => {
    if (!searchQuery.trim()) return fundList.slice(0, 50);
    const q = searchQuery.toLowerCase().trim();
    return fundList.filter(f => f.name.toLowerCase().includes(q) || f.cusip.includes(q)).slice(0, 50);
  }, [fundList, searchQuery]);

  return (
    <div style={{ ...S.card, borderColor: "#312e81" }}>
      <div style={{ ...S.row, marginBottom: 8 }}><span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>ETF Distributions — {symbol}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}>×</button></div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>CDS Tax Breakdown Service · cdsinnovations.ca</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div><label style={S.label}>Tax Year</label><select value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setStatus("idle"); setProposed([]); setErrMsg(""); setFundList([]); }} style={S.select}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><label style={S.label}>Shares at Year-End</label><div style={{ ...S.input, background: "#1a1f2e" }}>{sharesAtYearEnd.toLocaleString("en-CA", { maximumFractionDigits: 4 })}</div></div>
      </div>
      {appliedYears[String(selectedYear)] && <div style={{ background: "#1c1917", border: "1px solid #854d0e", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13, color: "#fbbf24" }}>Already applied for {selectedYear}.</div>}
      {sharesAtYearEnd <= 0 && <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 10 }}>No shares held at end of {selectedYear}.</div>}

      {/* Mode tabs */}
      {status !== "found" && status !== "applied" && status !== "fundlist" && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          <button onClick={() => { setMode("search"); setStatus("idle"); setErrMsg(""); }} style={{ ...S.btnSm(mode === "search" ? "#4f46e5" : "#252d3d"), flex: 1, border: mode === "search" ? "none" : "1px solid #374151", fontSize: 11 }}>CDS Search</button>
          <button onClick={() => { setMode("upload"); setStatus("idle"); setErrMsg(""); }} style={{ ...S.btnSm(mode === "upload" ? "#4f46e5" : "#252d3d"), flex: 1, border: mode === "upload" ? "none" : "1px solid #374151", fontSize: 11 }}>Upload File</button>
          <button onClick={() => { setMode("manual"); setStatus("idle"); setErrMsg(""); }} style={{ ...S.btnSm(mode === "manual" ? "#4f46e5" : "#252d3d"), flex: 1, border: mode === "manual" ? "none" : "1px solid #374151", fontSize: 11 }}>Manual</button>
        </div>
      )}

      {/* CDS Search mode */}
      {mode === "search" && status === "idle" && (
        <div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10, lineHeight: 1.5 }}>
            Fetch the T3 fund list from <b style={{ color: "#818cf8" }}>{selectedYear >= 2025 ? "ctbsext.posttrade.cds.ca" : "services.cds.ca"}</b> and search for your ETF.
            {selectedYear >= 2025 && <><br /><span style={{ color: "#fbbf24" }}>Note: 2025+ data may be in PDF format. If auto-parse fails, use Upload or Manual mode.</span></>}
          </div>
          <button onClick={doFetchIndex} disabled={disabled} style={{ ...S.btn(disabled ? "#374151" : "#4f46e5"), opacity: disabled ? 0.4 : 1 }}>Fetch {selectedYear} Fund List from CDS</button>
        </div>
      )}

      {/* Fund list search results */}
      {status === "fundlist" && (
        <div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>{fundList.length} funds found. Search for your ETF by name or CUSIP:</div>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search fund name or CUSIP..." style={{ ...S.input, marginBottom: 8 }} autoFocus />
          <div style={{ maxHeight: 240, overflowY: "auto", borderRadius: 8, border: "1px solid #2d3548" }}>
            {filteredFunds.length === 0 && <div style={{ padding: 12, fontSize: 13, color: "#6b7280", textAlign: "center" }}>No matches. Try a different search term.</div>}
            {filteredFunds.map((f, i) => (
              <button key={(f.cusip || f.name) + i} onClick={() => f.fileType === "pdf" ? window.open(f.xlsUrl, "_blank") : doFetchXls(f)} disabled={fetchingXls} style={{ display: "block", width: "100%", textAlign: "left", background: i % 2 === 0 ? "#1a1f2e" : "#151a27", border: "none", borderBottom: "1px solid #2d3548", padding: "8px 12px", cursor: fetchingXls ? "wait" : "pointer", color: "#e5e7eb", fontSize: 13 }}>
                <div style={{ fontWeight: 500 }}>{f.name} {f.fileType === "pdf" && <span style={{ fontSize: 10, color: "#fbbf24", marginLeft: 4 }}>PDF</span>}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{f.cusip ? `CUSIP: ${f.cusip}` : ""}{f.date ? ` · ${f.date}` : ""}{f.fileType === "pdf" ? " · Opens in new tab" : " · Click to auto-parse"}</div>
              </button>
            ))}
          </div>
          {fetchingXls && logs.length > 0 && (
            <div style={{ background: "#0d1117", borderRadius: 6, padding: 8, marginTop: 8, maxHeight: 120, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }}>
              {logs.map((l, i) => <div key={i} style={{ color: "#8b949e" }}><span style={{ color: "#484f58" }}>{l.time}</span> {l.msg}</div>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => { setStatus("idle"); setFundList([]); setLogs([]); }} style={{ ...S.btnSm("#374151"), fontSize: 12 }}>Back</button>
            <a href={cdsUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.btnSm("#252d3d"), fontSize: 12, textDecoration: "none", color: "#818cf8", border: "1px solid #374151", textAlign: "center" }}>Open CDS Site</a>
          </div>
        </div>
      )}

      {/* Upload mode */}
      {mode === "upload" && status === "idle" && (
        <div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10, lineHeight: 1.6 }}>
            1. Visit <a href={cdsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8", textDecoration: "underline" }}>CDS Tax Breakdown Services</a> ({selectedYear >= 2025 ? "2025+" : "2024 & earlier"})<br />
            2. Find your ETF and download the Excel (.xls) file<br />
            3. Upload it below to auto-extract Return of Capital and Non-Cash Distribution
          </div>
          <label style={{ ...S.btn(disabled ? "#374151" : "#4f46e5"), display: "block", textAlign: "center", boxSizing: "border-box", opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}>
            Upload CDS Excel File
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.xlsm" onChange={handleFile} disabled={disabled} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {/* Manual mode */}
      {mode === "manual" && status === "idle" && (
        <div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>Enter per-unit amounts from <a href={cdsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8", textDecoration: "underline" }}>CDS Tax Breakdown Services</a>.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={S.label}>Reinvested Cap. Gains ($/unit)</label><input type="number" inputMode="decimal" step="any" value={manualNonCash} onChange={e => setManualNonCash(e.target.value)} style={S.input} placeholder="0.000000" /></div>
            <div><label style={S.label}>Return of Capital ($/unit)</label><input type="number" inputMode="decimal" step="any" value={manualROC} onChange={e => setManualROC(e.target.value)} style={S.input} placeholder="0.000000" /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={S.label}>Record Date (optional)</label><input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} style={S.input} /></div>
          <button onClick={doManual} disabled={disabled} style={{ ...S.btn("#4f46e5"), opacity: disabled ? 0.4 : 1 }}>Calculate & Review</button>
        </div>
      )}

      {/* Status indicators */}
      {status === "loading" && (
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: "center", color: "#818cf8", fontSize: 14, marginBottom: 8 }}>{mode === "search" ? `Fetching T3-${selectedYear} fund list from CDS...` : "Parsing CDS spreadsheet..."}</div>
          {logs.length > 0 && (
            <div style={{ background: "#0d1117", borderRadius: 6, padding: 8, maxHeight: 150, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }}>
              {logs.map((l, i) => <div key={i} style={{ color: "#8b949e" }}><span style={{ color: "#484f58" }}>{l.time}</span> {l.msg}</div>)}
            </div>
          )}
        </div>
      )}
      {status === "noitems" && <div style={{ background: "#0c1222", borderRadius: 8, padding: 12, fontSize: 13, color: "#60a5fa" }}>No ACB-affecting components (Return of Capital or Non-Cash Distribution) found for {selectedYear}. The values may be zero, or this may be the wrong fund.</div>}
      {status === "error" && (
        <div style={{ background: "#1c1017", borderRadius: 8, padding: 12, fontSize: 13, color: "#f87171", marginBottom: 8 }}>
          {errMsg}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setStatus("idle"); setErrMsg(""); setShowLogs(false); }} style={{ ...S.btnSm("#374151"), fontSize: 12 }}>Try Again</button>
            {mode === "search" && <button onClick={() => { setMode("upload"); setStatus("idle"); setErrMsg(""); setShowLogs(false); }} style={{ ...S.btnSm("#252d3d"), fontSize: 12, border: "1px solid #374151" }}>Upload Instead</button>}
            {logs.length > 0 && <button onClick={() => setShowLogs(v => !v)} style={{ ...S.btnSm("#252d3d"), fontSize: 12, border: "1px solid #374151" }}>{showLogs ? "Hide" : "Show"} Log ({logs.length})</button>}
          </div>
          {showLogs && logs.length > 0 && (
            <div style={{ background: "#0d1117", borderRadius: 6, padding: 8, marginTop: 8, maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {logs.map((l, i) => <div key={i} style={{ color: l.msg.startsWith("ERROR") || l.msg.includes("failed") || l.msg.includes("Error") ? "#f87171" : l.msg.includes("Success") || l.msg.includes("OK") ? "#34d399" : "#8b949e" }}><span style={{ color: "#484f58" }}>{l.time}</span> {l.msg}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Review & Apply */}
      {status === "found" && proposed.length > 0 && (
        <div>
          {result?.fundName && <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>{result.fundName}</div>}
          {result?.symbol && <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>Symbol: {result.symbol}{result.calcMethod === "percent" ? " (converted from %)" : ""}</div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Review Before Applying</div>
          {proposed.map(tx => (
            <div key={tx.id} style={S.txCard}>
              <div style={S.row}>
                <div>
                  <span style={{ color: txColor(tx.type), fontWeight: 600, fontSize: 13 }}>{tx._comp}</span>
                  <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>{tx.type === "ROC" ? "(decreases ACB)" : "(increases ACB)"}</span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 2 }}>{fmt(Number(tx.amount))}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>${tx._perUnit}/unit × {sharesAtYearEnd}</div>
                </div>
                <button onClick={() => setProposed(p => p.filter(t => t.id !== tx.id))} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => { onAdd(proposed); setStatus("applied"); }} style={{ ...S.btn("#059669"), flex: 1 }}>Apply {proposed.length} {proposed.length > 1 ? "Entries" : "Entry"}</button>
            <button onClick={() => { setStatus("idle"); setProposed([]); }} style={{ ...S.btn("#374151"), flex: 0, minWidth: 80 }}>Cancel</button>
          </div>
        </div>
      )}
      {status === "applied" && <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: 12, fontSize: 14, color: "#34d399", textAlign: "center", marginTop: 8 }}>Applied for {selectedYear}</div>}
    </div>
  );
}

// ─── Main App ───
export default function ACBTracker() {
  const [portfolios, setPortfolios] = useState([{ id: uid(), name: "My Portfolio", holdings: {} }]);
  const [activePIdx, setActivePIdx] = useState(0);
  const [activeSym, setActiveSym] = useState(null);
  const [view, setView] = useState("holdings");
  const [showAddTx, setShowAddTx] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [newSym, setNewSym] = useState("");
  const [showAddSym, setShowAddSym] = useState(false);
  const [showPMgr, setShowPMgr] = useState(false);
  const [newPName, setNewPName] = useState("");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  const [showETF, setShowETF] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  _dp = debugMode ? 5 : 2;

  const portfolio = portfolios[activePIdx] || portfolios[0];
  const blankTx = { date: today(), type: "BUY", shares: "", pricePerShare: "", commission: "0", amount: "", note: "" };
  const [txForm, setTxForm] = useState(blankTx);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("acb-portfolios");
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) setPortfolios(p); }
    } catch (e) { console.error("Load error:", e); }
  }, []);

  const save = useCallback((p) => { setPortfolios(p); try { localStorage.setItem("acb-portfolios", JSON.stringify(p)); } catch {} }, []);

  const holdingsSummary = useMemo(() =>
    Object.keys(portfolio.holdings).map(sym => {
      const { totalShares, totalACB, acbPerShare } = computeACB(portfolio.holdings[sym]);
      return { symbol: sym, totalShares, totalACB, acbPerShare, txCount: portfolio.holdings[sym].length };
    }).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [portfolio]);

  const addSymbol = () => { const s = newSym.trim().toUpperCase(); if (!s || portfolio.holdings[s]) return; const u = [...portfolios]; u[activePIdx] = { ...portfolio, holdings: { ...portfolio.holdings, [s]: [] } }; save(u); setNewSym(""); setShowAddSym(false); setActiveSym(s); setView("transactions"); };
  const deleteSym = (s) => { const u = [...portfolios]; const h = { ...portfolio.holdings }; delete h[s]; u[activePIdx] = { ...portfolio, holdings: h }; save(u); if (activeSym === s) { setActiveSym(null); setView("holdings"); } setDelConfirm(null); };
  const saveTx = () => { if (!activeSym) return; const u = [...portfolios]; const txs = [...(portfolio.holdings[activeSym] || [])]; if (editTx) { const i = txs.findIndex(t => t.id === editTx.id); if (i >= 0) txs[i] = { ...txForm, id: editTx.id, _order: editTx._order }; } else txs.push({ ...txForm, id: uid(), _order: txs.length }); u[activePIdx] = { ...portfolio, holdings: { ...portfolio.holdings, [activeSym]: txs } }; save(u); setShowAddTx(false); setEditTx(null); setTxForm(blankTx); };
  const deleteTx = (id) => { const u = [...portfolios]; u[activePIdx] = { ...portfolio, holdings: { ...portfolio.holdings, [activeSym]: portfolio.holdings[activeSym].filter(t => t.id !== id) } }; save(u); };
  const addPortfolio = () => { const n = newPName.trim(); if (!n) return; const u = [...portfolios, { id: uid(), name: n, holdings: {} }]; save(u); setActivePIdx(u.length - 1); setNewPName(""); setShowPMgr(false); setActiveSym(null); setView("holdings"); };
  const deletePortfolio = (i) => { if (portfolios.length <= 1) return; save(portfolios.filter((_, j) => j !== i)); setActivePIdx(Math.max(0, activePIdx - 1)); setActiveSym(null); };
  const addETFTxs = (txs) => { const u = [...portfolios]; const ex = [...(portfolio.holdings[activeSym] || [])]; for (const t of txs) ex.push({ ...t, _order: ex.length }); u[activePIdx] = { ...portfolio, holdings: { ...portfolio.holdings, [activeSym]: ex } }; save(u); setShowETF(false); };

  const handleExport = () => { const c = exportCSV(portfolios); const b = new Blob([c], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `acb_${today()}.csv`; a.click(); URL.revokeObjectURL(u); };
  const handleImport = () => { try { const fn = isACBcaFormat(importText) ? importACBca : importCSV; save(fn(importText, portfolios)); setImportMsg("Imported!"); setImportText(""); setTimeout(() => setImportMsg(""), 3000); } catch (e) { setImportMsg("Error: " + e.message); } };
  const handleFileImport = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setImportText(ev.target.result); r.readAsText(f); };

  const report = useMemo(() => generateCapGainsReport(portfolio.holdings, reportYear), [portfolio, reportYear]);
  const acbData = activeSym && portfolio.holdings[activeSym] ? computeACB(portfolio.holdings[activeSym]) : null;

  const handleExportReport = () => {
    const rows = report.rows.map(r => ({ Description: r.symbol, Date: r.date, "Year Acquired": r.acquisitionYear, "Proceeds of Disposition": r.proceeds?.toFixed(2), "Adjusted Cost Base": r.dispositionACB?.toFixed(2), "Outlays & Expenses": r.outlays?.toFixed(2), "Gain (Loss)": r.gainLoss?.toFixed(2), Note: r.note }));
    rows.push({}); rows.push({ Description: "TOTALS", "Proceeds of Disposition": report.totalProceeds.toFixed(2), "Adjusted Cost Base": report.totalACB.toFixed(2), "Outlays & Expenses": report.totalOutlays.toFixed(2), "Gain (Loss)": report.net.toFixed(2) }); rows.push({ Description: "Total Gains", "Gain (Loss)": report.totalGains.toFixed(2) }); rows.push({ Description: "Total Losses", "Gain (Loss)": report.totalLosses.toFixed(2) }); rows.push({ Description: "Taxable Capital Gains / Losses (50%)", "Gain (Loss)": (report.net * 0.5).toFixed(2) });
    const c = Papa.unparse(rows); const b = new Blob([c], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `schedule3_${portfolio.name.replace(/\s+/g, "_")}_${reportYear}.csv`; a.click(); URL.revokeObjectURL(u);
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.row}>
          <div><div style={S.title}>ACB Tracker <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>v{APP_VERSION}</span></div><div style={S.subtitle}>Cost Base · Capital Gains · ETF Distributions</div></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setDebugMode(d => !d)} style={{ ...S.btnSm(debugMode ? "#b45309" : "#252d3d"), border: `1px solid ${debugMode ? "#d97706" : "#374151"}`, fontSize: 11 }}>DBG</button>
            <button onClick={() => setShowPMgr(true)} style={{ ...S.btnSm("#252d3d"), border: "1px solid #374151" }}>&#9881;</button>
          </div>
        </div>
        {/* Portfolio selector */}
        <div style={{ marginTop: 10 }}>
          <select value={activePIdx} onChange={e => { setActivePIdx(Number(e.target.value)); setActiveSym(null); setView("holdings"); }} style={{ ...S.select, fontSize: 14, padding: "8px 10px" }}>
            {portfolios.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
        </div>
        <div style={S.nav}>
          {[["holdings", "Holdings"], ["report", "CG Report"], ["import", "Import/Export"], ["docs", "Docs"]].map(([k, l]) => (
            <button key={k} onClick={() => { setView(k); if (k !== "transactions") setActiveSym(null); setShowETF(false); }} style={S.navBtn(view === k || (view === "transactions" && k === "holdings"))}>{l}</button>
          ))}
        </div>
      </div>

      <div style={S.body}>

        {/* ─── HOLDINGS ─── */}
        {view === "holdings" && (
          <div>
            <button onClick={() => setShowAddSym(true)} style={S.btn("#3b82f6")}>+ Add Security</button>
            {holdingsSummary.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}><div style={{ fontSize: 36, marginBottom: 8 }}>&#128202;</div><div>No securities yet</div></div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {holdingsSummary.some(h => h.totalShares === 0) && (
                  <button onClick={() => setShowZero(v => !v)} style={{ ...S.btnSm("#252d3d"), border: "1px solid #374151", marginBottom: 10, width: "100%" }}>
                    {showZero ? "Hide" : "Show"} 0-Share Holdings ({holdingsSummary.filter(h => h.totalShares === 0).length})
                  </button>
                )}
                {holdingsSummary.filter(h => showZero || h.totalShares !== 0).map(h => (
                  <div key={h.symbol} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setActiveSym(h.symbol); setView("transactions"); }}>
                    <div style={S.row}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{shortSym(h.symbol)}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{h.txCount} txn{h.txCount !== 1 ? "s" : ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, color: "#9ca3af" }}>{h.totalShares.toLocaleString("en-CA", { maximumFractionDigits: 4 })} shares</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{fmt(h.totalACB)}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{fmt(h.acbPerShare)}/sh</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setDelConfirm(h.symbol); }} style={{ background: "none", border: "none", color: "#4b5563", fontSize: 18, cursor: "pointer", marginLeft: 8 }}>&#10005;</button>
                    </div>
                  </div>
                ))}
                <div style={S.card}>
                  <div style={S.statLabel}>Total Portfolio ACB</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 4 }}>{fmt(holdingsSummary.reduce((s, h) => s + h.totalACB, 0))}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TRANSACTIONS ─── */}
        {view === "transactions" && activeSym && (
          <div>
            <button onClick={() => { setView("holdings"); setActiveSym(null); setShowETF(false); }} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 12 }}>&larr; Holdings</button>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }} title={activeSym}>{shortSym(activeSym, 32)}</div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setShowETF(p => !p)} style={{ ...S.btnSm(showETF ? "#4338ca" : "#4f46e5"), flex: 1 }}>Fetch ETF</button>
              <button onClick={() => { setTxForm(blankTx); setEditTx(null); setShowAddTx(true); }} style={{ ...S.btnSm("#3b82f6"), flex: 1 }}>+ Add Txn</button>
            </div>

            {showETF && <ETFPanel symbol={activeSym} holdings={portfolio.holdings[activeSym] || []} onAdd={addETFTxs} onClose={() => setShowETF(false)} />}

            {/* Stats */}
            {acbData && (
              <div style={S.statRow}>
                <div style={S.stat}><div style={S.statLabel}>Shares</div><div style={{ ...S.statVal, fontSize: 16 }}>{acbData.totalShares.toLocaleString("en-CA", { maximumFractionDigits: 4 })}</div></div>
                <div style={S.stat}><div style={S.statLabel}>ACB</div><div style={{ ...S.statVal, fontSize: 16 }}>{fmt(acbData.totalACB)}</div></div>
                <div style={S.stat}><div style={S.statLabel}>ACB/Sh</div><div style={{ ...S.statVal, fontSize: 16 }}>{fmt(acbData.acbPerShare)}</div></div>
              </div>
            )}

            {/* Transaction list */}
            {acbData && acbData.rows.length > 0 ? (
              <div>
                {[...acbData.rows].reverse().map(r => (
                  <div key={r.id} style={S.txCard}>
                    <div style={S.row}>
                      <div>
                        <span style={{ color: txColor(r.type), fontWeight: 600, fontSize: 13 }}>{txLabel(r.type)}</span>
                        <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>{r.date}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { const ff = v => { if (v == null || v === "" || isNaN(v)) return v; return Number(v).toFixed(6).replace(/0{1,4}$/, ""); }; const f = { ...r, amount: ff(r.amount), pricePerShare: ff(r.pricePerShare), commission: ff(r.commission) }; setTxForm(f); setEditTx(r); setShowAddTx(true); }} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 13, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => deleteTx(r.id)} style={{ background: "none", border: "none", color: "#f87171", fontSize: 13, cursor: "pointer" }}>Del</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6, fontSize: 13 }}>
                      {r.shares != null && <div style={{ color: "#9ca3af" }}>Shares: <span style={{ color: "#fff" }}>{r.shares}</span></div>}
                      <div style={{ color: "#9ca3af" }}>Price: <span style={{ color: "#fff" }}>{fmtPrice(r.pricePerShare)}</span></div>
                      <div style={{ color: "#9ca3af" }}>Amount: <span style={{ color: "#fff" }}>{fmt(r.amount)}</span></div>
                      <div style={{ color: "#9ca3af" }}>Comm: <span style={{ color: "#fff" }}>{fmt(r.commission)}</span></div>
                    </div>
                    <hr style={S.divider} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 12 }}>
                      <div style={{ color: "#6b7280" }}>Sh: <span style={{ color: "#d1d5db" }}>{r.runningShares.toLocaleString("en-CA", { maximumFractionDigits: 4 })}</span></div>
                      <div style={{ color: "#6b7280" }}>ACB: <span style={{ color: "#d1d5db" }}>{fmt(r.runningACB)}</span></div>
                      <div style={{ color: "#6b7280" }}>ACB/s: <span style={{ color: "#d1d5db" }}>{fmtPrice(r.acbPerShare)}</span></div>
                    </div>
                    {r.gainLoss != null && <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: r.gainLoss >= 0 ? "#34d399" : "#f87171" }}>G/L: {fmt(r.gainLoss)}</div>}
                    {r.note && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 32, color: "#6b7280", fontSize: 14 }}>No transactions yet</div>
            )}
          </div>
        )}

        {/* ─── REPORT ─── */}
        {view === "report" && (
          <div>
            <div style={{ ...S.row, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Schedule 3 — Capital Gains</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{portfolio.name}</div>
              </div>
              <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} style={{ ...S.select, width: "auto", padding: "6px 10px", fontSize: 14 }}>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={S.statRow}>
              <div style={S.stat}><div style={S.statLabel}>Gains</div><div style={{ ...S.statVal, fontSize: 16, color: "#34d399" }}>{fmt(report.totalGains)}</div></div>
              <div style={S.stat}><div style={S.statLabel}>Losses</div><div style={{ ...S.statVal, fontSize: 16, color: "#f87171" }}>{fmt(report.totalLosses)}</div></div>
              <div style={S.stat}><div style={S.statLabel}>Net</div><div style={{ ...S.statVal, fontSize: 16, color: report.net >= 0 ? "#34d399" : "#f87171" }}>{fmt(report.net)}</div></div>
            </div>
            {report.rows.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button onClick={handleExportReport} style={{ ...S.btn("#059669"), flex: 1 }}>Export CSV</button>
                <button onClick={() => exportSchedule3PDF(report, portfolio.name, reportYear)} style={{ ...S.btn("#7c3aed"), flex: 1 }}>Export PDF</button>
              </div>
            )}
            {report.rows.length > 0 ? (
              <div>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1fr 1.5fr", gap: 4, padding: "8px 12px", background: "#252d3d", borderRadius: "10px 10px 0 0", fontSize: 10, fontWeight: 600, color: "#9ca3af" }}>
                  <div>Description</div><div style={{ textAlign: "center" }}>Yr Acq</div><div style={{ textAlign: "right" }}>Proceeds</div><div style={{ textAlign: "right" }}>ACB</div><div style={{ textAlign: "right" }}>Expenses</div><div style={{ textAlign: "right" }}>Gain/Loss</div>
                </div>
                {report.rows.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1fr 1.5fr", gap: 4, padding: "8px 12px", background: i % 2 === 0 ? "#141820" : "#1a1f2e", borderBottom: "1px solid #2d3548", fontSize: 12 }}>
                    <div style={{ color: "#fff", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.symbol}>{shortSym(r.symbol, 18)}</div>
                    {r.type === "STOCK_SPLIT" ? (
                      <div style={{ gridColumn: "2 / 7", color: "#fbbf24", fontStyle: "italic" }}>{r.note || "Stock Split"}</div>
                    ) : (<>
                      <div style={{ textAlign: "center", color: "#9ca3af" }}>{r.acquisitionYear}</div>
                      <div style={{ textAlign: "right", color: "#d1d5db" }}>{fmt(r.proceeds)}</div>
                      <div style={{ textAlign: "right", color: "#d1d5db" }}>{fmt(r.dispositionACB)}</div>
                      <div style={{ textAlign: "right", color: "#d1d5db" }}>{fmt(r.outlays)}</div>
                      <div style={{ textAlign: "right", fontWeight: 600, color: r.gainLoss >= 0 ? "#34d399" : "#f87171" }}>{fmt(r.gainLoss)}</div>
                    </>)}
                  </div>
                ))}
                {/* Totals row */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1fr 1.5fr", gap: 4, padding: "8px 12px", background: "#252d3d", borderRadius: "0 0 10px 10px", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                  <div>Totals</div><div /><div style={{ textAlign: "right" }}>{fmt(report.totalProceeds)}</div><div style={{ textAlign: "right" }}>{fmt(report.totalACB)}</div><div style={{ textAlign: "right" }}>{fmt(report.totalOutlays)}</div><div style={{ textAlign: "right", color: report.net >= 0 ? "#34d399" : "#f87171" }}>{fmt(report.net)}</div>
                </div>
                <div style={{ ...S.card, marginTop: 12, fontSize: 13 }}>
                  <div style={{ color: "#9ca3af" }}>Taxable Capital Gains / Losses (50% inclusion)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: report.net >= 0 ? "#34d399" : "#f87171", marginTop: 4 }}>{fmt(report.net * 0.5)}</div>
                </div>
              </div>
            ) : <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>No dispositions for {reportYear}</div>}
          </div>
        )}

        {/* ─── IMPORT/EXPORT ─── */}
        {view === "import" && (
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Export All</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>Download CSV. Save to iCloud Drive for backup.</div>
              <button onClick={handleExport} style={S.btn("#059669")}>Download CSV</button>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Import CSV</div>
              <label style={{ ...S.btn("#3b82f6"), display: "block", textAlign: "center", boxSizing: "border-box", marginBottom: 10 }}>
                Choose File<input type="file" accept=".csv,.txt" onChange={handleFileImport} style={{ display: "none" }} />
              </label>
              <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4} style={{ ...S.input, fontFamily: "monospace", fontSize: 13 }} placeholder="Or paste CSV here..." />
              <button onClick={handleImport} disabled={!importText.trim()} style={{ ...S.btn("#3b82f6"), marginTop: 10, opacity: importText.trim() ? 1 : 0.4 }}>Import</button>
              {importMsg && <div style={{ marginTop: 8, fontSize: 13, color: importMsg.includes("Imported") ? "#34d399" : "#f87171" }}>{importMsg}</div>}
            </div>
          </div>
        )}

        {/* ─── DOCS ─── */}
        {view === "docs" && (
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>CSV Format</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                Columns: <code style={{ color: "#60a5fa" }}>portfolio, symbol, date, type, shares, pricePerShare, commission, amount, note</code>
                <br /><br />
                Types: BUY, SELL, ROC, REINVESTED_DIST, CAPITAL_GAINS_DIST, REINVESTED_CAP_GAINS, STOCK_SPLIT, SUPERFICIAL_LOSS, ACB_ADJUSTMENT
                <br /><br />
                Dates: YYYY-MM-DD format
              </div>
              <pre style={{ background: "#0f1219", borderRadius: 8, padding: 10, marginTop: 10, fontSize: 11, color: "#d1d5db", overflow: "auto", whiteSpace: "pre-wrap" }}>{`portfolio,symbol,date,type,shares,pricePerShare,commission,amount,note
My Portfolio,VFV.TO,2024-01-15,BUY,100,95.50,9.99,,
My Portfolio,VFV.TO,2024-12-31,ROC,,,,125.00,Annual ROC`}</pre>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Transaction Types</div>
              {TX_TYPES.map(t => (
                <div key={t.value} style={{ marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: t.color, fontWeight: 600 }}>{t.label}</span>
                  <span style={{ color: "#9ca3af" }}> — {
                    t.value === "BUY" ? "ACB += shares × price + commission" :
                    t.value === "SELL" ? "Gain/Loss = proceeds − proportional ACB" :
                    t.value === "ROC" ? "Reduces ACB. Excess → capital gain" :
                    t.value === "REINVESTED_DIST" ? "DRIP: adds shares + ACB" :
                    t.value === "CAPITAL_GAINS_DIST" ? "Cash capital gains distribution — no ACB impact" :
                    t.value === "REINVESTED_CAP_GAINS" ? "Reinvested (non-cash) capital gains — increases ACB" :
                    t.value === "STOCK_SPLIT" ? "Multiplies shares, ACB/sh adjusts" :
                    t.value === "SUPERFICIAL_LOSS" ? "Denied loss added back to ACB" :
                    "Generic +/- ACB adjustment"
                  }</span>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>ETF Distributions (CDS Tax Breakdown)</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7 }}>
                Data source: <b style={{ color: "#60a5fa" }}>CDS Innovations Inc.</b> Tax Breakdown Service (<a href="https://services.cds.ca/applications/taxforms/taxforms.nsf/Pages/-EN-LimitedPartnershipsandIncomeTrusts?Open" target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8" }}>services.cds.ca</a>). This service consolidates tax breakdown data for all Canadian ETFs, REITs, and exchange-traded trusts as mandated by the Income Tax Act.
                <br /><br />
                <b style={{ color: "#e5e7eb" }}>Two key fields from CDS spreadsheets:</b><br />
                &bull; <b style={{ color: "#22d3ee" }}>Total Non-Cash Distribution</b> ($/unit) — reinvested/phantom capital gains, increases ACB<br />
                &bull; <b style={{ color: "#f472b6" }}>Return of Capital</b> ($/unit) — decreases ACB
                <br /><br />
                <b style={{ color: "#e5e7eb" }}>CDS Search (recommended):</b><br />
                1. In the app: security &rarr; <b style={{ color: "#818cf8" }}>Fetch ETF</b> &rarr; CDS Search<br />
                2. Click "Fetch Fund List" — the app downloads the full T3 index from CDS<br />
                3. Search for your ETF by fund name or CUSIP<br />
                4. Select the fund — the Excel file is downloaded and parsed automatically<br />
                5. Review &rarr; Apply
                <br /><br />
                <b style={{ color: "#e5e7eb" }}>Upload CDS File:</b> if auto-fetch is blocked, download the Excel file from the CDS site manually and upload it in the app.
                <br /><br />
                <b style={{ color: "#e5e7eb" }}>Manual entry:</b> read the per-unit values from the CDS spreadsheet and enter them using the Manual tab.
                <br /><br />
                <b style={{ color: "#e5e7eb" }}>BMO ETFs:</b> BMO reports distributions as percentages rather than dollar amounts. When uploading a BMO CDS file, the app automatically converts percentages to per-unit dollar amounts.
                <br /><br />
                <i>Note: DRIPs (reinvested distributions) are tracked separately as REINVESTED_DIST. Regular capital gains distributions (CAPITAL_GAINS_DIST) do not affect ACB. Only reinvested/non-cash capital gains (REINVESTED_CAP_GAINS) increase ACB.</i>
              </div>
              <div style={{ background: "#1c1917", border: "1px solid #854d0e", borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12, color: "#fbbf24" }}>Always verify against your T3/T5 slips. CDS data is typically available before end of February.</div>
            </div>
          </div>
        )}
      </div>

      {/* ─── BOTTOM SHEET MODALS ─── */}
      <Sheet open={showAddSym} onClose={() => setShowAddSym(false)} title="Add Security">
        <label style={S.label}>Ticker Symbol</label>
        <input type="text" value={newSym} onChange={e => setNewSym(e.target.value.toUpperCase())} placeholder="e.g. VFV.TO" style={{ ...S.input, marginBottom: 12 }} autoFocus onKeyDown={e => { if (e.key === "Enter") addSymbol(); }} />
        <button onClick={addSymbol} style={S.btn("#3b82f6")}>Add</button>
      </Sheet>

      <Sheet open={showAddTx} onClose={() => { setShowAddTx(false); setEditTx(null); setTxForm(blankTx); }} title={editTx ? "Edit Transaction" : "Add Transaction"}>
        <TxForm tx={txForm} onChange={setTxForm} onSave={saveTx} onCancel={() => { setShowAddTx(false); setEditTx(null); setTxForm(blankTx); }} isEdit={!!editTx} />
      </Sheet>

      <Sheet open={showPMgr} onClose={() => setShowPMgr(false)} title="Portfolios">
        {portfolios.map((p, i) => (
          <div key={p.id} style={{ ...S.row, ...S.card }}>
            <div><div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{Object.keys(p.holdings).length} securities</div></div>
            {portfolios.length > 1 && <button onClick={() => deletePortfolio(i)} style={{ background: "none", border: "none", color: "#f87171", fontSize: 13, cursor: "pointer" }}>Delete</button>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="text" value={newPName} onChange={e => setNewPName(e.target.value)} placeholder="New portfolio" style={{ ...S.input, flex: 1 }} onKeyDown={e => { if (e.key === "Enter") addPortfolio(); }} />
          <button onClick={addPortfolio} style={S.btnSm("#3b82f6")}>Add</button>
        </div>
      </Sheet>

      <Sheet open={!!delConfirm} onClose={() => setDelConfirm(null)} title="Delete Security?">
        <div style={{ fontSize: 14, color: "#d1d5db", marginBottom: 16 }}>Delete <b>{delConfirm}</b> and all transactions?</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => deleteSym(delConfirm)} style={{ ...S.btn("#dc2626"), flex: 1 }}>Delete</button>
          <button onClick={() => setDelConfirm(null)} style={{ ...S.btn("#374151"), flex: 1 }}>Cancel</button>
        </div>
      </Sheet>
    </div>
  );
}
