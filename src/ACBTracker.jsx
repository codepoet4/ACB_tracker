import { useState, useEffect, useCallback, useMemo } from "react";
import * as Papa from "papaparse";

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => (n == null || isNaN(n)) ? "$0.00" : `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const TX_TYPES = [
  { value: "BUY", label: "Buy", color: "#34d399" },
  { value: "SELL", label: "Sell", color: "#f87171" },
  { value: "ROC", label: "Return of Capital", color: "#fbbf24" },
  { value: "REINVESTED_DIST", label: "Reinvested Dist.", color: "#60a5fa" },
  { value: "CAPITAL_GAINS_DIST", label: "Cap. Gains Dist.", color: "#2dd4bf" },
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
    let gainLoss = null, note = "";
    switch (tx.type) {
      case "BUY": totalACB += qty * price + commission; shares += qty; break;
      case "SELL": if (shares > 0) { const aps = totalACB / shares; gainLoss = (qty * price - commission) - aps * qty; totalACB -= aps * qty; shares -= qty; } break;
      case "ROC": totalACB -= amount; if (totalACB < 0) { gainLoss = -totalACB; note = "Excess ROC → gain"; totalACB = 0; } break;
      case "REINVESTED_DIST": totalACB += qty * price + commission; shares += qty; note = "DRIP"; break;
      case "CAPITAL_GAINS_DIST": totalACB += amount; note = "Cap gains → ACB"; break;
      case "STOCK_SPLIT": shares *= (qty || 2); note = `Split ${qty || 2}:1`; break;
      case "SUPERFICIAL_LOSS": totalACB += amount; note = "Denied loss → ACB"; break;
      case "ACB_ADJUSTMENT": totalACB += amount; if (totalACB < 0) { gainLoss = -totalACB; totalACB = 0; } break;
    }
    rows.push({ ...tx, runningShares: shares, runningACB: totalACB, acbPerShare: shares > 0 ? totalACB / shares : 0, gainLoss, note: tx.note || note });
  }
  return { rows, totalShares: shares, totalACB, acbPerShare: shares > 0 ? totalACB / shares : 0 };
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
function generateCapGainsReport(portfolios, year) {
  const allRows = [];
  for (const p of portfolios) for (const sym of Object.keys(p.holdings)) {
    const { rows } = computeACB(p.holdings[sym]);
    for (const r of rows) if (r.gainLoss != null && r.date.startsWith(String(year)))
      allRows.push({ portfolio: p.name, symbol: sym, date: r.date, type: r.type, gainLoss: r.gainLoss, shares: r.shares, price: r.pricePerShare, note: r.note });
  }
  const g = allRows.filter(r => r.gainLoss > 0).reduce((s, r) => s + r.gainLoss, 0);
  const l = allRows.filter(r => r.gainLoss < 0).reduce((s, r) => s + r.gainLoss, 0);
  return { rows: allRows, totalGains: g, totalLosses: l, net: g + l };
}

async function fetchETFDistributions(symbol, year) {
  const prompt = `Search for the ${year} annual tax distribution breakdown for the Canadian ETF "${symbol}". I need per-unit amounts for Return of Capital, Capital Gains, reinvested/phantom capital gains, and other ACB-affecting components. Look for official T3 data from the ETF provider. Respond ONLY with valid JSON: {"found":true/false,"etfName":"","provider":"","year":${year},"recordDate":"YYYY-MM-DD","perUnit":{"returnOfCapital":0,"capitalGains":0,"reinvestedCapitalGains":0},"sourceNotes":"","confidence":"high/medium/low"} If not found, set found to false. Do not fabricate data.`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, tools: [{ type: "web_search_20250305", name: "web_search" }], messages: [{ role: "user", content: prompt }] })
  });
  const data = await resp.json();
  const text = data.content?.map(i => i.text || "").filter(Boolean).join("\n") || "";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return { found: false, sourceNotes: "Parse error: " + text.slice(0, 300) }; }
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
  const needsShares = ["BUY","SELL","REINVESTED_DIST","STOCK_SPLIT"].includes(tx.type);
  const needsPrice = ["BUY","SELL","REINVESTED_DIST"].includes(tx.type);
  const needsAmount = ["ROC","SUPERFICIAL_LOSS","ACB_ADJUSTMENT","CAPITAL_GAINS_DIST"].includes(tx.type);
  const needsComm = ["BUY","SELL","REINVESTED_DIST"].includes(tx.type);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><label style={S.label}>Date</label><input type="date" value={tx.date} onChange={e => onChange({ ...tx, date: e.target.value })} style={S.input} /></div>
        <div><label style={S.label}>Type</label><select value={tx.type} onChange={e => onChange({ ...tx, type: e.target.value })} style={S.select}>{TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {needsShares && <div><label style={S.label}>{tx.type === "STOCK_SPLIT" ? "Multiplier" : "Shares"}</label><input type="number" inputMode="decimal" step="any" value={tx.shares} onChange={e => onChange({ ...tx, shares: e.target.value })} style={S.input} placeholder="0" /></div>}
        {needsPrice && <div><label style={S.label}>Price/Share</label><input type="number" inputMode="decimal" step="any" value={tx.pricePerShare} onChange={e => onChange({ ...tx, pricePerShare: e.target.value })} style={S.input} placeholder="0.00" /></div>}
        {needsAmount && <div><label style={S.label}>Amount ($)</label><input type="number" inputMode="decimal" step="any" value={tx.amount} onChange={e => onChange({ ...tx, amount: e.target.value })} style={S.input} placeholder="0.00" /></div>}
        {needsComm && <div><label style={S.label}>Commission</label><input type="number" inputMode="decimal" step="any" value={tx.commission} onChange={e => onChange({ ...tx, commission: e.target.value })} style={S.input} placeholder="0.00" /></div>}
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

// ─── ETF Fetch Panel ───
function ETFPanel({ symbol, holdings, onAdd, onClose }) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [proposed, setProposed] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);
  const [errMsg, setErrMsg] = useState("");

  const appliedYears = useMemo(() => {
    const s = {};
    for (const tx of holdings) { const m = (tx.note || "").match(/\[Auto-fetched (\d{4})\]/); if (m) s[m[1]] = true; }
    return s;
  }, [holdings]);

  const sharesAtYearEnd = useMemo(() => {
    const txs = holdings.filter(tx => tx.date <= `${selectedYear}-12-31`);
    return computeACB(txs).totalShares;
  }, [holdings, selectedYear]);

  const doFetch = async () => {
    if (appliedYears[String(selectedYear)]) return;
    setStatus("loading"); setResult(null); setProposed([]); setErrMsg("");
    try {
      const r = await fetchETFDistributions(symbol, selectedYear);
      if (r.found) {
        setResult(r);
        const txs = [], d = r.recordDate || `${selectedYear}-12-31`, pu = r.perUnit || {};
        if (pu.returnOfCapital > 0) txs.push({ id: uid(), date: d, type: "ROC", shares: "", pricePerShare: "", commission: "0", amount: (pu.returnOfCapital * sharesAtYearEnd).toFixed(2), note: `[Auto-fetched ${selectedYear}] ROC $${pu.returnOfCapital}/u × ${sharesAtYearEnd}`, _perUnit: pu.returnOfCapital, _comp: "ROC" });
        if (pu.reinvestedCapitalGains > 0) txs.push({ id: uid(), date: d, type: "CAPITAL_GAINS_DIST", shares: "", pricePerShare: "", commission: "0", amount: (pu.reinvestedCapitalGains * sharesAtYearEnd).toFixed(2), note: `[Auto-fetched ${selectedYear}] Reinv. cap gains $${pu.reinvestedCapitalGains}/u × ${sharesAtYearEnd}`, _perUnit: pu.reinvestedCapitalGains, _comp: "Reinv. Cap Gains" });
        if (pu.capitalGains > 0) txs.push({ id: uid(), date: d, type: "CAPITAL_GAINS_DIST", shares: "", pricePerShare: "", commission: "0", amount: (pu.capitalGains * sharesAtYearEnd).toFixed(2), note: `[Auto-fetched ${selectedYear}] Cap gains $${pu.capitalGains}/u × ${sharesAtYearEnd}`, _perUnit: pu.capitalGains, _comp: "Cap Gains" });
        setProposed(txs);
        setStatus(txs.length > 0 ? "found" : "noitems");
      } else { setResult(r); setStatus("notfound"); }
    } catch (e) { setErrMsg(e.message); setStatus("error"); }
  };

  return (
    <div style={{ ...S.card, borderColor: "#312e81" }}>
      <div style={{ ...S.row, marginBottom: 8 }}><span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Fetch ETF Data — {symbol}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}>×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div><label style={S.label}>Tax Year</label><select value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setStatus("idle"); }} style={S.select}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 1 - i).map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><label style={S.label}>Shares at Year-End</label><div style={{ ...S.input, background: "#1a1f2e" }}>{sharesAtYearEnd.toLocaleString("en-CA", { maximumFractionDigits: 4 })}</div></div>
      </div>
      {appliedYears[String(selectedYear)] && <div style={{ background: "#1c1917", border: "1px solid #854d0e", borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13, color: "#fbbf24" }}>Already applied for {selectedYear}.</div>}
      {sharesAtYearEnd <= 0 && <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 10 }}>No shares held at end of {selectedYear}.</div>}
      {status === "idle" && <button onClick={doFetch} disabled={sharesAtYearEnd <= 0 || appliedYears[String(selectedYear)]} style={{ ...S.btn("#4f46e5"), opacity: sharesAtYearEnd <= 0 || appliedYears[String(selectedYear)] ? 0.4 : 1 }}>Fetch Distribution Data</button>}
      {status === "loading" && <div style={{ textAlign: "center", padding: 20, color: "#818cf8", fontSize: 14 }}>Searching for {symbol} {selectedYear} data...</div>}
      {status === "notfound" && <div style={{ background: "#1c1917", borderRadius: 8, padding: 12, fontSize: 13, color: "#fbbf24" }}>Not found. {result?.sourceNotes}</div>}
      {status === "noitems" && <div style={{ background: "#0c1222", borderRadius: 8, padding: 12, fontSize: 13, color: "#60a5fa" }}>No ACB-affecting components found for {selectedYear}.</div>}
      {status === "error" && <div style={{ background: "#1c1017", borderRadius: 8, padding: 12, fontSize: 13, color: "#f87171" }}>Error: {errMsg}</div>}
      {status === "found" && proposed.length > 0 && (
        <div>
          {result && <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>{result.etfName} · {result.provider} · Confidence: <span style={{ color: result.confidence === "high" ? "#34d399" : "#fbbf24" }}>{result.confidence}</span></div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Review Before Applying</div>
          {proposed.map(tx => (
            <div key={tx.id} style={S.txCard}>
              <div style={S.row}>
                <div><span style={{ color: txColor(tx.type), fontWeight: 600, fontSize: 13 }}>{tx._comp}</span><div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 2 }}>{fmt(Number(tx.amount))}</div><div style={{ fontSize: 11, color: "#6b7280" }}>${tx._perUnit}/unit × {sharesAtYearEnd}</div></div>
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

  const portfolio = portfolios[activePIdx] || portfolios[0];
  const blankTx = { date: today(), type: "BUY", shares: "", pricePerShare: "", commission: "0", amount: "", note: "" };
  const [txForm, setTxForm] = useState(blankTx);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("acb-portfolios");
        if (r && r.value) { const p = JSON.parse(r.value); if (Array.isArray(p) && p.length > 0) setPortfolios(p); }
      } catch (e) { console.error("Load error:", e); }
    })();
  }, []);

  const save = useCallback((p) => { setPortfolios(p); window.storage.set("acb-portfolios", JSON.stringify(p)).catch(() => {}); }, []);

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
  const handleImport = () => { try { save(importCSV(importText, portfolios)); setImportMsg("Imported!"); setImportText(""); setTimeout(() => setImportMsg(""), 3000); } catch (e) { setImportMsg("Error: " + e.message); } };
  const handleFileImport = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setImportText(ev.target.result); r.readAsText(f); };

  const report = useMemo(() => generateCapGainsReport(portfolios, reportYear), [portfolios, reportYear]);
  const acbData = activeSym && portfolio.holdings[activeSym] ? computeACB(portfolio.holdings[activeSym]) : null;

  const handleExportReport = () => {
    const rows = report.rows.map(r => ({ portfolio: r.portfolio, symbol: r.symbol, date: r.date, type: r.type, shares: r.shares, price: r.price, gainLoss: r.gainLoss?.toFixed(2), note: r.note }));
    rows.push({}); rows.push({ portfolio: "SUMMARY", type: "Total Gains", gainLoss: report.totalGains.toFixed(2) }); rows.push({ type: "Total Losses", gainLoss: report.totalLosses.toFixed(2) }); rows.push({ type: "Net", gainLoss: report.net.toFixed(2) });
    const c = Papa.unparse(rows); const b = new Blob([c], { type: "text/csv" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `capgains_${reportYear}.csv`; a.click(); URL.revokeObjectURL(u);
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.row}>
          <div><div style={S.title}>ACB Tracker</div><div style={S.subtitle}>Cost Base · Capital Gains · ETF Distributions</div></div>
          <button onClick={() => setShowPMgr(true)} style={{ ...S.btnSm("#252d3d"), border: "1px solid #374151" }}>&#9881;</button>
        </div>
        {/* Portfolio selector */}
        <div style={{ marginTop: 10 }}>
          <select value={activePIdx} onChange={e => { setActivePIdx(Number(e.target.value)); setActiveSym(null); setView("holdings"); }} style={{ ...S.select, fontSize: 14, padding: "8px 10px" }}>
            {portfolios.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
        </div>
        <div style={S.nav}>
          {[["holdings", "Holdings"], ["report", "Report"], ["import", "Import/Export"], ["docs", "Docs"]].map(([k, l]) => (
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
                {holdingsSummary.map(h => (
                  <div key={h.symbol} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setActiveSym(h.symbol); setView("transactions"); }}>
                    <div style={S.row}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{h.symbol}</div>
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
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>{activeSym}</div>

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
                        <button onClick={() => { setTxForm(r); setEditTx(r); setShowAddTx(true); }} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 13, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => deleteTx(r.id)} style={{ background: "none", border: "none", color: "#f87171", fontSize: 13, cursor: "pointer" }}>Del</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6, fontSize: 13 }}>
                      {r.shares && <div style={{ color: "#9ca3af" }}>Shares: <span style={{ color: "#fff" }}>{r.shares}</span></div>}
                      {Number(r.pricePerShare) > 0 && <div style={{ color: "#9ca3af" }}>Price: <span style={{ color: "#fff" }}>{fmt(r.pricePerShare)}</span></div>}
                      {Number(r.amount) > 0 && <div style={{ color: "#9ca3af" }}>Amount: <span style={{ color: "#fff" }}>{fmt(r.amount)}</span></div>}
                      {Number(r.commission) > 0 && <div style={{ color: "#9ca3af" }}>Comm: <span style={{ color: "#fff" }}>{fmt(r.commission)}</span></div>}
                    </div>
                    <hr style={S.divider} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 12 }}>
                      <div style={{ color: "#6b7280" }}>Sh: <span style={{ color: "#d1d5db" }}>{r.runningShares.toLocaleString("en-CA", { maximumFractionDigits: 4 })}</span></div>
                      <div style={{ color: "#6b7280" }}>ACB: <span style={{ color: "#d1d5db" }}>{fmt(r.runningACB)}</span></div>
                      <div style={{ color: "#6b7280" }}>ACB/s: <span style={{ color: "#d1d5db" }}>{fmt(r.acbPerShare)}</span></div>
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
            <div style={{ ...S.row, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Capital Gains Report</div>
              <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} style={{ ...S.select, width: "auto", padding: "6px 10px", fontSize: 14 }}>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={S.statRow}>
              <div style={S.stat}><div style={S.statLabel}>Gains</div><div style={{ ...S.statVal, fontSize: 16, color: "#34d399" }}>{fmt(report.totalGains)}</div></div>
              <div style={S.stat}><div style={S.statLabel}>Losses</div><div style={{ ...S.statVal, fontSize: 16, color: "#f87171" }}>{fmt(report.totalLosses)}</div></div>
              <div style={S.stat}><div style={S.statLabel}>Net</div><div style={{ ...S.statVal, fontSize: 16, color: report.net >= 0 ? "#34d399" : "#f87171" }}>{fmt(report.net)}</div></div>
            </div>
            {report.rows.length > 0 && <button onClick={handleExportReport} style={{ ...S.btn("#059669"), marginBottom: 12 }}>Export Report CSV</button>}
            {report.rows.length > 0 ? report.rows.map((r, i) => (
              <div key={i} style={S.txCard}>
                <div style={S.row}>
                  <div><span style={{ color: "#fff", fontWeight: 600 }}>{r.symbol}</span><span style={{ color: "#6b7280", fontSize: 12, marginLeft: 6 }}>{r.portfolio}</span></div>
                  <span style={{ color: r.gainLoss >= 0 ? "#34d399" : "#f87171", fontWeight: 700, fontSize: 15 }}>{fmt(r.gainLoss)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{r.date} · {txLabel(r.type)}{r.note ? ` · ${r.note}` : ""}</div>
              </div>
            )) : <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>No gains/losses for {reportYear}</div>}
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
              <label style={{ ...S.btn("#3b82f6"), display: "block", textAlign: "center", marginBottom: 10 }}>
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
                Types: BUY, SELL, ROC, REINVESTED_DIST, CAPITAL_GAINS_DIST, STOCK_SPLIT, SUPERFICIAL_LOSS, ACB_ADJUSTMENT
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
                    t.value === "CAPITAL_GAINS_DIST" ? "Phantom/reinvested gains increase ACB" :
                    t.value === "STOCK_SPLIT" ? "Multiplies shares, ACB/sh adjusts" :
                    t.value === "SUPERFICIAL_LOSS" ? "Denied loss added back to ACB" :
                    "Generic +/- ACB adjustment"
                  }</span>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Auto-Fetch ETF Data</div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7 }}>
                1. Go to any security &rarr; tap <b style={{ color: "#818cf8" }}>Fetch ETF</b><br />
                2. Select tax year<br />
                3. Tap <b style={{ color: "#818cf8" }}>Fetch Distribution Data</b><br />
                4. Review proposed ROC / cap gains entries<br />
                5. Tap <b style={{ color: "#34d399" }}>Apply</b><br />
                Each year fetched only once per security.
              </div>
              <div style={{ background: "#1c1917", border: "1px solid #854d0e", borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12, color: "#fbbf24" }}>Always verify against your T3/T5 slips.</div>
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
