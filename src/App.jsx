import { useState, useCallback, useEffect } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const STRATEGIES = {
  ma_cross: { name: "MA 黃金交叉", description: "MA5 上穿 MA20 買進，下穿賣出", params: { shortPeriod: 5, longPeriod: 20 } },
  rsi_oversold: { name: "RSI 超賣反彈", description: "RSI < 30 買進，RSI > 70 賣出", params: { period: 14, oversold: 30, overbought: 70 } },
  kd_cross: { name: "KD 黃金交叉", description: "K 上穿 D 且 KD < 50 買進，K 下穿 D 且 KD > 50 賣出", params: { period: 9 } },
  custom: { name: "自訂策略", description: "自行設定多個指標組合條件", params: {} },
};

function calcMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.close, 0) / period;
  });
}

function calcRSI(data, period = 14) {
  const rsi = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) { rsi.push(null); continue; }
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j].close - data[j - 1].close;
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const ag = gains / period, al = losses / period;
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return rsi;
}

function calcKD(data, period = 9) {
  const k = [], d = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { k.push(null); d.push(null); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    const hh = Math.max(...slice.map(s => s.high));
    const ll = Math.min(...slice.map(s => s.low));
    const rsv = hh === ll ? 50 : (data[i].close - ll) / (hh - ll) * 100;
    const kv = i === period - 1 ? rsv : k[i - 1] * 2 / 3 + rsv / 3;
    const dv = i === period - 1 ? kv : d[i - 1] * 2 / 3 + kv / 3;
    k.push(kv); d.push(dv);
  }
  return { k, d };
}

function calcMaxDrawdown(equity, initial) {
  let peak = initial, maxDD = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = (peak - e.value) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD.toFixed(2);
}

function runBacktest(data, strategy, params, initialCapital = 1000000) {
  const ma5 = calcMA(data, 5);
  const ma20 = calcMA(data, 20);
  const rsi = calcRSI(data, 14);
  const { k, d } = calcKD(data, 9);
  let capital = initialCapital, shares = 0, inPosition = false, buyPrice = 0;
  const trades = [], equity = [];

  for (let i = 1; i < data.length; i++) {
    const price = data[i].close;
    let buySignal = false, sellSignal = false;

    if (strategy === "ma_cross") {
      if (ma5[i] && ma20[i] && ma5[i-1] && ma20[i-1]) {
        buySignal = ma5[i] > ma20[i] && ma5[i-1] <= ma20[i-1];
        sellSignal = ma5[i] < ma20[i] && ma5[i-1] >= ma20[i-1];
      }
    } else if (strategy === "rsi_oversold") {
      if (rsi[i] !== null && rsi[i-1] !== null) {
        buySignal = rsi[i-1] < (params.oversold||30) && rsi[i] >= (params.oversold||30);
        sellSignal = rsi[i] > (params.overbought||70);
      }
    } else if (strategy === "kd_cross") {
      if (k[i] !== null && d[i] !== null && k[i-1] !== null && d[i-1] !== null) {
        buySignal = k[i] > d[i] && k[i-1] <= d[i-1] && k[i] < 50;
        sellSignal = k[i] < d[i] && k[i-1] >= d[i-1] && k[i] > 50;
      }
    } else if (strategy === "custom") {
      const conds = [];
      if (params.useMA && ma5[i] && ma20[i]) conds.push(ma5[i] > ma20[i]);
      if (params.useRSI && rsi[i] !== null) conds.push(rsi[i] > 40 && rsi[i] < 65);
      if (params.useKD && k[i] !== null) conds.push(k[i] > d[i]);
      buySignal = conds.length > 0 && conds.every(Boolean) && !inPosition;
      const sc = [];
      if (params.useMA && ma5[i] && ma20[i]) sc.push(ma5[i] < ma20[i]);
      if (params.useRSI && rsi[i] !== null) sc.push(rsi[i] > 70);
      sellSignal = sc.some(Boolean);
    }

    if (buySignal && !inPosition && capital > price * 1000) {
      shares = Math.floor(capital / (price * 1000)) * 1000;
      capital -= shares * price;
      buyPrice = price;
      inPosition = true;
      trades.push({ type: "buy", date: data[i].date, price, shares });
    } else if (sellSignal && inPosition) {
      capital += shares * price;
      const profit = (price - buyPrice) * shares;
      trades.push({ type: "sell", date: data[i].date, price, shares, profit, profitPct: ((price - buyPrice) / buyPrice * 100).toFixed(2) });
      shares = 0; inPosition = false;
    }
    equity.push({ date: data[i].date, value: capital + shares * price });
  }

  if (inPosition) {
    const lp = data[data.length - 1].close;
    capital += shares * lp;
    trades.push({ type: "sell", date: data[data.length-1].date, price: lp, shares, profit: (lp - buyPrice) * shares, profitPct: ((lp - buyPrice) / buyPrice * 100).toFixed(2) });
  }

  const sells = trades.filter(t => t.type === "sell");
  return {
    trades, equity,
    totalReturn: ((capital - initialCapital) / initialCapital * 100).toFixed(2),
    winRate: sells.length > 0 ? (sells.filter(t => t.profit > 0).length / sells.length * 100).toFixed(1) : 0,
    maxDrawdown: calcMaxDrawdown(equity, initialCapital),
    finalCapital: capital,
    sellTrades: sells,
  };
}

async function fetchMergedData(code, startDate, endDate, token) {
  const TWSE_CUTOFF = "2025-04-01";
  let finmindData = [];
  let twseData = [];

  if (startDate < TWSE_CUTOFF) {
    const finmindEnd = endDate < TWSE_CUTOFF ? endDate : TWSE_CUTOFF;
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startDate}&end_date=${finmindEnd}&token=${token}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      finmindData = json.data.map(d => ({
        date: d.date,
        open: parseFloat(d.open),
        high: parseFloat(d.max),
        low: parseFloat(d.min),
        close: parseFloat(d.close),
        volume: parseFloat(d.Trading_Volume),
      }));
    }
  }

  if (endDate >= TWSE_CUTOFF) {
    try {
      const twseStart = startDate > TWSE_CUTOFF ? startDate : TWSE_CUTOFF;
      const startYear = parseInt(twseStart.split("-")[0]);
      const startMonth = parseInt(twseStart.split("-")[1]);
      const endYear = parseInt(endDate.split("-")[0]);
      const endMonth = parseInt(endDate.split("-")[1]);

      for (let y = startYear; y <= endYear; y++) {
        const mStart = y === startYear ? startMonth : 1;
        const mEnd = y === endYear ? endMonth : 12;
        for (let m = mStart; m <= mEnd; m++) {
          const yyyymmdd = `${y}${String(m).padStart(2, "0")}01`;
          const twseUrl = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${yyyymmdd}&stockNo=${code}&response=json`;
          const twseRes = await fetch(twseUrl);
          const twseJson = await twseRes.json();
          if (twseJson.data) {
            for (const row of twseJson.data) {
              const dateParts = row[0].split("/");
              const isoDate = `${parseInt(dateParts[0]) + 1911}-${dateParts[1].padStart(2,"0")}-${dateParts[2].padStart(2,"0")}`;
              if (isoDate < twseStart || isoDate > endDate) continue;
              twseData.push({
                date: isoDate,
                open: parseFloat(row[3].replace(/,/g, "")),
                high: parseFloat(row[4].replace(/,/g, "")),
                low: parseFloat(row[5].replace(/,/g, "")),
                close: parseFloat(row[6].replace(/,/g, "")),
                volume: parseFloat(row[1].replace(/,/g, "")),
              });
            }
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }
    } catch (e) {
      console.warn("TWSE 資料抓取失敗:", e);
    }
  }

  const allData = [...finmindData, ...twseData];
  const seen = new Set();
  const merged = allData.filter(d => {
    if (seen.has(d.date)) return false;
    seen.add(d.date); return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length === 0) throw new Error(`找不到股票 ${code} 的資料，請確認代號是否正確`);
  if (merged.length < 20) throw new Error(`資料筆數不足（${merged.length} 筆），請延長時間區間至少 20 個交易日`);

  return merged;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f1923", border: "1px solid #1e3a4f", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ color: "#64b5f6", marginBottom: 4, fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
};

const ErrorModal = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.65)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0f1923", border: "1px solid #ef5350",
        borderRadius: 14, padding: "32px 36px", maxWidth: 440, width: "90%",
        boxShadow: "0 0 50px rgba(239,83,80,0.25)",
        animation: "fadeIn 0.2s ease",
      }} onClick={e => e.stopPropagation()}>
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div style={{ color: "#ef5350", fontSize: 17, fontWeight: 700 }}>發生錯誤</div>
        </div>
        <div style={{ color: "#e0f0ff", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#546e7a", fontSize: 11 }}>⏱ 5 秒後自動關閉</div>
          <button onClick={onClose} style={{
            background: "#ef5350", border: "none", borderRadius: 8,
            color: "#fff", padding: "9px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700,
          }}>關閉</button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [stockCode, setStockCode] = useState("2330");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2026-04-24");
  const [strategy, setStrategy] = useState("ma_cross");
  const [initialCapital, setInitialCapital] = useState(1000000);
  const [finmindToken, setFinmindToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stockData, setStockData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [backtestResult, setBacktestResult] = useState(null);
  const [activeTab, setActiveTab] = useState("chart");
  const [customParams, setCustomParams] = useState({ useMA: true, useRSI: true, useKD: false });
  const [compareCode, setCompareCode] = useState("");
  const [compareData, setCompareData] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");

  const handleAnalyze = async () => {
    if (!finmindToken) { setError("請先輸入 FinMind Token 才能開始分析"); return; }
    if (!stockCode) { setError("請輸入股票代號"); return; }
    if (startDate >= endDate) { setError("開始日期必須早於結束日期"); return; }
    setLoading(true); setError(""); setBacktestResult(null); setCompareData(null);

    try {
      setLoadingMsg("📡 抓取股價資料中...");
      const data = await fetchMergedData(stockCode, startDate, endDate, finmindToken);
      setLoadingMsg("📊 計算技術指標中...");
      const ma5 = calcMA(data, 5);
      const ma20 = calcMA(data, 20);
      const ma60 = calcMA(data, 60);
      const rsi = calcRSI(data);
      const { k, d } = calcKD(data);

      const chart = data.map((d, i) => ({
        date: d.date.slice(5),
        close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume,
        ma5: ma5[i] ? parseFloat(ma5[i].toFixed(2)) : null,
        ma20: ma20[i] ? parseFloat(ma20[i].toFixed(2)) : null,
        ma60: ma60[i] ? parseFloat(ma60[i].toFixed(2)) : null,
        rsi: rsi[i] ? parseFloat(rsi[i].toFixed(2)) : null,
        k: k[i] ? parseFloat(k[i].toFixed(2)) : null,
        d: d[i] ? parseFloat(d[i].toFixed(2)) : null,
      }));

      setStockData(data); setChartData(chart);
      setLoadingMsg("🔬 執行回測中...");
      const params = strategy === "custom" ? customParams : STRATEGIES[strategy].params;
      setBacktestResult(runBacktest(data, strategy, params, initialCapital));
      setActiveTab("chart");
    } catch (e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const handleCompare = async () => {
    if (!compareCode || !finmindToken) { setError("請輸入比較股票代號和 FinMind Token"); return; }
    setLoading(true);
    try {
      setLoadingMsg(`📡 抓取 ${compareCode} 資料中...`);
      const data = await fetchMergedData(compareCode, startDate, endDate, finmindToken);
      const firstClose = data[0].close;
      setCompareData({
        normalized: data.map(d => ({
          date: d.date.slice(5),
          [`${compareCode}漲幅%`]: parseFloat(((d.close - firstClose) / firstClose * 100).toFixed(2)),
        })),
      });
    } catch (e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const mainNormalized = chartData.map(d => {
    const first = chartData[0]?.close || 1;
    return { date: d.date, [`${stockCode}漲幅%`]: parseFloat(((d.close - first) / first * 100).toFixed(2)) };
  });
  const mergedCompare = mainNormalized.map((m, i) => ({ ...m, ...(compareData?.normalized[i] || {}) }));

  const inputStyle = { background: "#0d1b26", border: "1px solid #1e3a4f", borderRadius: 6, color: "#e0f0ff", padding: "8px 12px", fontSize: 13, width: "100%", outline: "none" };
  const tabStyle = (tab) => ({ padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: activeTab === tab ? "#1565c0" : "transparent", color: activeTab === tab ? "#fff" : "#78909c", transition: "all 0.2s" });
  const statBox = (label, value, color = "#64b5f6", sub = "") => (
    <div style={{ background: "#0d1b26", borderRadius: 10, padding: "16px 20px", border: "1px solid #1e3a4f", flex: 1, minWidth: 120 }}>
      <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: "#546e7a", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "#060e17", minHeight: "100vh", color: "#e0f0ff", fontFamily: "'Segoe UI', sans-serif", padding: "20px" }}>

      {error && <ErrorModal message={error} onClose={() => setError("")} />}

      {loading && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(6,14,23,0.88)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ width: 52, height: 52, border: "3px solid #1e3a4f", borderTop: "3px solid #1565c0", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <div style={{ color: "#64b5f6", fontSize: 14 }}>{loadingMsg || "處理中..."}</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 8, height: 32, background: "linear-gradient(180deg, #1565c0, #0288d1)", borderRadius: 4 }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e0f0ff", letterSpacing: 1 }}>台股回測分析平台</h1>
          <p style={{ margin: 0, color: "#546e7a", fontSize: 12 }}>Taiwan Stock Backtest & Analysis · FinMind + TWSE 雙資料源</p>
        </div>
      </div>

      <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          {[
            ["股票代號", <input style={inputStyle} value={stockCode} onChange={e => setStockCode(e.target.value)} placeholder="e.g. 2330" />],
            ["開始日期", <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />],
            ["結束日期", <input style={inputStyle} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />],
            ["初始資金", <input style={inputStyle} type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} />],
            ["回測策略", <select style={{ ...inputStyle, cursor: "pointer" }} value={strategy} onChange={e => setStrategy(e.target.value)}>{Object.entries(STRATEGIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>],
            ["FinMind Token", <input style={inputStyle} type="password" value={finmindToken} onChange={e => setFinmindToken(e.target.value)} placeholder="輸入你的 Token" />],
          ].map(([label, input]) => (
            <div key={label}>
              <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>
              {input}
            </div>
          ))}
        </div>

        {strategy === "custom" && (
          <div style={{ background: "#0d1b26", borderRadius: 8, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ color: "#546e7a", fontSize: 12 }}>自訂條件：</span>
            {[["useMA", "MA 多頭排列"], ["useRSI", "RSI 40~65"], ["useKD", "KD 黃金交叉"]].map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: customParams[key] ? "#64b5f6" : "#546e7a" }}>
                <input type="checkbox" checked={customParams[key]} onChange={e => setCustomParams(p => ({ ...p, [key]: e.target.checked }))} />{label}
              </label>
            ))}
          </div>
        )}

        <div style={{ background: "#0d1b26", borderRadius: 8, padding: "8px 14px", marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#546e7a", fontSize: 11 }}>📡 資料來源：</span>
          <span style={{ color: "#4caf50", fontSize: 11 }}>● FinMind（歷史：2010～2025/3）</span>
          <span style={{ color: "#64b5f6", fontSize: 11 }}>● TWSE（近期：2025/4～今日）</span>
          <span style={{ color: "#546e7a", fontSize: 11 }}>自動合併，無縫切換</span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleAnalyze} disabled={loading} style={{ background: "linear-gradient(135deg, #1565c0, #0288d1)", border: "none", borderRadius: 8, color: "#fff", padding: "10px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🔍 開始分析
          </button>
          <input style={{ ...inputStyle, width: 100 }} value={compareCode} onChange={e => setCompareCode(e.target.value)} placeholder="比較股票" />
          <button onClick={handleCompare} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #1e3a4f", borderRadius: 8, color: "#64b5f6", padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
            + 加入比較
          </button>
        </div>
      </div>

      {backtestResult && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {statBox("總報酬率", `${backtestResult.totalReturn}%`, parseFloat(backtestResult.totalReturn) >= 0 ? "#4caf50" : "#ef5350")}
          {statBox("勝率", `${backtestResult.winRate}%`, "#64b5f6", `${backtestResult.sellTrades.filter(t => t.profit > 0).length}勝 ${backtestResult.sellTrades.filter(t => t.profit <= 0).length}敗`)}
          {statBox("最大回撤", `-${backtestResult.maxDrawdown}%`, "#ff7043")}
          {statBox("最終資金", `${(backtestResult.finalCapital / 10000).toFixed(0)}萬`, "#4caf50", `初始 ${(initialCapital / 10000).toFixed(0)}萬`)}
          {statBox("交易次數", backtestResult.sellTrades.length, "#ce93d8", "已完成交易")}
          {chartData.length > 0 && statBox("資料筆數", chartData.length, "#546e7a", `${chartData[0]?.date} ~ ${chartData[chartData.length-1]?.date}`)}
        </div>
      )}

      {chartData.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#0a1520", padding: 6, borderRadius: 8, width: "fit-content", flexWrap: "wrap" }}>
            {[["chart", "📊 K線圖"], ["indicators", "📈 技術指標"], ["equity", "💰 資金曲線"], ["trades", "📋 交易記錄"], ["compare", "🔄 比較"]].map(([tab, label]) => (
              <button key={tab} style={tabStyle(tab)} onClick={() => setActiveTab(tab)}>{label}</button>
            ))}
          </div>

          {activeTab === "chart" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 16px", color: "#90caf9", fontSize: 14 }}>{stockCode} 股價走勢 + 均線 {backtestResult && <span style={{ color: "#546e7a", fontSize: 12 }}>｜ 綠線=買進 紅線=賣出</span>}</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length / 8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} domain={["auto", "auto"]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="close" stroke="#64b5f6" dot={false} strokeWidth={1.5} name="收盤價" />
                  <Line type="monotone" dataKey="ma5" stroke="#ffd54f" dot={false} strokeWidth={1} name="MA5" />
                  <Line type="monotone" dataKey="ma20" stroke="#ef9a9a" dot={false} strokeWidth={1} name="MA20" />
                  <Line type="monotone" dataKey="ma60" stroke="#a5d6a7" dot={false} strokeWidth={1} name="MA60" />
                  {backtestResult?.trades.filter(t => t.type === "buy").map((t, i) => {
                    const idx = chartData.findIndex(c => c.date === t.date.slice(5));
                    return idx >= 0 ? <ReferenceLine key={`b${i}`} x={chartData[idx].date} stroke="#4caf50" strokeDasharray="4 2" /> : null;
                  })}
                  {backtestResult?.trades.filter(t => t.type === "sell").map((t, i) => {
                    const idx = chartData.findIndex(c => c.date === t.date.slice(5));
                    return idx >= 0 ? <ReferenceLine key={`s${i}`} x={chartData[idx].date} stroke="#ef5350" strokeDasharray="4 2" /> : null;
                  })}
                </ComposedChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={80}>
                <ComposedChart data={chartData}>
                  <XAxis dataKey="date" tick={false} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 9 }} />
                  <Bar dataKey="volume" fill="#1565c0" opacity={0.6} name="成交量" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "indicators" && (
            <div style={{ display: "grid", gap: 16 }}>
              {[{ title: "RSI (14)", dataKey: "rsi", color: "#ce93d8", refs: [{ y: 70, color: "#ef5350" }, { y: 30, color: "#4caf50" }] },
                { title: "K值", dataKey: "k", color: "#ffd54f", extra: { dataKey: "d", color: "#ef9a9a", name: "D值" }, refs: [{ y: 80, color: "#ef5350" }, { y: 20, color: "#4caf50" }] }
              ].map(({ title, dataKey, color, extra, refs }) => (
                <div key={title} style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
                  <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>{title}</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                      <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length / 8)} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#546e7a", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      {refs.map(r => <ReferenceLine key={r.y} y={r.y} stroke={r.color} strokeDasharray="4 2" />)}
                      <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} name={title} />
                      {extra && <Line type="monotone" dataKey={extra.dataKey} stroke={extra.color} dot={false} strokeWidth={1.5} name={extra.name} />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}

          {activeTab === "equity" && backtestResult && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>資金曲線</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={backtestResult.equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(backtestResult.equity.length / 8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${(v / 10000).toFixed(0)}萬`} />
                  <Tooltip content={<CustomTooltip />} formatter={(v) => [`${(v / 10000).toFixed(1)}萬`, "資金"]} />
                  <ReferenceLine y={initialCapital} stroke="#546e7a" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="value" stroke="#4caf50" dot={false} strokeWidth={2} name="資金" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "trades" && backtestResult && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 16px", color: "#90caf9", fontSize: 14 }}>交易記錄（{backtestResult.trades.length} 筆）</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e3a4f" }}>
                      {["類型", "日期", "價格", "股數", "損益", "損益%"].map(h => (
                        <th key={h} style={{ padding: "8px 16px", color: "#546e7a", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backtestResult.trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #0d2a3a" }}>
                        <td style={{ padding: "10px 16px", color: t.type === "buy" ? "#4caf50" : "#ef5350", fontWeight: 700 }}>{t.type === "buy" ? "▲ 買進" : "▼ 賣出"}</td>
                        <td style={{ padding: "10px 16px", color: "#90caf9" }}>{t.date}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{t.price.toFixed(2)}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{t.shares?.toLocaleString()}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", color: t.profit > 0 ? "#4caf50" : t.profit < 0 ? "#ef5350" : "#90caf9" }}>
                          {t.profit !== undefined ? `${t.profit > 0 ? "+" : ""}${t.profit.toFixed(0)}` : "-"}
                        </td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", color: parseFloat(t.profitPct) > 0 ? "#4caf50" : parseFloat(t.profitPct) < 0 ? "#ef5350" : "#90caf9" }}>
                          {t.profitPct !== undefined ? `${parseFloat(t.profitPct) > 0 ? "+" : ""}${t.profitPct}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "compare" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>股票漲幅比較（基準化）</h3>
              {compareData ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={mergedCompare}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                    <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(mergedCompare.length / 8)} />
                    <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#546e7a" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey={`${stockCode}漲幅%`} stroke="#64b5f6" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey={`${compareCode}漲幅%`} stroke="#ffd54f" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: "#546e7a", fontSize: 13, textAlign: "center", padding: 40 }}>請在上方輸入比較股票代號並點擊「+ 加入比較」</div>
              )}
            </div>
          )}
        </>
      )}

      {!chartData.length && !loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#546e7a" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 16, marginBottom: 8, color: "#78909c" }}>輸入股票代號和 FinMind Token</div>
          <div style={{ fontSize: 13 }}>點擊「開始分析」即可查看 K 線圖與回測結果</div>
        </div>
      )}
    </div>
  );
}
