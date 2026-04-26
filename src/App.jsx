import { useState, useEffect } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const STRATEGIES = {
  ma_cross:         { name: "MA 黃金交叉",      tag: "趨勢", color: "#64b5f6", desc: "MA5 上穿 MA20 買進，下穿賣出。適合趨勢明確的市場。" },
  ma_triple:        { name: "三線多頭排列",      tag: "趨勢", color: "#4fc3f7", desc: "MA5>MA20>MA60 全部多頭排列才買進。適合強勢趨勢股。" },
  rsi_oversold:     { name: "RSI 超賣反彈",      tag: "反轉", color: "#ce93d8", desc: "RSI<30 買進，RSI>70 賣出。適合震盪橫盤市場。" },
  kd_cross:         { name: "KD 黃金交叉",       tag: "反轉", color: "#f48fb1", desc: "低檔 KD 黃金交叉買進，高檔死亡交叉賣出。" },
  macd_cross:       { name: "MACD 黃金交叉",     tag: "趨勢", color: "#80cbc4", desc: "MACD 線上穿訊號線買進，適合中長線趨勢操作。" },
  bollinger:        { name: "布林通道突破",       tag: "突破", color: "#ffcc80", desc: "價格突破上軌買進，跌破下軌賣出。適合波動大的股票。" },
  bollinger_revert: { name: "布林通道反轉",       tag: "反轉", color: "#ffb74d", desc: "價格觸碰下軌反彈買進，觸碰上軌賣出。適合橫盤整理。" },
  volume_breakout:  { name: "量增突破",           tag: "突破", color: "#a5d6a7", desc: "量增超過5日均量2倍且價格創新高買進。適合主力介入初期。" },
  turtle:           { name: "海龜突破策略",       tag: "突破", color: "#ef9a9a", desc: "突破20日高點買進，跌破10日低點賣出。經典趨勢追蹤系統。" },
  rsi_ma:           { name: "RSI + MA 組合",     tag: "組合", color: "#b39ddb", desc: "RSI 在 40~65 健康區間且股價在 MA20 上方才買進。" },
  custom:           { name: "自訂策略",           tag: "自訂", color: "#90caf9", desc: "自行勾選多個指標組合條件。" },
};

function calcMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.close, 0) / period;
  });
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { ema.push(data[i].close); continue; }
    ema.push(data[i].close * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcMACD(data) {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine.map(v => ({ close: v })), 9);
  const histogram = macdLine.map((v, i) => v - signal[i]);
  return { macdLine, signal, histogram };
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

function calcBollinger(data, period = 20, multiplier = 2) {
  const ma = calcMA(data, period);
  return data.map((_, i) => {
    if (ma[i] === null) return { mid: null, upper: null, lower: null };
    const slice = data.slice(Math.max(0, i - period + 1), i + 1);
    const avg = ma[i];
    const std = Math.sqrt(slice.reduce((s, d) => s + Math.pow(d.close - avg, 2), 0) / slice.length);
    return { mid: avg, upper: avg + multiplier * std, lower: avg - multiplier * std };
  });
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
  const ma5  = calcMA(data, 5);
  const ma20 = calcMA(data, 20);
  const ma60 = calcMA(data, 60);
  const rsi  = calcRSI(data, 14);
  const { k, d } = calcKD(data, 9);
  const { macdLine, signal } = calcMACD(data);
  const boll = calcBollinger(data, 20, 2);
  const volumes = data.map(d => d.volume);
  const avgVol5 = calcMA(data.map(v => ({ close: v.volume })), 5);
  const high20 = data.map((_, i) => i < 20 ? null : Math.max(...data.slice(i - 20, i).map(d => d.high)));
  const low10  = data.map((_, i) => i < 10 ? null : Math.min(...data.slice(i - 10, i).map(d => d.low)));

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
    } else if (strategy === "ma_triple") {
      if (ma5[i] && ma20[i] && ma60[i] && ma5[i-1] && ma20[i-1] && ma60[i-1]) {
        const nowTriple = ma5[i] > ma20[i] && ma20[i] > ma60[i];
        const prevTriple = ma5[i-1] > ma20[i-1] && ma20[i-1] > ma60[i-1];
        buySignal = nowTriple && !prevTriple;
        sellSignal = !nowTriple && prevTriple;
      }
    } else if (strategy === "rsi_oversold") {
      if (rsi[i] !== null && rsi[i-1] !== null) {
        buySignal = rsi[i-1] < 30 && rsi[i] >= 30;
        sellSignal = rsi[i] > 70;
      }
    } else if (strategy === "kd_cross") {
      if (k[i] !== null && d[i] !== null && k[i-1] !== null && d[i-1] !== null) {
        buySignal = k[i] > d[i] && k[i-1] <= d[i-1] && k[i] < 50;
        sellSignal = k[i] < d[i] && k[i-1] >= d[i-1] && k[i] > 50;
      }
    } else if (strategy === "macd_cross") {
      if (macdLine[i] !== null && signal[i] !== null && macdLine[i-1] !== null && signal[i-1] !== null) {
        buySignal = macdLine[i] > signal[i] && macdLine[i-1] <= signal[i-1];
        sellSignal = macdLine[i] < signal[i] && macdLine[i-1] >= signal[i-1];
      }
    } else if (strategy === "bollinger") {
      if (boll[i].upper && boll[i-1].upper) {
        buySignal = data[i-1].close <= boll[i-1].lower && price > boll[i].lower;
        sellSignal = price > boll[i].upper;
      }
    } else if (strategy === "bollinger_revert") {
      if (boll[i].upper && boll[i-1].upper) {
        buySignal = price <= boll[i].lower;
        sellSignal = price >= boll[i].upper;
      }
    } else if (strategy === "volume_breakout") {
      const vol = volumes[i];
      const avgV = avgVol5[i];
      const prevHigh = i > 1 ? Math.max(...data.slice(Math.max(0, i-5), i).map(d => d.high)) : null;
      if (avgV && prevHigh && ma20[i]) {
        buySignal = vol > avgV * 2 && price > prevHigh && price > ma20[i];
        sellSignal = inPosition && (price < ma20[i] || (rsi[i] !== null && rsi[i] > 75));
      }
    } else if (strategy === "turtle") {
      if (high20[i] && low10[i]) {
        buySignal = price > high20[i];
        sellSignal = price < low10[i];
      }
    } else if (strategy === "rsi_ma") {
      if (rsi[i] !== null && ma20[i] && rsi[i-1] !== null && ma20[i-1]) {
        buySignal = rsi[i] > 40 && rsi[i] < 65 && price > ma20[i] && !(rsi[i-1] > 40 && rsi[i-1] < 65 && data[i-1].close > ma20[i-1]);
        sellSignal = rsi[i] > 70 || price < ma20[i];
      }
    } else if (strategy === "custom") {
      const conds = [];
      if (params.useMA && ma5[i] && ma20[i]) conds.push(ma5[i] > ma20[i]);
      if (params.useRSI && rsi[i] !== null) conds.push(rsi[i] > 40 && rsi[i] < 65);
      if (params.useKD && k[i] !== null) conds.push(k[i] > d[i]);
      if (params.useMACD && macdLine[i] !== null) conds.push(macdLine[i] > signal[i]);
      if (params.useVol && avgVol5[i]) conds.push(volumes[i] > avgVol5[i] * 1.5);
      buySignal = conds.length > 0 && conds.every(Boolean) && !inPosition;
      const sc = [];
      if (params.useMA && ma5[i] && ma20[i]) sc.push(ma5[i] < ma20[i]);
      if (params.useRSI && rsi[i] !== null) sc.push(rsi[i] > 70);
      if (params.useMACD && macdLine[i] !== null) sc.push(macdLine[i] < signal[i]);
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

async function fetchYahoo(code, suffix, startTs, endTs, tStart, endDate) {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1d&period1=${startTs}&period2=${endTs}`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.timestamp) return [];
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    return timestamp.map((ts, i) => {
      const date = new Date(ts * 1000);
      const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      return {
        date: iso,
        open: quote.open[i] ? +quote.open[i].toFixed(2) : null,
        high: quote.high[i] ? +quote.high[i].toFixed(2) : null,
        low: quote.low[i] ? +quote.low[i].toFixed(2) : null,
        close: quote.close[i] ? +quote.close[i].toFixed(2) : null,
        volume: quote.volume[i] || 0,
      };
    }).filter(d => d.close !== null && d.date >= tStart && d.date <= endDate);
  } catch(e) {
    return [];
  }
}

async function fetchMergedData(code, startDate, endDate, token) {
  const CUTOFF = "2025-04-01";
  let finmindData = [], recentData = [];

  // 1. FinMind 抓歷史資料
  if (startDate < CUTOFF) {
    const fEnd = endDate < CUTOFF ? endDate : CUTOFF;
    const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startDate}&end_date=${fEnd}&token=${token}`);
    const json = await res.json();
    if (json.data?.length) {
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

  // 2. Yahoo Finance 抓近期資料（自動判斷上市/上櫃）
  if (endDate >= CUTOFF) {
    const tStart = startDate > CUTOFF ? startDate : CUTOFF;
    const startTs = Math.floor(new Date(tStart).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate).getTime() / 1000) + 86400;

    // 先試上市 .TW，再試上櫃 .TWO
    recentData = await fetchYahoo(code, ".TW", startTs, endTs, tStart, endDate);
    if (recentData.length === 0) {
      recentData = await fetchYahoo(code, ".TWO", startTs, endTs, tStart, endDate);
    }
  }

  // 3. 合併去重排序
  const seen = new Set();
  const merged = [...finmindData, ...recentData]
    .filter(d => { if (!d.date || seen.has(d.date)) return false; seen.add(d.date); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length === 0) throw new Error(`找不到股票 ${code} 的資料，請確認代號是否正確（上市/上櫃皆支援）`);
  if (merged.length < 25) throw new Error(`資料筆數不足（${merged.length} 筆），請延長時間區間至少 25 個交易日`);
  return merged;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f1923", border: "1px solid #1e3a4f", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ color: "#64b5f6", marginBottom: 4, fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color, margin: "2px 0" }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}</p>)}
    </div>
  );
};

const ErrorModal = ({ message, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0f1923", border: "1px solid #ef5350", borderRadius: 14, padding: "32px 36px", maxWidth: 440, width: "90%", boxShadow: "0 0 50px rgba(239,83,80,0.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span style={{ color: "#ef5350", fontSize: 17, fontWeight: 700 }}>發生錯誤</span>
        </div>
        <div style={{ color: "#e0f0ff", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#546e7a", fontSize: 11 }}>⏱ 5 秒後自動關閉</span>
          <button onClick={onClose} style={{ background: "#ef5350", border: "none", borderRadius: 8, color: "#fff", padding: "9px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>關閉</button>
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
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [stockData, setStockData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [backtestResult, setBacktestResult] = useState(null);
  const [activeTab, setActiveTab] = useState("chart");
  const [customParams, setCustomParams] = useState({ useMA: true, useRSI: true, useKD: false, useMACD: false, useVol: false });
  const [compareCode, setCompareCode] = useState("");
  const [compareData, setCompareData] = useState(null);
  const [allResults, setAllResults] = useState(null);

  const handleAnalyze = async () => {
    if (!finmindToken) { setError("請先輸入 FinMind Token 才能開始分析"); return; }
    if (!stockCode) { setError("請輸入股票代號"); return; }
    if (startDate >= endDate) { setError("開始日期必須早於結束日期"); return; }
    setLoading(true); setError(""); setBacktestResult(null); setCompareData(null); setAllResults(null);
    try {
      setLoadingMsg("📡 抓取股價資料中...");
      const data = await fetchMergedData(stockCode, startDate, endDate, finmindToken);
      setLoadingMsg("📊 計算技術指標中...");
      const ma5  = calcMA(data, 5);
      const ma20 = calcMA(data, 20);
      const ma60 = calcMA(data, 60);
      const rsi  = calcRSI(data);
      const { k, d } = calcKD(data);
      const { macdLine, signal, histogram } = calcMACD(data);
      const boll = calcBollinger(data, 20, 2);
      const chart = data.map((d, i) => ({
        date: d.date.slice(5),
        close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume,
        ma5: ma5[i] ? +ma5[i].toFixed(2) : null,
        ma20: ma20[i] ? +ma20[i].toFixed(2) : null,
        ma60: ma60[i] ? +ma60[i].toFixed(2) : null,
        rsi: rsi[i] ? +rsi[i].toFixed(2) : null,
        k: k[i] ? +k[i].toFixed(2) : null,
        d: d[i] ? +d[i].toFixed(2) : null,
        macd: macdLine[i] ? +macdLine[i].toFixed(3) : null,
        signal: signal[i] ? +signal[i].toFixed(3) : null,
        histogram: histogram[i] ? +histogram[i].toFixed(3) : null,
        bollUpper: boll[i].upper ? +boll[i].upper.toFixed(2) : null,
        bollMid: boll[i].mid ? +boll[i].mid.toFixed(2) : null,
        bollLower: boll[i].lower ? +boll[i].lower.toFixed(2) : null,
      }));
      setStockData(data); setChartData(chart);
      setLoadingMsg("🔬 執行回測中...");
      const params = strategy === "custom" ? customParams : {};
      setBacktestResult(runBacktest(data, strategy, params, initialCapital));
      setActiveTab("chart");
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const handleCompareAll = async () => {
    if (!stockData) return;
    setLoading(true); setLoadingMsg("🔬 比較所有策略中...");
    try {
      const results = {};
      for (const [key] of Object.entries(STRATEGIES)) {
        results[key] = runBacktest(stockData, key, key === "custom" ? customParams : {}, initialCapital);
      }
      setAllResults(results); setActiveTab("compare_all");
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const handleCompare = async () => {
    if (!compareCode || !finmindToken) { setError("請輸入比較股票代號和 FinMind Token"); return; }
    setLoading(true); setLoadingMsg(`📡 抓取 ${compareCode} 資料中...`);
    try {
      const data = await fetchMergedData(compareCode, startDate, endDate, finmindToken);
      const first = data[0].close;
      setCompareData({ normalized: data.map(d => ({ date: d.date.slice(5), [`${compareCode}漲幅%`]: +((d.close - first) / first * 100).toFixed(2) })) });
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const mainNorm = chartData.map(d => ({ date: d.date, [`${stockCode}漲幅%`]: +((d.close - (chartData[0]?.close || 1)) / (chartData[0]?.close || 1) * 100).toFixed(2) }));
  const mergedComp = mainNorm.map((m, i) => ({ ...m, ...(compareData?.normalized[i] || {}) }));

  const inp = { background: "#0d1b26", border: "1px solid #1e3a4f", borderRadius: 6, color: "#e0f0ff", padding: "8px 12px", fontSize: 13, width: "100%", outline: "none" };
  const tabBtn = (t) => ({ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: activeTab === t ? "#1565c0" : "transparent", color: activeTab === t ? "#fff" : "#78909c", transition: "all 0.2s", whiteSpace: "nowrap" });
  const statBox = (label, value, color = "#64b5f6", sub = "") => (
    <div style={{ background: "#0d1b26", borderRadius: 10, padding: "14px 18px", border: "1px solid #1e3a4f", flex: 1, minWidth: 110 }}>
      <div style={{ color: "#546e7a", fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: "#546e7a", fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "#060e17", minHeight: "100vh", color: "#e0f0ff", fontFamily: "'Segoe UI', sans-serif", padding: "20px" }}>
      {error && <ErrorModal message={error} onClose={() => setError("")} />}
      {loading && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,14,23,0.88)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ width: 52, height: 52, border: "3px solid #1e3a4f", borderTop: "3px solid #1565c0", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <div style={{ color: "#64b5f6", fontSize: 14 }}>{loadingMsg}</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 8, height: 32, background: "linear-gradient(180deg,#1565c0,#0288d1)", borderRadius: 4 }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>台股回測分析平台</h1>
          <p style={{ margin: 0, color: "#546e7a", fontSize: 11 }}>Taiwan Stock Backtest · FinMind + Yahoo Finance 雙資料源 · 上市/上櫃皆支援 · 11 種策略</p>
        </div>
      </div>

      <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
          {[
            ["股票代號", <input style={inp} value={stockCode} onChange={e => setStockCode(e.target.value)} placeholder="上市/上櫃皆可" />],
            ["開始日期", <input style={inp} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />],
            ["結束日期", <input style={inp} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />],
            ["初始資金", <input style={inp} type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} />],
            ["FinMind Token", <input style={inp} type="password" value={finmindToken} onChange={e => setFinmindToken(e.target.value)} placeholder="輸入 Token" />],
          ].map(([label, input]) => (
            <div key={label}>
              <label style={{ color: "#546e7a", fontSize: 10, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>
              {input}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#546e7a", fontSize: 10, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>回測策略</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(STRATEGIES).map(([key, s]) => (
              <button key={key} onClick={() => setStrategy(key)} style={{
                padding: "6px 12px", borderRadius: 6, border: `1px solid ${strategy === key ? s.color : "#1e3a4f"}`,
                background: strategy === key ? `${s.color}22` : "transparent",
                color: strategy === key ? s.color : "#78909c",
                cursor: "pointer", fontSize: 12, fontWeight: strategy === key ? 700 : 400,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ fontSize: 9, background: strategy === key ? s.color : "#1e3a4f", color: strategy === key ? "#000" : "#546e7a", borderRadius: 3, padding: "1px 5px" }}>{s.tag}</span>
                {s.name}
              </button>
            ))}
          </div>
          {STRATEGIES[strategy] && (
            <div style={{ color: "#546e7a", fontSize: 11, marginTop: 8, padding: "6px 10px", background: "#0d1b26", borderRadius: 6, borderLeft: `3px solid ${STRATEGIES[strategy].color}` }}>
              💡 {STRATEGIES[strategy].desc}
            </div>
          )}
        </div>

        {strategy === "custom" && (
          <div style={{ background: "#0d1b26", borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ color: "#546e7a", fontSize: 11 }}>自訂條件：</span>
            {[["useMA","MA多頭"],["useRSI","RSI健康"],["useKD","KD金叉"],["useMACD","MACD金叉"],["useVol","量能放大"]].map(([key,label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: customParams[key] ? "#64b5f6" : "#546e7a" }}>
                <input type="checkbox" checked={customParams[key]} onChange={e => setCustomParams(p => ({...p,[key]:e.target.checked}))} />{label}
              </label>
            ))}
          </div>
        )}

        <div style={{ background: "#0d1b26", borderRadius: 8, padding: "6px 12px", marginBottom: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#546e7a", fontSize: 10 }}>📡 資料來源：</span>
          <span style={{ color: "#4caf50", fontSize: 10 }}>● FinMind（歷史：2010～2025/3）</span>
          <span style={{ color: "#64b5f6", fontSize: 10 }}>● Yahoo Finance（近期：2025/4～今日）</span>
          <span style={{ color: "#ffd54f", fontSize: 10 }}>● 上市/上櫃自動判斷</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={handleAnalyze} disabled={loading} style={{ background: "linear-gradient(135deg,#1565c0,#0288d1)", border: "none", borderRadius: 8, color: "#fff", padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            🔍 開始分析
          </button>
          <button onClick={handleCompareAll} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #1565c0", borderRadius: 8, color: "#64b5f6", padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            📊 比較所有策略
          </button>
          <input style={{ ...inp, width: 90 }} value={compareCode} onChange={e => setCompareCode(e.target.value)} placeholder="比較股票" />
          <button onClick={handleCompare} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #1e3a4f", borderRadius: 8, color: "#90caf9", padding: "9px 14px", fontSize: 12, cursor: "pointer" }}>
            + 加入比較
          </button>
        </div>
      </div>

      {backtestResult && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {statBox("總報酬率", `${backtestResult.totalReturn}%`, parseFloat(backtestResult.totalReturn) >= 0 ? "#4caf50" : "#ef5350")}
          {statBox("勝率", `${backtestResult.winRate}%`, "#64b5f6", `${backtestResult.sellTrades.filter(t=>t.profit>0).length}勝${backtestResult.sellTrades.filter(t=>t.profit<=0).length}敗`)}
          {statBox("最大回撤", `-${backtestResult.maxDrawdown}%`, "#ff7043")}
          {statBox("最終資金", `${(backtestResult.finalCapital/10000).toFixed(0)}萬`, "#4caf50", `初始${(initialCapital/10000).toFixed(0)}萬`)}
          {statBox("交易次數", backtestResult.sellTrades.length, "#ce93d8", "已完成")}
          {chartData.length > 0 && statBox("資料筆數", chartData.length, "#546e7a", `${chartData[0]?.date}~${chartData[chartData.length-1]?.date}`)}
        </div>
      )}

      {chartData.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#0a1520", padding: 5, borderRadius: 8, width: "fit-content", flexWrap: "wrap" }}>
            {[["chart","📊 K線圖"],["bollinger","📉 布林通道"],["indicators","📈 RSI/KD"],["macd","〰 MACD"],["equity","💰 資金曲線"],["trades","📋 交易記錄"],["stock_compare","🔄 股票比較"],["compare_all","🏆 策略比較"]].map(([t,l]) => (
              <button key={t} style={tabBtn(t)} onClick={() => setActiveTab(t)}>{l}</button>
            ))}
          </div>

          {activeTab === "chart" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>{stockCode} 股價 + MA均線 {backtestResult && <span style={{ color: "#546e7a", fontSize: 11 }}>｜綠線=買進 紅線=賣出</span>}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length/8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} domain={["auto","auto"]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="close" stroke="#64b5f6" dot={false} strokeWidth={1.5} name="收盤價" />
                  <Line type="monotone" dataKey="ma5" stroke="#ffd54f" dot={false} strokeWidth={1} name="MA5" />
                  <Line type="monotone" dataKey="ma20" stroke="#ef9a9a" dot={false} strokeWidth={1} name="MA20" />
                  <Line type="monotone" dataKey="ma60" stroke="#a5d6a7" dot={false} strokeWidth={1} name="MA60" />
                  {backtestResult?.trades.filter(t=>t.type==="buy").map((t,i) => {
                    const idx = chartData.findIndex(c => c.date === t.date.slice(5));
                    return idx >= 0 ? <ReferenceLine key={`b${i}`} x={chartData[idx].date} stroke="#4caf50" strokeDasharray="3 3" /> : null;
                  })}
                  {backtestResult?.trades.filter(t=>t.type==="sell").map((t,i) => {
                    const idx = chartData.findIndex(c => c.date === t.date.slice(5));
                    return idx >= 0 ? <ReferenceLine key={`s${i}`} x={chartData[idx].date} stroke="#ef5350" strokeDasharray="3 3" /> : null;
                  })}
                </ComposedChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={70}>
                <ComposedChart data={chartData}>
                  <XAxis dataKey="date" tick={false} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 9 }} />
                  <Bar dataKey="volume" fill="#1565c0" opacity={0.6} name="成交量" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "bollinger" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>布林通道 (20, 2σ)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length/8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} domain={["auto","auto"]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="close" stroke="#64b5f6" dot={false} strokeWidth={1.5} name="收盤價" />
                  <Line type="monotone" dataKey="bollUpper" stroke="#ef9a9a" dot={false} strokeWidth={1} strokeDasharray="4 2" name="上軌" />
                  <Line type="monotone" dataKey="bollMid" stroke="#ffd54f" dot={false} strokeWidth={1} name="中軌(MA20)" />
                  <Line type="monotone" dataKey="bollLower" stroke="#a5d6a7" dot={false} strokeWidth={1} strokeDasharray="4 2" name="下軌" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "indicators" && (
            <div style={{ display: "grid", gap: 14 }}>
              {[
                { title: "RSI (14)", keys: [{ k: "rsi", c: "#ce93d8", n: "RSI" }], refs: [70, 30] },
                { title: "KD (9)", keys: [{ k: "k", c: "#ffd54f", n: "K值" }, { k: "d", c: "#ef9a9a", n: "D值" }], refs: [80, 20] },
              ].map(({ title, keys, refs }) => (
                <div key={title} style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                  <h3 style={{ margin: "0 0 10px", color: "#90caf9", fontSize: 13 }}>{title}</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                      <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length/8)} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#546e7a", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      {refs.map(r => <ReferenceLine key={r} y={r} stroke={r > 50 ? "#ef5350" : "#4caf50"} strokeDasharray="4 2" />)}
                      {keys.map(({ k, c, n }) => <Line key={k} type="monotone" dataKey={k} stroke={c} dot={false} strokeWidth={1.5} name={n} />)}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}

          {activeTab === "macd" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 10px", color: "#90caf9", fontSize: 13 }}>MACD (12, 26, 9)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length/8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#546e7a" strokeDasharray="4 2" />
                  <Bar dataKey="histogram" fill="#64b5f6" opacity={0.6} name="柱狀" />
                  <Line type="monotone" dataKey="macd" stroke="#ffd54f" dot={false} strokeWidth={1.5} name="MACD線" />
                  <Line type="monotone" dataKey="signal" stroke="#ef9a9a" dot={false} strokeWidth={1.5} name="訊號線" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "equity" && backtestResult && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 10px", color: "#90caf9", fontSize: 13 }}>資金曲線</h3>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={backtestResult.equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(backtestResult.equity.length/8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${(v/10000).toFixed(0)}萬`} />
                  <Tooltip content={<CustomTooltip />} formatter={v => [`${(v/10000).toFixed(1)}萬`,"資金"]} />
                  <ReferenceLine y={initialCapital} stroke="#546e7a" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="value" stroke="#4caf50" dot={false} strokeWidth={2} name="資金" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "trades" && backtestResult && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>交易記錄（{backtestResult.trades.length} 筆）</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e3a4f" }}>
                      {["類型","日期","價格","股數","損益","損益%"].map(h => (
                        <th key={h} style={{ padding: "7px 14px", color: "#546e7a", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backtestResult.trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #0d2a3a" }}>
                        <td style={{ padding: "9px 14px", color: t.type==="buy"?"#4caf50":"#ef5350", fontWeight: 700 }}>{t.type==="buy"?"▲ 買進":"▼ 賣出"}</td>
                        <td style={{ padding: "9px 14px", color: "#90caf9" }}>{t.date}</td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace" }}>{t.price.toFixed(2)}</td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace" }}>{t.shares?.toLocaleString()}</td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace", color: t.profit>0?"#4caf50":t.profit<0?"#ef5350":"#90caf9" }}>
                          {t.profit!==undefined?`${t.profit>0?"+":""}${t.profit.toFixed(0)}`:"-"}
                        </td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace", color: parseFloat(t.profitPct)>0?"#4caf50":parseFloat(t.profitPct)<0?"#ef5350":"#90caf9" }}>
                          {t.profitPct!==undefined?`${parseFloat(t.profitPct)>0?"+":""}${t.profitPct}%`:"-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "stock_compare" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 13 }}>股票漲幅比較（基準化）</h3>
              {compareData ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={mergedComp}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                    <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(mergedComp.length/8)} />
                    <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
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

          {activeTab === "compare_all" && allResults && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 16px", color: "#90caf9", fontSize: 13 }}>🏆 所有策略回測比較 — {stockCode}</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e3a4f" }}>
                      {["策略","類型","總報酬率","勝率","最大回撤","交易次數","最終資金"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", color: "#546e7a", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(allResults)
                      .sort((a,b) => parseFloat(b[1].totalReturn) - parseFloat(a[1].totalReturn))
                      .map(([key, r], i) => (
                        <tr key={key} style={{ borderBottom: "1px solid #0d2a3a", background: i === 0 ? "#0d2a1a" : "transparent" }}>
                          <td style={{ padding: "10px 12px", color: STRATEGIES[key].color, fontWeight: 600 }}>
                            {i === 0 && "🥇 "}{i === 1 && "🥈 "}{i === 2 && "🥉 "}{STRATEGIES[key].name}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ fontSize: 10, background: "#1e3a4f", color: "#90caf9", borderRadius: 3, padding: "2px 6px" }}>{STRATEGIES[key].tag}</span>
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: parseFloat(r.totalReturn) >= 0 ? "#4caf50" : "#ef5350", fontWeight: 700 }}>
                            {parseFloat(r.totalReturn) >= 0 ? "+" : ""}{r.totalReturn}%
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#64b5f6" }}>{r.winRate}%</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#ff7043" }}>-{r.maxDrawdown}%</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#ce93d8" }}>{r.sellTrades.length}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.finalCapital >= initialCapital ? "#4caf50" : "#ef5350" }}>
                            {(r.finalCapital/10000).toFixed(0)}萬
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!chartData.length && !loading && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#546e7a" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 15, marginBottom: 6, color: "#78909c" }}>輸入股票代號和 FinMind Token</div>
          <div style={{ fontSize: 12 }}>支援上市/上櫃 · 11 種策略回測 · FinMind + Yahoo Finance 雙資料源</div>
        </div>
      )}
    </div>
  );
}
