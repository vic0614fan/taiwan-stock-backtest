import { useState, useCallback } from "react";
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

const FINMIND_TOKEN = "";

const STRATEGIES = {
  ma_cross: {
    name: "MA 黃金交叉",
    description: "MA5 上穿 MA20 買進，下穿賣出",
    params: { shortPeriod: 5, longPeriod: 20 },
  },
  rsi_oversold: {
    name: "RSI 超賣反彈",
    description: "RSI < 30 買進，RSI > 70 賣出",
    params: { period: 14, oversold: 30, overbought: 70 },
  },
  kd_cross: {
    name: "KD 黃金交叉",
    description: "K 上穿 D 且 KD < 50 買進，K 下穿 D 且 KD > 50 賣出",
    params: { period: 9 },
  },
  custom: {
    name: "自訂策略",
    description: "自行設定多個指標組合條件",
    params: {},
  },
};

function calcMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, d) => s + d.close, 0) / period;
  });
}

function calcRSI(data, period = 14) {
  const rsi = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) { rsi.push(null); continue; }
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j].close - data[j - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
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
    const kVal = i === period - 1 ? rsv : k[i - 1] * 2 / 3 + rsv / 3;
    const dVal = i === period - 1 ? kVal : d[i - 1] * 2 / 3 + kVal / 3;
    k.push(kVal);
    d.push(dVal);
  }
  return { k, d };
}

function runBacktest(data, strategy, params, initialCapital = 1000000) {
  const ma5 = calcMA(data, 5);
  const ma20 = calcMA(data, 20);
  const rsi = calcRSI(data, params.rsiPeriod || 14);
  const { k, d } = calcKD(data, 9);

  let capital = initialCapital;
  let shares = 0;
  let inPosition = false;
  let buyPrice = 0;
  const trades = [];
  const equity = [];

  for (let i = 1; i < data.length; i++) {
    const price = data[i].close;
    let buySignal = false;
    let sellSignal = false;

    if (strategy === "ma_cross") {
      if (ma5[i] && ma20[i] && ma5[i - 1] && ma20[i - 1]) {
        buySignal = ma5[i] > ma20[i] && ma5[i - 1] <= ma20[i - 1];
        sellSignal = ma5[i] < ma20[i] && ma5[i - 1] >= ma20[i - 1];
      }
    } else if (strategy === "rsi_oversold") {
      if (rsi[i] !== null && rsi[i - 1] !== null) {
        buySignal = rsi[i - 1] < (params.oversold || 30) && rsi[i] >= (params.oversold || 30);
        sellSignal = rsi[i] > (params.overbought || 70);
      }
    } else if (strategy === "kd_cross") {
      if (k[i] !== null && d[i] !== null && k[i - 1] !== null && d[i - 1] !== null) {
        buySignal = k[i] > d[i] && k[i - 1] <= d[i - 1] && k[i] < 50;
        sellSignal = k[i] < d[i] && k[i - 1] >= d[i - 1] && k[i] > 50;
      }
    } else if (strategy === "custom") {
      const conditions = [];
      if (params.useMA && ma5[i] && ma20[i]) conditions.push(ma5[i] > ma20[i]);
      if (params.useRSI && rsi[i] !== null) conditions.push(rsi[i] > 40 && rsi[i] < 65);
      if (params.useKD && k[i] !== null) conditions.push(k[i] > d[i]);
      buySignal = conditions.length > 0 && conditions.every(Boolean) && !inPosition;

      const sellConds = [];
      if (params.useMA && ma5[i] && ma20[i]) sellConds.push(ma5[i] < ma20[i]);
      if (params.useRSI && rsi[i] !== null) sellConds.push(rsi[i] > 70);
      sellSignal = sellConds.some(Boolean);
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
      const profitPct = ((price - buyPrice) / buyPrice * 100).toFixed(2);
      trades.push({ type: "sell", date: data[i].date, price, shares, profit, profitPct });
      shares = 0;
      inPosition = false;
    }

    equity.push({
      date: data[i].date,
      value: capital + shares * price,
    });
  }

  if (inPosition) {
    const lastPrice = data[data.length - 1].close;
    capital += shares * lastPrice;
    const profit = (lastPrice - buyPrice) * shares;
    trades.push({
      type: "sell", date: data[data.length - 1].date,
      price: lastPrice, shares, profit,
      profitPct: ((lastPrice - buyPrice) / buyPrice * 100).toFixed(2),
    });
  }

  const sellTrades = trades.filter(t => t.type === "sell");
  const wins = sellTrades.filter(t => t.profit > 0).length;
  const totalReturn = ((capital - initialCapital) / initialCapital * 100).toFixed(2);
  const winRate = sellTrades.length > 0 ? (wins / sellTrades.length * 100).toFixed(1) : 0;
  const maxDrawdown = calcMaxDrawdown(equity, initialCapital);

  return { trades, equity, totalReturn, winRate, maxDrawdown, finalCapital: capital, sellTrades };
}

function calcMaxDrawdown(equity, initial) {
  let peak = initial;
  let maxDD = 0;
  for (const e of equity) {
    if (e.value > peak) peak = e.value;
    const dd = (peak - e.value) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD.toFixed(2);
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

export default function App() {
  const [stockCode, setStockCode] = useState("2330");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2025-12-31");
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

  const fetchStock = useCallback(async (code) => {
    const token = finmindToken || FINMIND_TOKEN;
    if (!token) throw new Error("請輸入 FinMind Token");
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startDate}&end_date=${endDate}&token=${token}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.data || json.data.length === 0) throw new Error(`找不到股票 ${code} 的資料`);
    return json.data;
  }, [finmindToken, startDate, endDate]);

  const handleAnalyze = async () => {
    setLoading(true);
    setError("");
    setBacktestResult(null);
    setCompareData(null);
    try {
      const raw = await fetchStock(stockCode);
      const data = raw.map(d => ({
        date: d.date,
        open: parseFloat(d.open),
        high: parseFloat(d.max),
        low: parseFloat(d.min),
        close: parseFloat(d.close),
        volume: parseFloat(d.Trading_Volume),
      }));

      const ma5 = calcMA(data, 5);
      const ma20 = calcMA(data, 20);
      const ma60 = calcMA(data, 60);
      const rsi = calcRSI(data);
      const { k, d } = calcKD(data);

      const chart = data.map((d, i) => ({
        date: d.date.slice(5),
        close: d.close,
        open: d.open,
        high: d.high,
        low: d.low,
        volume: d.volume,
        ma5: ma5[i] ? parseFloat(ma5[i].toFixed(2)) : null,
        ma20: ma20[i] ? parseFloat(ma20[i].toFixed(2)) : null,
        ma60: ma60[i] ? parseFloat(ma60[i].toFixed(2)) : null,
        rsi: rsi[i] ? parseFloat(rsi[i].toFixed(2)) : null,
        k: k[i] ? parseFloat(k[i].toFixed(2)) : null,
        d: d[i] ? parseFloat(d[i].toFixed(2)) : null,
      }));

      setStockData(data);
      setChartData(chart);

      const params = strategy === "custom" ? customParams : STRATEGIES[strategy].params;
      const result = runBacktest(data, strategy, params, initialCapital);
      setBacktestResult(result);
      setActiveTab("chart");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleCompare = async () => {
    if (!compareCode) return;
    setLoading(true);
    try {
      const raw = await fetchStock(compareCode);
      const data = raw.map(d => ({
        date: d.date,
        close: parseFloat(d.close),
        volume: parseFloat(d.Trading_Volume),
      }));
      const firstClose = data[0].close;
      const normalized = data.map(d => ({
        date: d.date.slice(5),
        [`${compareCode}漲幅%`]: parseFloat(((d.close - firstClose) / firstClose * 100).toFixed(2)),
      }));
      setCompareData({ data, normalized });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const mainNormalized = chartData.map(d => {
    const first = chartData[0]?.close || 1;
    return { date: d.date, [`${stockCode}漲幅%`]: parseFloat(((d.close - first) / first * 100).toFixed(2)) };
  });

  const mergedCompare = mainNormalized.map((m, i) => ({
    ...m,
    ...(compareData?.normalized[i] || {}),
  }));

  const tabStyle = (tab) => ({
    padding: "8px 20px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    background: activeTab === tab ? "#1565c0" : "transparent",
    color: activeTab === tab ? "#fff" : "#78909c",
    transition: "all 0.2s",
  });

  const inputStyle = {
    background: "#0d1b26",
    border: "1px solid #1e3a4f",
    borderRadius: 6,
    color: "#e0f0ff",
    padding: "8px 12px",
    fontSize: 13,
    width: "100%",
    outline: "none",
  };

  const statBox = (label, value, color = "#64b5f6", sub = "") => (
    <div style={{ background: "#0d1b26", borderRadius: 10, padding: "16px 20px", border: "1px solid #1e3a4f", flex: 1, minWidth: 120 }}>
      <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: "#546e7a", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ background: "#060e17", minHeight: "100vh", color: "#e0f0ff", fontFamily: "'Segoe UI', sans-serif", padding: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 8, height: 32, background: "linear-gradient(180deg, #1565c0, #0288d1)", borderRadius: 4 }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e0f0ff", letterSpacing: 1 }}>台股回測分析平台</h1>
          <p style={{ margin: 0, color: "#546e7a", fontSize: 12 }}>Taiwan Stock Backtest & Analysis</p>
        </div>
      </div>

      {/* Control Panel */}
      <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>股票代號</label>
            <input style={inputStyle} value={stockCode} onChange={e => setStockCode(e.target.value)} placeholder="e.g. 2330" />
          </div>
          <div>
            <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>開始日期</label>
            <input style={inputStyle} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>結束日期</label>
            <input style={inputStyle} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>初始資金</label>
            <input style={inputStyle} type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} />
          </div>
          <div>
            <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>回測策略</label>
            <select style={{ ...inputStyle, cursor: "pointer" }} value={strategy} onChange={e => setStrategy(e.target.value)}>
              {Object.entries(STRATEGIES).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: "#546e7a", fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>FinMind Token</label>
            <input style={inputStyle} type="password" value={finmindToken} onChange={e => setFinmindToken(e.target.value)} placeholder="輸入你的 Token" />
          </div>
        </div>

        {strategy === "custom" && (
          <div style={{ background: "#0d1b26", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 20 }}>
            <span style={{ color: "#546e7a", fontSize: 12, marginRight: 8 }}>自訂條件：</span>
            {[["useMA", "MA 多頭排列"], ["useRSI", "RSI 40~65"], ["useKD", "KD 黃金交叉"]].map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: customParams[key] ? "#64b5f6" : "#546e7a" }}>
                <input type="checkbox" checked={customParams[key]} onChange={e => setCustomParams(p => ({ ...p, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleAnalyze} disabled={loading} style={{
            background: loading ? "#1e3a4f" : "linear-gradient(135deg, #1565c0, #0288d1)",
            border: "none", borderRadius: 8, color: "#fff", padding: "10px 28px",
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 0.5
          }}>
            {loading ? "分析中..." : "🔍 開始分析"}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...inputStyle, width: 100 }} value={compareCode} onChange={e => setCompareCode(e.target.value)} placeholder="比較股票" />
            <button onClick={handleCompare} disabled={loading || !stockData} style={{
              background: "#0d2a3a", border: "1px solid #1e3a4f", borderRadius: 8,
              color: "#64b5f6", padding: "9px 16px", fontSize: 13, cursor: "pointer"
            }}>
              + 加入比較
            </button>
          </div>
        </div>

        {error && <div style={{ color: "#ef5350", fontSize: 13, marginTop: 12, padding: "8px 12px", background: "#1a0a0a", borderRadius: 6 }}>⚠️ {error}</div>}
      </div>

      {/* Stats */}
      {backtestResult && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {statBox("總報酬率", `${backtestResult.totalReturn}%`,
            parseFloat(backtestResult.totalReturn) >= 0 ? "#4caf50" : "#ef5350")}
          {statBox("勝率", `${backtestResult.winRate}%`, "#64b5f6",
            `${backtestResult.sellTrades.filter(t => t.profit > 0).length}勝 ${backtestResult.sellTrades.filter(t => t.profit <= 0).length}敗`)}
          {statBox("最大回撤", `-${backtestResult.maxDrawdown}%`, "#ff7043")}
          {statBox("最終資金", `${(backtestResult.finalCapital / 10000).toFixed(0)}萬`,
            "#4caf50", `初始 ${(initialCapital / 10000).toFixed(0)}萬`)}
          {statBox("交易次數", backtestResult.sellTrades.length, "#ce93d8", "已完成交易")}
        </div>
      )}

      {/* Tabs */}
      {chartData.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "#0a1520", padding: 6, borderRadius: 8, width: "fit-content" }}>
            {[["chart", "📊 K線圖"], ["indicators", "📈 技術指標"], ["equity", "💰 資金曲線"], ["trades", "📋 交易記錄"], ["compare", "🔄 比較"]].map(([tab, label]) => (
              <button key={tab} style={tabStyle(tab)} onClick={() => setActiveTab(tab)}>{label}</button>
            ))}
          </div>

          {/* Chart Tab */}
          {activeTab === "chart" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 16px", color: "#90caf9", fontSize: 14 }}>
                {stockCode} 股價走勢 + 均線
                {backtestResult && <span style={{ color: "#546e7a", fontSize: 12, marginLeft: 8 }}>● 綠色三角=買進 紅色三角=賣出</span>}
              </h3>
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

          {/* Indicators Tab */}
          {activeTab === "indicators" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>RSI (14)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                    <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length / 8)} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#546e7a", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={70} stroke="#ef5350" strokeDasharray="4 2" />
                    <ReferenceLine y={30} stroke="#4caf50" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="rsi" stroke="#ce93d8" dot={false} strokeWidth={1.5} name="RSI" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>KD (9)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                    <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length / 8)} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#546e7a", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={80} stroke="#ef5350" strokeDasharray="4 2" />
                    <ReferenceLine y={20} stroke="#4caf50" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="k" stroke="#ffd54f" dot={false} strokeWidth={1.5} name="K值" />
                    <Line type="monotone" dataKey="d" stroke="#ef9a9a" dot={false} strokeWidth={1.5} name="D值" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Equity Tab */}
          {activeTab === "equity" && backtestResult && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>資金曲線</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={backtestResult.equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(backtestResult.equity.length / 8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${(v / 10000).toFixed(0)}萬`} />
                  <Tooltip content={<CustomTooltip />} formatter={(v) => [`${(v / 10000).toFixed(1)}萬`, "資金"]} />
                  <ReferenceLine y={initialCapital} stroke="#546e7a" strokeDasharray="4 2" label={{ value: "初始資金", fill: "#546e7a", fontSize: 10 }} />
                  <Line type="monotone" dataKey="value" stroke="#4caf50" dot={false} strokeWidth={2} name="資金" fill="#4caf50" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trades Tab */}
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
                        <td style={{ padding: "10px 16px", color: t.type === "buy" ? "#4caf50" : "#ef5350", fontWeight: 700 }}>
                          {t.type === "buy" ? "▲ 買進" : "▼ 賣出"}
                        </td>
                        <td style={{ padding: "10px 16px", color: "#90caf9" }}>{t.date}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{t.price.toFixed(2)}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>{t.shares?.toLocaleString()}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", color: t.profit > 0 ? "#4caf50" : t.profit < 0 ? "#ef5350" : "#90caf9" }}>
                          {t.profit !== undefined ? `${t.profit > 0 ? "+" : ""}${t.profit.toFixed(0)}` : "-"}
                        </td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", color: parseFloat(t.profitPct) > 0 ? "#4caf50" : parseFloat(t.profitPct) < 0 ? "#ef5350" : "#90caf9" }}>
                          {t.profitPct !== undefined ? `${t.profitPct > 0 ? "+" : ""}${t.profitPct}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compare Tab */}
          {activeTab === "compare" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 14 }}>股票漲幅比較（基準化 = 起始點為 0%）</h3>
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
                <div style={{ color: "#546e7a", fontSize: 13, textAlign: "center", padding: 40 }}>
                  請在上方輸入比較股票代號並點擊「+ 加入比較」
                </div>
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
