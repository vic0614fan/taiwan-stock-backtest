import { useState, useEffect, useRef, useCallback } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

const STRATEGIES = {
  ma_cross:         { name: "MA 黃金交叉",    tag: "趨勢", color: "#64b5f6", desc: "MA5 上穿 MA20 買進，下穿賣出。適合趨勢明確的市場。" },
  ma_triple:        { name: "三線多頭排列",   tag: "趨勢", color: "#4fc3f7", desc: "MA5>MA20>MA60 全部多頭排列才買進。適合強勢趨勢股。" },
  rsi_oversold:     { name: "RSI 超賣反彈",   tag: "反轉", color: "#ce93d8", desc: "RSI<30 買進，RSI>70 賣出。適合震盪橫盤市場。" },
  kd_cross:         { name: "KD 黃金交叉",    tag: "反轉", color: "#f48fb1", desc: "低檔 KD 黃金交叉買進，高檔死亡交叉賣出。" },
  macd_cross:       { name: "MACD 黃金交叉",  tag: "趨勢", color: "#80cbc4", desc: "MACD 線上穿訊號線買進，適合中長線趨勢操作。" },
  bollinger:        { name: "布林通道突破",    tag: "突破", color: "#ffcc80", desc: "價格突破上軌買進，跌破下軌賣出。" },
  bollinger_revert: { name: "布林通道反轉",    tag: "反轉", color: "#ffb74d", desc: "價格觸碰下軌反彈買進，觸碰上軌賣出。" },
  volume_breakout:  { name: "量增突破",        tag: "突破", color: "#a5d6a7", desc: "量增超過5日均量2倍且價格創新高買進。" },
  turtle:           { name: "海龜突破策略",    tag: "突破", color: "#ef9a9a", desc: "突破20日高點買進，跌破10日低點賣出。" },
  rsi_ma:           { name: "RSI + MA 組合",  tag: "組合", color: "#b39ddb", desc: "RSI 在 40~65 健康區間且股價在 MA20 上方才買進。" },
  custom:           { name: "自訂策略",        tag: "自訂", color: "#90caf9", desc: "自行勾選多個指標組合條件。" },
};

const STRATEGY_DETAILS = [
  { type: "趨勢類", items: [
    { name: "MA 黃金交叉", lines: "MA5、MA20", meaning: "MA5 代表短期趨勢，MA20 代表中期趨勢。MA5 上穿 MA20 代表短期動能超越中期，趨勢轉強。" },
    { name: "三線多頭排列", lines: "MA5、MA20、MA60", meaning: "三條均線由上到下排列（MA5>MA20>MA60），代表短中長期趨勢全部向上，是最強的趨勢確認訊號。" },
    { name: "MACD 黃金交叉", lines: "MACD線、訊號線、柱狀圖", meaning: "MACD線是12日EMA減26日EMA，訊號線是MACD的9日均線。MACD線上穿訊號線代表動能由弱轉強。" },
  ]},
  { type: "反轉類", items: [
    { name: "RSI 超賣反彈", lines: "RSI(14)", meaning: "RSI 衡量一段時間內漲跌幅的比例，範圍 0～100。低於 30 代表超賣，從超賣區回升是反彈訊號；高於 70 代表超買，是賣出訊號。" },
    { name: "KD 黃金交叉", lines: "K值、D值", meaning: "K值是快線（較敏感），D值是慢線（較平滑）。K值從低檔（<50）上穿D值代表動能轉強；K值從高檔（>50）下穿D值代表動能轉弱。" },
    { name: "布林通道反轉", lines: "上軌、中軌（MA20）、下軌", meaning: "布林通道用標準差計算上下軌。價格觸碰下軌代表跌過頭，預期反彈；觸碰上軌代表漲過頭，預期回落。" },
  ]},
  { type: "突破類", items: [
    { name: "布林通道突破", lines: "上軌、中軌（MA20）、下軌", meaning: "與布林通道反轉相反。價格突破上軌代表強勢突破，追漲買進；跌破下軌代表強勢破底，出場。" },
    { name: "量增突破", lines: "MA20、成交量、5日均量", meaning: "當成交量超過5日均量2倍且同時創新高，代表有大量資金湧入，是主力介入的訊號。" },
    { name: "海龜突破策略", lines: "20日最高價、10日最低價", meaning: "源自 1983 年的海龜交易系統。突破20日高點代表趨勢確立向上；跌破10日低點代表趨勢反轉，出場止損。" },
  ]},
  { type: "組合類", items: [
    { name: "RSI + MA 組合", lines: "RSI(14)、MA20", meaning: "結合趨勢和動能兩個維度。RSI 在 40～65 的健康區間代表有動能但未過熱；股價在 MA20 上方代表趨勢向上。" },
    { name: "自訂策略", lines: "MA、RSI、KD、MACD、成交量（可自選）", meaning: "由使用者自行組合多個指標，所有勾選條件同時成立才買進，任一賣出條件觸發就出場。" },
  ]},
];

const MARKET_STRATEGY = [
  { market: "單邊上漲趨勢", strategies: ["三線多頭排列", "MACD 黃金交叉", "海龜突破策略"], color: "#4caf50" },
  { market: "震盪橫盤", strategies: ["RSI 超賣反彈", "KD 黃金交叉", "布林通道反轉"], color: "#64b5f6" },
  { market: "剛開始上漲", strategies: ["MA 黃金交叉", "量增突破", "布林通道突破"], color: "#ffd54f" },
  { market: "不確定市場", strategies: ["RSI + MA 組合", "自訂策略"], color: "#ce93d8" },
];

// ─── 技術指標 ─────────────────────────────────────────────
function calcMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((s, d) => s + d.close, 0) / period;
  });
}
function calcEMA(data, period) {
  const k = 2 / (period + 1); const ema = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { ema.push(data[i].close); continue; }
    ema.push(data[i].close * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
function calcMACD(data) {
  const ema12 = calcEMA(data, 12); const ema26 = calcEMA(data, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine.map(v => ({ close: v })), 9);
  return { macdLine, signal, histogram: macdLine.map((v, i) => v - signal[i]) };
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
    const hh = Math.max(...slice.map(s => s.high)); const ll = Math.min(...slice.map(s => s.low));
    const rsv = hh === ll ? 50 : (data[i].close - ll) / (hh - ll) * 100;
    const kv = i === period - 1 ? rsv : k[i - 1] * 2 / 3 + rsv / 3;
    k.push(kv); d.push(i === period - 1 ? kv : d[i - 1] * 2 / 3 + kv / 3);
  }
  return { k, d };
}
function calcBollinger(data, period = 20, mult = 2) {
  const ma = calcMA(data, period);
  return data.map((_, i) => {
    if (ma[i] === null) return { mid: null, upper: null, lower: null };
    const slice = data.slice(Math.max(0, i - period + 1), i + 1);
    const std = Math.sqrt(slice.reduce((s, d) => s + Math.pow(d.close - ma[i], 2), 0) / slice.length);
    return { mid: ma[i], upper: ma[i] + mult * std, lower: ma[i] - mult * std };
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

// ─── 股性分析 ──────────────────────────────────────────────
function calcStockPersonality(data, backtestResults) {
  if (!data || data.length < 20) return null;

  // 1. 波動率：近 60 日每日漲跌幅標準差（年化）
  const returns = [];
  for (let i = 1; i < data.length; i++) {
    returns.push((data[i].close - data[i-1].close) / data[i-1].close);
  }
  const recentReturns = returns.slice(-60);
  const meanR = recentReturns.reduce((s, v) => s + v, 0) / recentReturns.length;
  const variance = recentReturns.reduce((s, v) => s + Math.pow(v - meanR, 2), 0) / recentReturns.length;
  const dailyVol = Math.sqrt(variance);
  const annualVol = dailyVol * Math.sqrt(252) * 100;

  // 2. 趨勢性：MA5 在 MA20 以上的比例（近 60 日）
  const ma5arr = calcMA(data, 5);
  const ma20arr = calcMA(data, 20);
  const lookback = Math.min(60, data.length - 20);
  let trendCount = 0;
  for (let i = data.length - lookback; i < data.length; i++) {
    if (ma5arr[i] !== null && ma20arr[i] !== null && ma5arr[i] > ma20arr[i]) trendCount++;
  }
  const trendRatio = trendCount / lookback;

  // 3. 均值回歸傾向：偏離 MA20 後下一根往回靠近的比例
  let reversionCount = 0, reversionTotal = 0;
  for (let i = 20; i < data.length - 1; i++) {
    if (ma20arr[i] === null) continue;
    const dev = (data[i].close - ma20arr[i]) / ma20arr[i];
    if (Math.abs(dev) > 0.03) {
      reversionTotal++;
      const nextDev = (data[i+1].close - ma20arr[i]) / ma20arr[i];
      if (Math.abs(nextDev) < Math.abs(dev)) reversionCount++;
    }
  }
  const reversionRatio = reversionTotal > 0 ? reversionCount / reversionTotal : 0.5;

  // 4. 平均持倉天數
  const avgHoldDays = (() => {
    if (!backtestResults || backtestResults.sellTrades.length === 0) return 0;
    const buys = backtestResults.trades.filter(t => t.type === "buy");
    const sells = backtestResults.sellTrades;
    const pairs = Math.min(buys.length, sells.length);
    if (pairs === 0) return 0;
    let total = 0;
    for (let i = 0; i < pairs; i++) {
      total += (new Date(sells[i].date) - new Date(buys[i].date)) / 86400000;
    }
    return (total / pairs).toFixed(0);
  })();

  // 5. 股性判定
  let personality, personalityColor, personalityDesc;
  if (annualVol < 25 && trendRatio > 0.55) {
    personality = "穩健趨勢型"; personalityColor = "#4caf50";
    personalityDesc = "波動低、趨勢穩定，適合中長線趨勢策略，不適合短線頻繁交易。";
  } else if (annualVol >= 25 && annualVol < 45 && trendRatio > 0.55) {
    personality = "強勢趨勢型"; personalityColor = "#ef5350";
    personalityDesc = "波動中等偏高但趨勢明確，適合趨勢追蹤策略，需設停損控制風險。";
  } else if (annualVol >= 45) {
    personality = "高波動投機型"; personalityColor = "#ff7043";
    personalityDesc = "波動極大，趨勢不穩，不建議無停損操作，適合短線或反轉策略。";
  } else if (reversionRatio > 0.58) {
    personality = "震盪均值回歸型"; personalityColor = "#64b5f6";
    personalityDesc = "價格容易在 MA20 附近來回，適合 RSI 超賣反彈、布林通道反轉等策略。";
  } else {
    personality = "混合型"; personalityColor = "#ffd54f";
    personalityDesc = "無明顯偏性，各類策略效果接近，建議用策略比較功能找最佳選項。";
  }

  return {
    annualVol: annualVol.toFixed(1),
    trendRatio: (trendRatio * 100).toFixed(0),
    reversionRatio: (reversionRatio * 100).toFixed(0),
    avgHoldDays,
    personality, personalityColor, personalityDesc,
    totalDays: data.length,
  };
}

// ─── 策略推薦 ──────────────────────────────────────────────
function recommendStrategies(personality) {
  const rules = {
    "穩健趨勢型":     { best: ["ma_triple","macd_cross","turtle"],      good: ["ma_cross","rsi_ma"],          avoid: ["rsi_oversold","bollinger_revert","kd_cross"], reason: "趨勢穩定，適合順勢策略；均值回歸策略容易錯過主升段。" },
    "強勢趨勢型":     { best: ["turtle","ma_triple","volume_breakout"],  good: ["macd_cross","bollinger","ma_cross"], avoid: ["rsi_oversold","bollinger_revert"], reason: "波動大且趨勢強，突破策略報酬高；但務必設置停損（建議 8~10%）。" },
    "高波動投機型":   { best: ["rsi_oversold","bollinger_revert","kd_cross"], good: ["bollinger","rsi_ma"],   avoid: ["ma_triple","turtle","macd_cross"],    reason: "趨勢不穩定，反轉策略較能掌握短期波動；停損設 5~8% 以內。" },
    "震盪均值回歸型": { best: ["rsi_oversold","kd_cross","bollinger_revert"], good: ["rsi_ma","ma_cross"],   avoid: ["turtle","volume_breakout","ma_triple"], reason: "價格容易回歸均線，反轉類策略最有效；突破策略常遭假突破。" },
    "混合型":         { best: ["rsi_ma","ma_cross"],                     good: ["kd_cross","macd_cross","bollinger"], avoid: [],                              reason: "建議先用「比較所有策略」功能找出這段期間最有效的策略再決定。" },
  };
  return rules[personality] || rules["混合型"];
}

// ─── 回測引擎 ─────────────────────────────────────────────
function runBacktest(data, strategy, params, initialCapital, stopLossPct, takeProfitPct) {
  const ma5 = calcMA(data, 5), ma20 = calcMA(data, 20), ma60 = calcMA(data, 60);
  const rsi = calcRSI(data, 14);
  const { k, d } = calcKD(data, 9);
  const { macdLine, signal } = calcMACD(data);
  const boll = calcBollinger(data, 20, 2);
  const volumes = data.map(d => d.volume);
  const avgVol5 = calcMA(data.map(v => ({ close: v.volume })), 5);
  const high20 = data.map((_, i) => i < 20 ? null : Math.max(...data.slice(i - 20, i).map(d => d.high)));
  const low10 = data.map((_, i) => i < 10 ? null : Math.min(...data.slice(i - 10, i).map(d => d.low)));
  let capital = initialCapital, shares = 0, inPosition = false, buyPrice = 0;
  const trades = [], equity = [];
  const slPct = stopLossPct / 100, tpPct = takeProfitPct / 100;

  for (let i = 1; i < data.length; i++) {
    const price = data[i].close;
    let buySignal = false, sellSignal = false, sellReason = "";
    if (inPosition) {
      if (slPct > 0 && price <= buyPrice * (1 - slPct)) { sellSignal = true; sellReason = "停損"; }
      if (tpPct > 0 && price >= buyPrice * (1 + tpPct)) { sellSignal = true; sellReason = "停利"; }
    }
    if (!sellSignal) {
      if (strategy === "ma_cross") {
        if (ma5[i] && ma20[i] && ma5[i-1] && ma20[i-1]) { buySignal = ma5[i] > ma20[i] && ma5[i-1] <= ma20[i-1]; sellSignal = ma5[i] < ma20[i] && ma5[i-1] >= ma20[i-1]; }
      } else if (strategy === "ma_triple") {
        if (ma5[i] && ma20[i] && ma60[i] && ma5[i-1] && ma20[i-1] && ma60[i-1]) { const now = ma5[i] > ma20[i] && ma20[i] > ma60[i]; const prev = ma5[i-1] > ma20[i-1] && ma20[i-1] > ma60[i-1]; buySignal = now && !prev; sellSignal = !now && prev; }
      } else if (strategy === "rsi_oversold") {
        if (rsi[i] !== null && rsi[i-1] !== null) { buySignal = rsi[i-1] < 30 && rsi[i] >= 30; sellSignal = rsi[i] > 70; }
      } else if (strategy === "kd_cross") {
        if (k[i] && d[i] && k[i-1] && d[i-1]) { buySignal = k[i] > d[i] && k[i-1] <= d[i-1] && k[i] < 50; sellSignal = k[i] < d[i] && k[i-1] >= d[i-1] && k[i] > 50; }
      } else if (strategy === "macd_cross") {
        if (macdLine[i] && signal[i] && macdLine[i-1] && signal[i-1]) { buySignal = macdLine[i] > signal[i] && macdLine[i-1] <= signal[i-1]; sellSignal = macdLine[i] < signal[i] && macdLine[i-1] >= signal[i-1]; }
      } else if (strategy === "bollinger") {
        if (boll[i].upper && boll[i-1].upper) { buySignal = data[i-1].close <= boll[i-1].lower && price > boll[i].lower; sellSignal = price > boll[i].upper; }
      } else if (strategy === "bollinger_revert") {
        if (boll[i].upper) { buySignal = price <= boll[i].lower; sellSignal = price >= boll[i].upper; }
      } else if (strategy === "volume_breakout") {
        const avgV = avgVol5[i]; const prevHigh = i > 1 ? Math.max(...data.slice(Math.max(0, i-5), i).map(d => d.high)) : null;
        if (avgV && prevHigh && ma20[i]) { buySignal = volumes[i] > avgV * 2 && price > prevHigh && price > ma20[i]; sellSignal = inPosition && (price < ma20[i] || (rsi[i] && rsi[i] > 75)); }
      } else if (strategy === "turtle") {
        if (high20[i] && low10[i]) { buySignal = price > high20[i]; sellSignal = price < low10[i]; }
      } else if (strategy === "rsi_ma") {
        if (rsi[i] && ma20[i] && rsi[i-1] && ma20[i-1]) { buySignal = rsi[i] > 40 && rsi[i] < 65 && price > ma20[i] && !(rsi[i-1] > 40 && rsi[i-1] < 65 && data[i-1].close > ma20[i-1]); sellSignal = rsi[i] > 70 || price < ma20[i]; }
      } else if (strategy === "custom") {
        const conds = [];
        if (params.useMA && ma5[i] && ma20[i]) conds.push(ma5[i] > ma20[i]);
        if (params.useRSI && rsi[i]) conds.push(rsi[i] > 40 && rsi[i] < 65);
        if (params.useKD && k[i]) conds.push(k[i] > d[i]);
        if (params.useMACD && macdLine[i]) conds.push(macdLine[i] > signal[i]);
        if (params.useVol && avgVol5[i]) conds.push(volumes[i] > avgVol5[i] * 1.5);
        buySignal = conds.length > 0 && conds.every(Boolean) && !inPosition;
        const sc = [];
        if (params.useMA && ma5[i] && ma20[i]) sc.push(ma5[i] < ma20[i]);
        if (params.useRSI && rsi[i]) sc.push(rsi[i] > 70);
        if (params.useMACD && macdLine[i]) sc.push(macdLine[i] < signal[i]);
        sellSignal = sc.some(Boolean);
      }
    }
    if (buySignal && !inPosition && capital > price * 1000) {
      shares = Math.floor(capital / (price * 1000)) * 1000;
      capital -= shares * price; buyPrice = price; inPosition = true;
      trades.push({ type: "buy", date: data[i].date, price, shares });
    } else if (sellSignal && inPosition) {
      capital += shares * price;
      const profit = (price - buyPrice) * shares;
      trades.push({ type: "sell", date: data[i].date, price, shares, profit, profitPct: ((price - buyPrice) / buyPrice * 100).toFixed(2), reason: sellReason || "策略訊號" });
      shares = 0; inPosition = false;
    }
    equity.push({ date: data[i].date, value: capital + shares * price });
  }
  if (inPosition) {
    const lp = data[data.length - 1].close; capital += shares * lp;
    trades.push({ type: "sell", date: data[data.length-1].date, price: lp, shares, profit: (lp - buyPrice) * shares, profitPct: ((lp - buyPrice) / buyPrice * 100).toFixed(2), reason: "期末結算" });
  }
  const sells = trades.filter(t => t.type === "sell");
  return {
    trades, equity,
    totalReturn: ((capital - initialCapital) / initialCapital * 100).toFixed(2),
    winRate: sells.length > 0 ? (sells.filter(t => t.profit > 0).length / sells.length * 100).toFixed(1) : 0,
    maxDrawdown: calcMaxDrawdown(equity, initialCapital),
    finalCapital: capital, sellTrades: sells,
  };
}

// ─── 資料抓取 ─────────────────────────────────────────────
async function fetchYahoo(code, startTs, endTs, tStart, endDate) {
  try {
    const res = await fetch(`/api/yahoo?code=${encodeURIComponent(code)}&startTs=${startTs}&endTs=${endTs}`);
    if (!res.ok) return [];
    const wrapper = await res.json();
    if (!wrapper.data) return [];
    const result = wrapper.data?.chart?.result?.[0];
    if (!result?.timestamp) return [];
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    return timestamp.map((ts, i) => {
      const date = new Date(ts * 1000);
      const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      return { date: iso, open: quote.open[i] ? +quote.open[i].toFixed(2) : null, high: quote.high[i] ? +quote.high[i].toFixed(2) : null, low: quote.low[i] ? +quote.low[i].toFixed(2) : null, close: quote.close[i] ? +quote.close[i].toFixed(2) : null, volume: quote.volume[i] || 0 };
    }).filter(d => d.close !== null && d.date >= tStart && d.date <= endDate);
  } catch(e) { return []; }
}

async function fetchMergedData(code, startDate, endDate, token) {
  const CUTOFF = "2025-04-01";
  let finmindData = [], recentData = [];

  // FinMind：抓歷史段
  if (startDate < CUTOFF) {
    const fEnd = endDate < CUTOFF ? endDate : CUTOFF;
    try {
      const res = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startDate}&end_date=${fEnd}&token=${token}`);
      const json = await res.json();
      if (json.data?.length) {
        finmindData = json.data.map(d => ({ date: d.date, open: parseFloat(d.open), high: parseFloat(d.max), low: parseFloat(d.min), close: parseFloat(d.close), volume: parseFloat(d.Trading_Volume) }));
      } else if (json.msg && json.msg !== "success") {
        throw new Error(`FinMind 錯誤：${json.msg}`);
      }
    } catch(e) {
      if (e.message.startsWith("FinMind")) throw e;
    }
  }

  // Yahoo（透過 /api/yahoo 伺服器端代理）：抓近期段
  if (endDate >= CUTOFF) {
    const tStart = startDate > CUTOFF ? startDate : CUTOFF;
    const startTs = Math.floor(new Date(tStart).getTime() / 1000);
    const endTs = Math.floor(new Date(endDate).getTime() / 1000) + 86400;
    recentData = await fetchYahoo(code, startTs, endTs, tStart, endDate);
  }

  const seen = new Set();
  const merged = [...finmindData, ...recentData]
    .filter(d => { if (!d.date || seen.has(d.date)) return false; seen.add(d.date); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (merged.length === 0) {
    if (finmindData.length === 0 && startDate < CUTOFF && recentData.length === 0 && endDate >= CUTOFF)
      throw new Error(`找不到股票 ${code} 的資料。請確認：(1) 代號是否正確 (2) FinMind Token 是否有效`);
    if (finmindData.length === 0 && startDate < CUTOFF)
      throw new Error(`FinMind 找不到 ${code} 的歷史資料，請確認代號正確且 Token 有效`);
    if (recentData.length === 0 && endDate >= CUTOFF)
      throw new Error(`近期資料（${CUTOFF} 之後）抓取失敗，請縮短結束日期至 ${CUTOFF} 之前，或稍後再試`);
    throw new Error(`找不到股票 ${code} 的資料，請確認代號是否正確`);
  }
  if (merged.length < 25) throw new Error(`資料筆數不足（${merged.length} 筆），請延長時間區間`);
  return merged;
}

// ─── K線圖元件 ────────────────────────────────────────────
const CandlestickChart = ({ data, trades, chartData }) => {
  const [viewRange, setViewRange] = useState({ start: Math.max(0, data.length - 60), end: data.length - 1 });
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [crosshairX, setCrosshairX] = useState(null);
  const [crosshairIdx, setCrosshairIdxState] = useState(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(null);
  const dragRangeSnapshot = useRef(null);

  useEffect(() => {
    setViewRange({ start: Math.max(0, data.length - 60), end: data.length - 1 });
  }, [data.length]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const range = viewRange.end - viewRange.start;
    const delta = e.deltaY > 0 ? 1 : -1;
    const newRange = Math.max(20, Math.min(data.length, range + delta * Math.max(1, Math.ceil(range * 0.1))));
    const center = Math.floor((viewRange.start + viewRange.end) / 2);
    const newStart = Math.max(0, Math.min(data.length - newRange, center - Math.floor(newRange / 2)));
    setViewRange({ start: newStart, end: Math.min(data.length - 1, newStart + newRange - 1) });
  }, [viewRange, data.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.addEventListener("wheel", handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener("wheel", handleWheel); };
  }, [handleWheel]);

  const getSvgIdx = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const visible = viewRange.end - viewRange.start + 1;
    const W = 800, PAD = 50;
    const ratio = (W + PAD) / rect.width;
    const svgX = (clientX - rect.left) * ratio;
    return Math.floor((svgX - PAD / 2) / ((W - PAD / 2) / visible));
  }, [viewRange]);

  const handleMouseDown = useCallback((e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragRangeSnapshot.current = { ...viewRange };
  }, [viewRange]);

  const handleMouseMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const visible = viewRange.end - viewRange.start + 1;
    const idx = getSvgIdx(e.clientX);

    if (idx >= 0 && idx < visible) {
      const W = 800, PAD = 50;
      const colW = Math.max(2, Math.floor((W - PAD) / visible) - 1);
      const x = PAD / 2 + idx * (W - PAD / 2) / visible + colW / 2;
      setCrosshairX(x);
      setCrosshairIdxState(idx);
      const d = data[viewRange.start + idx];
      if (d) {
        const ma5v = chartData?.[viewRange.start + idx]?.ma5;
        const ma20v = chartData?.[viewRange.start + idx]?.ma20;
        const ma60v = chartData?.[viewRange.start + idx]?.ma60;
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, data: d, ma5: ma5v, ma20: ma20v, ma60: ma60v });
      }
    } else {
      setCrosshairX(null); setCrosshairIdxState(null); setTooltip(null);
    }

    if (isDragging.current && dragStartX.current !== null && dragRangeSnapshot.current) {
      const dx = e.clientX - dragStartX.current;
      const range = dragRangeSnapshot.current.end - dragRangeSnapshot.current.start;
      const shift = -Math.round(dx / rect.width * visible * 1.2);
      const newStart = Math.max(0, Math.min(data.length - 1 - range, dragRangeSnapshot.current.start + shift));
      setViewRange({ start: newStart, end: Math.min(data.length - 1, newStart + range) });
    }
  }, [viewRange, data, chartData, getSvgIdx]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; dragStartX.current = null; }, []);
  const handleMouseLeave = useCallback(() => { isDragging.current = false; dragStartX.current = null; setTooltip(null); setCrosshairX(null); setCrosshairIdxState(null); }, []);

  const visible = data.slice(viewRange.start, viewRange.end + 1);
  const W = 800, H = 260, PAD = 50, VOL_H = 50;
  const prices = visible.flatMap(d => [d.high, d.low]).filter(v => v && !isNaN(v));
  if (prices.length === 0) return null;
  const minP = Math.min(...prices) * 0.997;
  const maxP = Math.max(...prices) * 1.003;
  const pRange = maxP - minP || 1;
  const maxVol = Math.max(...visible.map(d => d.volume || 0)) || 1;
  const colW = Math.max(2, Math.floor((W - PAD) / visible.length) - 1);
  const toY = (p) => 8 + (1 - (p - minP) / pRange) * (H - 16);
  const toX = (i) => PAD / 2 + i * (W - PAD / 2) / visible.length + colW / 2;

  const buyDates = new Set(trades?.filter(t => t.type === "buy").map(t => t.date) || []);
  const sellDates = new Set(trades?.filter(t => t.type === "sell").map(t => t.date) || []);

  const crossMA = crosshairIdx !== null && crosshairIdx >= 0 && crosshairIdx < visible.length ? {
    ma5: chartData?.[viewRange.start + crosshairIdx]?.ma5,
    ma20: chartData?.[viewRange.start + crosshairIdx]?.ma20,
    ma60: chartData?.[viewRange.start + crosshairIdx]?.ma60,
  } : null;

  return (
    <div ref={containerRef} style={{ position: "relative", userSelect: "none", width: "100%", cursor: isDragging.current ? "grabbing" : "crosshair" }}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}>

      <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 6, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span>🖱 滾輪縮放 · 拖曳平移</span>
        <span>顯示 {visible.length} 根（共 {data.length} 根）</span>
        <span style={{ color: "#ffd54f" }}>━ MA5</span>
        <span style={{ color: "#ef9a9a" }}>━ MA20</span>
        <span style={{ color: "#a5d6a7" }}>━ MA60</span>
        <span style={{ color: "#ef5350" }}>█ 漲</span>
        <span style={{ color: "#4caf50" }}>█ 跌</span>
      </div>

      {tooltip && (
        <div style={{
          position: "absolute",
          left: tooltip.x > (containerRef.current?.offsetWidth || 500) * 0.6 ? tooltip.x - 155 : tooltip.x + 12,
          top: Math.max(0, tooltip.y - 110),
          background: "#0f1923", border: "1px solid #1e3a4f", borderRadius: 8,
          padding: "8px 12px", fontSize: 11, zIndex: 10, pointerEvents: "none",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)", minWidth: 145,
        }}>
          <div style={{ color: "#64b5f6", fontWeight: 700, marginBottom: 5 }}>{tooltip.data.date}</div>
          <div style={{ color: "#90caf9" }}>開：{tooltip.data.open?.toFixed(2)}</div>
          <div style={{ color: "#90caf9" }}>高：{tooltip.data.high?.toFixed(2)}</div>
          <div style={{ color: "#90caf9" }}>低：{tooltip.data.low?.toFixed(2)}</div>
          <div style={{ color: tooltip.data.close >= tooltip.data.open ? "#ef5350" : "#4caf50", fontWeight: 700 }}>
            收：{tooltip.data.close?.toFixed(2)}
          </div>
          <div style={{ borderTop: "1px solid #1e3a4f", marginTop: 4, paddingTop: 4 }}>
            {tooltip.ma5 && <div style={{ color: "#ffd54f" }}>MA5：{tooltip.ma5}</div>}
            {tooltip.ma20 && <div style={{ color: "#ef9a9a" }}>MA20：{tooltip.ma20}</div>}
            {tooltip.ma60 && <div style={{ color: "#a5d6a7" }}>MA60：{tooltip.ma60}</div>}
          </div>
          <div style={{ color: "#546e7a", marginTop: 2 }}>量：{((tooltip.data.volume || 0) / 1000).toFixed(0)}K</div>
        </div>
      )}

      <svg width="100%" viewBox={`0 0 ${W + PAD} ${H + VOL_H + 20}`} style={{ overflow: "visible" }}>
        {/* 格線 */}
        {[0, 0.25, 0.5, 0.75, 1].map(r => {
          const price = maxP - r * pRange; const y = toY(price);
          return <g key={r}><line x1={0} y1={y} x2={W} y2={y} stroke="#0d2a3a" strokeDasharray="4 4" /><text x={W + 2} y={y + 4} fill="#546e7a" fontSize={9}>{price.toFixed(1)}</text></g>;
        })}

        {/* MA 線 */}
        {[{ key: "ma5", c: "#ffd54f" }, { key: "ma20", c: "#ef9a9a" }, { key: "ma60", c: "#a5d6a7" }].map(({ key, c }) => {
          const pts = visible.map((_, i) => { const v = chartData?.[viewRange.start + i]?.[key]; return v ? `${toX(i)},${toY(v)}` : null; }).filter(Boolean);
          return pts.length > 1 ? <polyline key={key} points={pts.join(" ")} fill="none" stroke={c} strokeWidth={1} opacity={0.85} /> : null;
        })}

        {/* K棒 */}
        {visible.map((d, i) => {
          if (!d.open || !d.close || !d.high || !d.low) return null;
          const x = toX(i);
          const isUp = d.close >= d.open;
          const color = isUp ? "#ef5350" : "#4caf50";
          const bodyTop = toY(Math.max(d.open, d.close));
          const bodyH = Math.max(1, toY(Math.min(d.open, d.close)) - bodyTop);
          return (
            <g key={i}>
              <line x1={x} y1={toY(d.high)} x2={x} y2={toY(d.low)} stroke={color} strokeWidth={1} />
              <rect x={x - colW / 2} y={bodyTop} width={colW} height={bodyH} fill={color} />
              {buyDates.has(d.date) && <text x={x} y={toY(d.low) + 12} textAnchor="middle" fill="#4caf50" fontSize={10} fontWeight="bold">▲</text>}
              {sellDates.has(d.date) && <text x={x} y={toY(d.high) - 4} textAnchor="middle" fill="#ef5350" fontSize={10} fontWeight="bold">▼</text>}
            </g>
          );
        })}

        {/* 十字線 + MA 圓點 */}
        {crosshairX !== null && (
          <g>
            <line x1={crosshairX} y1={0} x2={crosshairX} y2={H + VOL_H + 20} stroke="#64b5f6" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.7} />
            {crossMA?.ma5 && <circle cx={crosshairX} cy={toY(crossMA.ma5)} r={3.5} fill="#ffd54f" stroke="#060e17" strokeWidth={1.5} />}
            {crossMA?.ma20 && <circle cx={crosshairX} cy={toY(crossMA.ma20)} r={3.5} fill="#ef9a9a" stroke="#060e17" strokeWidth={1.5} />}
            {crossMA?.ma60 && <circle cx={crosshairX} cy={toY(crossMA.ma60)} r={3.5} fill="#a5d6a7" stroke="#060e17" strokeWidth={1.5} />}
          </g>
        )}

        {/* 日期 */}
        {visible.filter((_, i) => i % Math.max(1, Math.ceil(visible.length / 7)) === 0).map((d, idx) => {
          const i = visible.indexOf(d);
          return <text key={idx} x={toX(i)} y={H + 14} fill="#546e7a" fontSize={8} textAnchor="middle">{d.date?.slice(5)}</text>;
        })}

        {/* 成交量 */}
        {visible.map((d, i) => {
          if (!d.volume) return null;
          const volH = (d.volume / maxVol) * (VOL_H - 4);
          const isUp = d.close >= d.open;
          return <rect key={i} x={toX(i) - colW / 2} y={H + 20 + VOL_H - 4 - volH} width={colW} height={volH} fill={isUp ? "#ef535055" : "#4caf5055"} />;
        })}
      </svg>
    </div>
  );
};

// ─── UI 元件 ──────────────────────────────────────────────
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
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0f1923", border: "1px solid #ef5350", borderRadius: 14, padding: "32px 36px", maxWidth: 440, width: "90%", boxShadow: "0 0 50px rgba(239,83,80,0.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span style={{ color: "#ef5350", fontSize: 17, fontWeight: 700 }}>發生錯誤</span>
        </div>
        <div style={{ color: "#e0f0ff", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#546e7a", fontSize: 11 }}>⏱ 6 秒後自動關閉</span>
          <button onClick={onClose} style={{ background: "#ef5350", border: "none", borderRadius: 8, color: "#fff", padding: "9px 24px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>關閉</button>
        </div>
      </div>
    </div>
  );
};

// ─── 主元件 ───────────────────────────────────────────────
export default function App() {
  const [stockCode, setStockCode] = useState("2330");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2026-04-24");
  const [strategy, setStrategy] = useState("ma_cross");
  const [initialCapital, setInitialCapital] = useState(1000000);
  const [stopLoss, setStopLoss] = useState(0);
  const [takeProfit, setTakeProfit] = useState(0);
  const [finmindToken, setFinmindToken] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [stockData, setStockData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [backtestResult, setBacktestResult] = useState(null);
  const [activeTab, setActiveTab] = useState("chart");
  const [customParams, setCustomParams] = useState({ useMA: true, useRSI: true, useKD: false, useMACD: false, useVol: false });
  const [allResults, setAllResults] = useState(null);
  const [multiCodes, setMultiCodes] = useState("2330,2317");
  const [multiResults, setMultiResults] = useState(null);
  const [claudeAnalysis, setClaudeAnalysis] = useState("");
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [splitResult, setSplitResult] = useState(null);
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [stockPersonality, setStockPersonality] = useState(null);
  const [claudeOutlook, setClaudeOutlook] = useState("");
  const [claudeOutlookLoading, setClaudeOutlookLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!finmindToken) { setError("請先輸入 FinMind Token 才能開始分析"); return; }
    if (!stockCode) { setError("請輸入股票代號"); return; }
    if (startDate >= endDate) { setError("開始日期必須早於結束日期"); return; }
    setLoading(true); setError(""); setBacktestResult(null); setAllResults(null); setClaudeAnalysis(""); setStockPersonality(null); setClaudeOutlook("");
    try {
      setLoadingMsg("📡 抓取股價資料中...");
      const data = await fetchMergedData(stockCode, startDate, endDate, finmindToken);
      setLoadingMsg("📊 計算技術指標中...");
      const ma5 = calcMA(data, 5), ma20 = calcMA(data, 20), ma60 = calcMA(data, 60);
      const rsi = calcRSI(data);
      const { k, d } = calcKD(data);
      const { macdLine, signal, histogram } = calcMACD(data);
      const boll = calcBollinger(data, 20, 2);
      const chart = data.map((d, i) => ({
        date: d.date.slice(5), close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume,
        ma5: ma5[i] ? +ma5[i].toFixed(2) : null, ma20: ma20[i] ? +ma20[i].toFixed(2) : null, ma60: ma60[i] ? +ma60[i].toFixed(2) : null,
        rsi: rsi[i] ? +rsi[i].toFixed(2) : null, k: k[i] ? +k[i].toFixed(2) : null, d: d[i] ? +d[i].toFixed(2) : null,
        macd: macdLine[i] ? +macdLine[i].toFixed(3) : null, signal: signal[i] ? +signal[i].toFixed(3) : null, histogram: histogram[i] ? +histogram[i].toFixed(3) : null,
        bollUpper: boll[i].upper ? +boll[i].upper.toFixed(2) : null, bollMid: boll[i].mid ? +boll[i].mid.toFixed(2) : null, bollLower: boll[i].lower ? +boll[i].lower.toFixed(2) : null,
      }));
      setStockData(data); setChartData(chart);
      setLoadingMsg("🔬 執行回測中...");
      const params = strategy === "custom" ? customParams : {};
      const result = runBacktest(data, strategy, params, initialCapital, stopLoss, takeProfit);
      setBacktestResult(result);
      setStockPersonality(calcStockPersonality(data, result));
      setActiveTab("chart");
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const handleCompareAll = async () => {
    if (!stockData) return;
    setLoading(true); setLoadingMsg("🔬 比較所有策略中...");
    try {
      const results = {};
      for (const [key] of Object.entries(STRATEGIES)) results[key] = runBacktest(stockData, key, key === "custom" ? customParams : {}, initialCapital, stopLoss, takeProfit);
      setAllResults(results); setActiveTab("compare_all");
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const handleMultiStock = async () => {
    if (!finmindToken) { setError("請先輸入 FinMind Token"); return; }
    const codes = multiCodes.split(",").map(c => c.trim()).filter(Boolean);
    if (codes.length < 2) { setError("請輸入至少兩個股票代號"); return; }
    setLoading(true);
    try {
      const results = [];
      for (const code of codes) {
        setLoadingMsg(`📡 抓取 ${code} 中...`);
        const data = await fetchMergedData(code, startDate, endDate, finmindToken);
        const first = data[0].close;
        results.push({ code, normalized: data.map(d => ({ date: d.date.slice(5), [code]: +((d.close - first) / first * 100).toFixed(2) })), backtest: runBacktest(data, strategy, strategy === "custom" ? customParams : {}, initialCapital, stopLoss, takeProfit) });
      }
      setMultiResults(results); setActiveTab("multi_stock");
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  // 分段回測驗證
  const handleSplitValidation = () => {
    if (!stockData) return;
    const mid = Math.floor(stockData.length / 2);
    const firstHalf = stockData.slice(0, mid);
    const secondHalf = stockData.slice(mid);
    const params = strategy === "custom" ? customParams : {};
    const r1 = runBacktest(firstHalf, strategy, params, initialCapital, stopLoss, takeProfit);
    const r2 = runBacktest(secondHalf, strategy, params, initialCapital, stopLoss, takeProfit);
    const midDate = stockData[mid].date;
    const consistent = (parseFloat(r1.totalReturn) > 0) === (parseFloat(r2.totalReturn) > 0);
    setSplitResult({ r1, r2, midDate, consistent, firstStart: stockData[0].date, firstEnd: stockData[mid-1].date, secondStart: midDate, secondEnd: stockData[stockData.length-1].date });
    setActiveTab("split");
  };

  // 最佳參數搜尋
  const handleOptimize = () => {
    if (!stockData) return;
    setLoading(true); setLoadingMsg("🔍 搜尋最佳參數中...");
    setTimeout(() => {
      try {
        const params = strategy === "custom" ? customParams : {};
        const slOptions = [0, 3, 5, 8, 10, 15];
        const tpOptions = [0, 5, 10, 15, 20, 30];
        const results = [];
        for (const sl of slOptions) {
          for (const tp of tpOptions) {
            const r = runBacktest(stockData, strategy, params, initialCapital, sl, tp);
            results.push({ sl, tp, totalReturn: parseFloat(r.totalReturn), winRate: parseFloat(r.winRate), maxDrawdown: parseFloat(r.maxDrawdown), trades: r.sellTrades.length });
          }
        }
        results.sort((a, b) => b.totalReturn - a.totalReturn);
        setOptimizeResult(results);
        setActiveTab("optimize");
      } catch(e) { setError(e.message); }
      setLoading(false); setLoadingMsg("");
    }, 100);
  };

  // 大盤對照（0050）
  const handleBenchmark = async () => {
    if (!stockData || !finmindToken) { setError("請先執行回測再對照大盤"); return; }
    setLoading(true); setLoadingMsg("📡 抓取 0050 大盤資料中...");
    try {
      const benchData = await fetchMergedData("0050", startDate, endDate, finmindToken);
      const stockFirst = stockData[0].close;
      const benchFirst = benchData[0].close;
      const merged = stockData.map(d => {
        const bench = benchData.find(b => b.date === d.date);
        return {
          date: d.date.slice(5),
          [stockCode]: +((d.close - stockFirst) / stockFirst * 100).toFixed(2),
          "0050": bench ? +((bench.close - benchFirst) / benchFirst * 100).toFixed(2) : null,
        };
      }).filter(d => d["0050"] !== null);
      setBenchmarkData(merged);
      setActiveTab("benchmark");
    } catch(e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  };

  const handleClaudeAnalysis = async () => {
    if (!claudeKey) { setError("請輸入 Claude API Key 才能使用 AI 分析"); return; }
    if (!backtestResult) { setError("請先執行回測再進行 AI 分析"); return; }
    setClaudeLoading(true); setClaudeAnalysis("");
    try {
      const summary = `股票：${stockCode}\n策略：${STRATEGIES[strategy]?.name}\n時間：${startDate} ~ ${endDate}\n初始資金：${(initialCapital/10000).toFixed(0)}萬\n停損：${stopLoss > 0 ? stopLoss + "%" : "無"}\n停利：${takeProfit > 0 ? takeProfit + "%" : "無"}\n總報酬率：${backtestResult.totalReturn}%\n勝率：${backtestResult.winRate}%（${backtestResult.sellTrades.filter(t=>t.profit>0).length}勝${backtestResult.sellTrades.filter(t=>t.profit<=0).length}敗）\n最大回撤：${backtestResult.maxDrawdown}%\n最終資金：${(backtestResult.finalCapital/10000).toFixed(0)}萬\n交易次數：${backtestResult.sellTrades.length}次\n最近5筆：${backtestResult.sellTrades.slice(-5).map(t => `${t.date} ${t.profitPct}%(${t.reason})`).join("、")}`;
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: claudeKey,
          body: {
            model: "claude-haiku-4-5-20251001", max_tokens: 800,
            messages: [{ role: "user", content: `你是台股量化分析師，以下是一個回測結果，請給出專業分析和改進建議：\n\n${summary}\n\n請用以下格式回答，不要使用Markdown符號：\n\n📊 整體評估：\n（評估這個策略的表現好壞，50字以內）\n\n✅ 優點：\n（列出2-3個策略的優點）\n\n⚠️ 缺點與風險：\n（列出2-3個需要注意的問題）\n\n💡 改進建議：\n（給出3個具體的改進方向）\n\n🎯 結論：\n（是否建議使用這個策略，30字以內）` }],
          }
        }),
      });
      const json = await res.json();
      setClaudeAnalysis(json.content?.[0]?.text || "分析失敗，請重試");
    } catch(e) { setError("Claude API 呼叫失敗：" + e.message); }
    setClaudeLoading(false);
  };

  const handleClaudeOutlook = async () => {
    if (!claudeKey) { setError("請輸入 Claude API Key"); return; }
    if (!stockData || !stockPersonality) { setError("請先執行回測"); return; }
    setClaudeOutlookLoading(true); setClaudeOutlook("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const recentPrices = stockData.slice(-10).map(d => `${d.date} 收${d.close}`).join("、");
      const prompt = `你是台股分析師。請幫我分析台股代號「${stockCode}」的近期走勢與後市展望。

【技術面資訊】
- 股性：${stockPersonality.personality}（${stockPersonality.personalityDesc}）
- 年化波動率：${stockPersonality.annualVol}%
- 近期趨勢強度（MA5>MA20 佔比）：${stockPersonality.trendRatio}%
- 均值回歸傾向：${stockPersonality.reversionRatio}%
- 最近 10 個交易日收盤：${recentPrices}
- 回測策略（${STRATEGIES[strategy]?.name}）報酬率：${backtestResult?.totalReturn}%，勝率：${backtestResult?.winRate}%

【今日日期】${today}

請用網路搜尋這支股票最新的消息（包含法說會、營收公告、產業動態、總體經濟影響等），然後給出以下分析：

📡 最新動態：
（根據搜尋結果，說明這支股票最近 1~3 個月的重要事件，約 100 字）

📈 技術面判讀：
（根據上方技術指標，說明目前股票處於什麼技術位置，約 60 字）

🔮 後市展望：
（結合時事與技術面，給出近期 1~3 個月可能走勢，標明偏多/偏空/盤整，約 80 字）

⚠️ 主要風險：
（列出 2~3 個需要留意的風險因素）

請不要使用 Markdown 符號，直接用純文字輸出。`;

      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: claudeKey,
          body: {
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 1200,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: prompt }],
          }
        }),
      });
      const json = await res.json();
      if (json.error) {
        setClaudeOutlook(`API 錯誤：${json.error.message || JSON.stringify(json.error)}`);
        setClaudeOutlookLoading(false);
        return;
      }
      const text = (json.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");
      setClaudeOutlook(text || `分析失敗，API 回傳：${JSON.stringify(json, null, 2)}`);
    } catch(e) { setError("Claude API 呼叫失敗：" + e.message); }
    setClaudeOutlookLoading(false);
  };

  const inp = { background: "#0d1b26", border: "1px solid #1e3a4f", borderRadius: 6, color: "#e0f0ff", padding: "8px 12px", fontSize: 13, width: "100%", outline: "none" };
  const tabBtn = (t) => ({ padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: activeTab === t ? "#1565c0" : "transparent", color: activeTab === t ? "#fff" : "#78909c", transition: "all 0.2s", whiteSpace: "nowrap" });
  const statBox = (label, value, color = "#64b5f6", sub = "") => (
    <div style={{ background: "#0d1b26", borderRadius: 10, padding: "14px 18px", border: "1px solid #1e3a4f", flex: 1, minWidth: 110 }}>
      <div style={{ color: "#546e7a", fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: "#546e7a", fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </div>
  );

  const COLORS = ["#64b5f6", "#ffd54f", "#a5d6a7", "#f48fb1", "#ce93d8", "#80cbc4"];
  const mergedMulti = multiResults ? (() => {
    const allDates = [...new Set(multiResults.flatMap(r => r.normalized.map(d => d.date)))].sort();
    return allDates.map(date => { const row = { date }; multiResults.forEach(r => { const pt = r.normalized.find(d => d.date === date); if (pt) row[r.code] = pt[r.code]; }); return row; });
  })() : [];

  // 損益顏色：賺=紅，賠=綠（台灣習慣）
  const profitColor = (val) => parseFloat(val) > 0 ? "#ef5350" : parseFloat(val) < 0 ? "#4caf50" : "#90caf9";

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
          <p style={{ margin: 0, color: "#546e7a", fontSize: 11 }}>Taiwan Stock Backtest · 上市/上櫃皆支援 · 11 種策略 · Claude AI 分析</p>
        </div>
      </div>

      <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
          {[
            ["股票代號", <input style={inp} value={stockCode} onChange={e => setStockCode(e.target.value)} placeholder="上市/上櫃皆可" />],
            ["開始日期", <input style={inp} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />],
            ["結束日期", <input style={inp} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />],
            ["初始資金", <input style={inp} type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} />],
            ["FinMind Token", <input style={inp} type="password" value={finmindToken} onChange={e => setFinmindToken(e.target.value)} placeholder="輸入 Token" />],
            ["Claude API Key", <input style={inp} type="password" value={claudeKey} onChange={e => setClaudeKey(e.target.value)} placeholder="AI分析用（選填）" />],
          ].map(([label, input]) => (
            <div key={label}>
              <label style={{ color: "#546e7a", fontSize: 10, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>
              {input}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: "#ef5350", fontSize: 10, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>停損 % (0=不設定)</label>
            <input style={{ ...inp, borderColor: stopLoss > 0 ? "#ef5350" : "#1e3a4f" }} type="number" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))} min={0} max={50} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={{ color: "#4caf50", fontSize: 10, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>停利 % (0=不設定)</label>
            <input style={{ ...inp, borderColor: takeProfit > 0 ? "#4caf50" : "#1e3a4f" }} type="number" value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))} min={0} max={200} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ color: "#ffd54f", fontSize: 10, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>多股比較（逗號分隔）</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...inp, flex: 1 }} value={multiCodes} onChange={e => setMultiCodes(e.target.value)} placeholder="例如 2330,2317,2454" />
              <button onClick={handleMultiStock} disabled={loading} style={{ background: "#0d2a3a", border: "1px solid #ffd54f", borderRadius: 6, color: "#ffd54f", padding: "8px 12px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>比較</button>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#546e7a", fontSize: 10, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>回測策略</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(STRATEGIES).map(([key, s]) => (
              <button key={key} onClick={() => setStrategy(key)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${strategy === key ? s.color : "#1e3a4f"}`, background: strategy === key ? `${s.color}22` : "transparent", color: strategy === key ? s.color : "#78909c", cursor: "pointer", fontSize: 12, fontWeight: strategy === key ? 700 : 400, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, background: strategy === key ? s.color : "#1e3a4f", color: strategy === key ? "#000" : "#546e7a", borderRadius: 3, padding: "1px 5px" }}>{s.tag}</span>
                {s.name}
              </button>
            ))}
          </div>
          {STRATEGIES[strategy] && <div style={{ color: "#546e7a", fontSize: 11, marginTop: 8, padding: "6px 10px", background: "#0d1b26", borderRadius: 6, borderLeft: `3px solid ${STRATEGIES[strategy].color}` }}>💡 {STRATEGIES[strategy].desc}</div>}
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
          <span style={{ color: "#4caf50", fontSize: 10 }}>● FinMind（2010～2025/3）</span>
          <span style={{ color: "#64b5f6", fontSize: 10 }}>● Yahoo Finance（2025/4～今日）</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleAnalyze} disabled={loading} style={{ background: "linear-gradient(135deg,#1565c0,#0288d1)", border: "none", borderRadius: 8, color: "#fff", padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🔍 開始分析</button>
          <button onClick={handleCompareAll} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #1565c0", borderRadius: 8, color: "#64b5f6", padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>📊 比較所有策略</button>
          <button onClick={handleSplitValidation} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #80cbc4", borderRadius: 8, color: "#80cbc4", padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✂️ 分段驗證</button>
          <button onClick={handleOptimize} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #ce93d8", borderRadius: 8, color: "#ce93d8", padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>🔍 最佳參數</button>
          <button onClick={handleBenchmark} disabled={loading || !stockData} style={{ background: "#0d2a3a", border: "1px solid #ffd54f", borderRadius: 8, color: "#ffd54f", padding: "9px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>📈 大盤對照</button>
        </div>
      </div>

      {backtestResult && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {statBox("總報酬率", `${backtestResult.totalReturn}%`, profitColor(backtestResult.totalReturn))}
          {statBox("勝率", `${backtestResult.winRate}%`, "#64b5f6", `${backtestResult.sellTrades.filter(t=>t.profit>0).length}勝${backtestResult.sellTrades.filter(t=>t.profit<=0).length}敗`)}
          {statBox("最大回撤", `-${backtestResult.maxDrawdown}%`, "#ff7043")}
          {statBox("最終資金", `${(backtestResult.finalCapital/10000).toFixed(0)}萬`, profitColor(backtestResult.totalReturn), `初始${(initialCapital/10000).toFixed(0)}萬`)}
          {statBox("交易次數", backtestResult.sellTrades.length, "#ce93d8", "已完成")}
          {stopLoss > 0 && statBox("停損觸發", backtestResult.sellTrades.filter(t=>t.reason==="停損").length, "#4caf50", `${stopLoss}%`)}
          {takeProfit > 0 && statBox("停利觸發", backtestResult.sellTrades.filter(t=>t.reason==="停利").length, "#ef5350", `${takeProfit}%`)}
        </div>
      )}

      {(chartData.length > 0 || multiResults) && (
        <>
          <div style={{ display: "flex", gap: 3, marginBottom: 14, background: "#0a1520", padding: 5, borderRadius: 8, flexWrap: "wrap" }}>
            {[["chart","📊 K線圖"],["bollinger","📉 布林"],["indicators","📈 RSI/KD"],["macd","〰 MACD"],["equity","💰 資金"],["trades","📋 交易"],["multi_stock","🔄 多股"],["compare_all","🏆 策略比較"],["split","✂️ 分段驗證"],["optimize","🔍 最佳參數"],["benchmark","📈 大盤對照"],["ai_analysis","🤖 AI分析"],["guide","📖 說明"]].map(([t,l]) => (
              <button key={t} style={tabBtn(t)} onClick={() => setActiveTab(t)}>{l}</button>
            ))}
          </div>

          {activeTab === "chart" && stockData && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 13 }}>{stockCode} K線圖</h3>
              <CandlestickChart data={stockData} trades={backtestResult?.trades} chartData={chartData} />
            </div>
          )}

          {activeTab === "bollinger" && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>布林通道 (20, 2σ)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(chartData.length/8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} domain={["auto","auto"]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="close" stroke="#64b5f6" dot={false} strokeWidth={1.5} name="收盤價" />
                  <Line type="monotone" dataKey="bollUpper" stroke="#ef9a9a" dot={false} strokeWidth={1} strokeDasharray="4 2" name="上軌" />
                  <Line type="monotone" dataKey="bollMid" stroke="#ffd54f" dot={false} strokeWidth={1} name="中軌" />
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
                  <Bar dataKey="histogram" name="柱狀">{chartData.map((d, i) => <Cell key={i} fill={d.histogram >= 0 ? "#ef535099" : "#4caf5099"} />)}</Bar>
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
                  <Line type="monotone" dataKey="value" stroke="#ef5350" dot={false} strokeWidth={2} name="資金" />
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
                      {["類型","日期","價格","股數","損益","損益%","原因"].map(h => (
                        <th key={h} style={{ padding: "7px 12px", color: "#546e7a", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backtestResult.trades.map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #0d2a3a" }}>
                        <td style={{ padding: "8px 12px", color: t.type==="buy"?"#4caf50":"#ef5350", fontWeight: 700 }}>{t.type==="buy"?"▲ 買進":"▼ 賣出"}</td>
                        <td style={{ padding: "8px 12px", color: "#90caf9" }}>{t.date}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{t.price.toFixed(2)}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{t.shares?.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: t.profit !== undefined ? profitColor(t.profit) : "#90caf9" }}>
                          {t.profit !== undefined ? `${t.profit > 0 ? "+" : ""}${t.profit.toFixed(0)}` : "-"}
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: t.profitPct !== undefined ? profitColor(t.profitPct) : "#90caf9" }}>
                          {t.profitPct !== undefined ? `${parseFloat(t.profitPct) > 0 ? "+" : ""}${t.profitPct}%` : "-"}
                        </td>
                        <td style={{ padding: "8px 12px", color: t.reason==="停損"?"#4caf50":t.reason==="停利"?"#ef5350":"#546e7a", fontSize: 11 }}>{t.reason||"-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "multi_stock" && multiResults && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 13 }}>多股漲幅比較（基準化）</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={mergedMulti}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                    <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(mergedMulti.length/8)} />
                    <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#546e7a" strokeDasharray="4 2" />
                    {multiResults.map((r, i) => <Line key={r.code} type="monotone" dataKey={r.code} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />)}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>多股回測比較（{STRATEGIES[strategy]?.name}）</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e3a4f" }}>
                        {["股票","總報酬率","勝率","最大回撤","交易次數","最終資金"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", color: "#546e7a", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...multiResults].sort((a,b) => parseFloat(b.backtest.totalReturn) - parseFloat(a.backtest.totalReturn)).map((r, i) => (
                        <tr key={r.code} style={{ borderBottom: "1px solid #0d2a3a", background: i === 0 ? "#0d2a1a" : "transparent" }}>
                          <td style={{ padding: "10px 12px", color: COLORS[multiResults.indexOf(r) % COLORS.length], fontWeight: 700 }}>{i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":""}{r.code}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: profitColor(r.backtest.totalReturn), fontWeight: 700 }}>{parseFloat(r.backtest.totalReturn)>=0?"+":""}{r.backtest.totalReturn}%</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#64b5f6" }}>{r.backtest.winRate}%</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#ff7043" }}>-{r.backtest.maxDrawdown}%</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#ce93d8" }}>{r.backtest.sellTrades.length}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: profitColor(r.backtest.totalReturn) }}>{(r.backtest.finalCapital/10000).toFixed(0)}萬</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
                    {Object.entries(allResults).sort((a,b) => parseFloat(b[1].totalReturn) - parseFloat(a[1].totalReturn)).map(([key, r], i) => (
                      <tr key={key} style={{ borderBottom: "1px solid #0d2a3a", background: i === 0 ? "#0d2a1a" : "transparent" }}>
                        <td style={{ padding: "10px 12px", color: STRATEGIES[key].color, fontWeight: 600 }}>{i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":""}{STRATEGIES[key].name}</td>
                        <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 10, background: "#1e3a4f", color: "#90caf9", borderRadius: 3, padding: "2px 6px" }}>{STRATEGIES[key].tag}</span></td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: profitColor(r.totalReturn), fontWeight: 700 }}>{parseFloat(r.totalReturn)>=0?"+":""}{r.totalReturn}%</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#64b5f6" }}>{r.winRate}%</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#ff7043" }}>-{r.maxDrawdown}%</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#ce93d8" }}>{r.sellTrades.length}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: profitColor(r.totalReturn) }}>{(r.finalCapital/10000).toFixed(0)}萬</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 分段驗證 */}
          {activeTab === "split" && splitResult && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ background: "#0a1520", border: `1px solid ${splitResult.consistent ? "#4caf50" : "#ef5350"}`, borderRadius: 12, padding: 18 }}>
                <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 13 }}>✂️ 分段回測驗證 — {STRATEGIES[strategy]?.name}</h3>
                <div style={{ background: splitResult.consistent ? "#0d2a1a" : "#2a0d0d", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 24 }}>{splitResult.consistent ? "✅" : "⚠️"}</span>
                  <div>
                    <div style={{ color: splitResult.consistent ? "#4caf50" : "#ef5350", fontWeight: 700, fontSize: 14 }}>
                      {splitResult.consistent ? "策略一致性良好！兩段期間皆獲利" : "策略一致性不足！兩段期間結果不一致"}
                    </div>
                    <div style={{ color: "#546e7a", fontSize: 11, marginTop: 3 }}>
                      {splitResult.consistent ? "前後兩段回測結果方向相同，策略具有較高可信度" : "前後兩段結果差異大，可能存在過度優化風險，建議謹慎使用"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    { label: "前半段（訓練期）", r: splitResult.r1, start: splitResult.firstStart, end: splitResult.firstEnd, color: "#64b5f6" },
                    { label: "後半段（驗證期）", r: splitResult.r2, start: splitResult.secondStart, end: splitResult.secondEnd, color: "#ffd54f" },
                  ].map(({ label, r, start, end, color }) => (
                    <div key={label} style={{ background: "#0d1b26", borderRadius: 8, padding: 16, border: `1px solid ${color}33` }}>
                      <div style={{ color, fontWeight: 700, fontSize: 12, marginBottom: 10 }}>{label}</div>
                      <div style={{ color: "#546e7a", fontSize: 10, marginBottom: 12 }}>{start} ～ {end}</div>
                      {[
                        ["總報酬率", `${r.totalReturn}%`, parseFloat(r.totalReturn) >= 0 ? "#ef5350" : "#4caf50"],
                        ["勝率", `${r.winRate}%`, "#64b5f6"],
                        ["最大回撤", `-${r.maxDrawdown}%`, "#ff7043"],
                        ["交易次數", r.sellTrades.length, "#ce93d8"],
                      ].map(([k, v, c]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span style={{ color: "#546e7a" }}>{k}</span>
                          <span style={{ color: c, fontWeight: 700, fontFamily: "monospace" }}>{v}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 8, padding: "6px 10px", background: "#060e17", borderRadius: 6, fontSize: 11, color: "#546e7a" }}>
                        樣本數：{r.sellTrades.length >= 10 ? "✅ 足夠（≥10次）" : `⚠️ 不足（僅${r.sellTrades.length}次）`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 最佳參數搜尋 */}
          {activeTab === "optimize" && optimizeResult && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 8px", color: "#90caf9", fontSize: 13 }}>🔍 停損停利最佳參數搜尋 — {STRATEGIES[strategy]?.name}</h3>
              <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 16 }}>自動測試 36 種停損停利組合，依總報酬率排名</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e3a4f" }}>
                      {["排名","停損%","停利%","總報酬率","勝率","最大回撤","交易次數"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", color: "#546e7a", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {optimizeResult.slice(0, 15).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #0d2a3a", background: i === 0 ? "#0d2a1a" : i < 3 ? "#0d1f2a" : "transparent" }}>
                        <td style={{ padding: "8px 12px", color: i === 0 ? "#ffd54f" : "#546e7a", fontWeight: i === 0 ? 700 : 400 }}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`}
                        </td>
                        <td style={{ padding: "8px 12px", color: r.sl === 0 ? "#546e7a" : "#ef5350", fontFamily: "monospace" }}>{r.sl === 0 ? "不設定" : `${r.sl}%`}</td>
                        <td style={{ padding: "8px 12px", color: r.tp === 0 ? "#546e7a" : "#4caf50", fontFamily: "monospace" }}>{r.tp === 0 ? "不設定" : `${r.tp}%`}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: r.totalReturn >= 0 ? "#ef5350" : "#4caf50", fontWeight: i < 3 ? 700 : 400 }}>{r.totalReturn >= 0 ? "+" : ""}{r.totalReturn}%</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#64b5f6" }}>{r.winRate}%</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#ff7043" }}>-{r.maxDrawdown}%</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#ce93d8" }}>{r.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {optimizeResult[0] && (
                <div style={{ marginTop: 14, background: "#0d2a1a", borderRadius: 8, padding: "12px 16px", border: "1px solid #4caf5033" }}>
                  <div style={{ color: "#4caf50", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>💡 最佳參數建議</div>
                  <div style={{ color: "#e0f0ff", fontSize: 13 }}>
                    停損：<span style={{ color: "#ef5350", fontWeight: 700 }}>{optimizeResult[0].sl === 0 ? "不設定" : `${optimizeResult[0].sl}%`}</span>　
                    停利：<span style={{ color: "#4caf50", fontWeight: 700 }}>{optimizeResult[0].tp === 0 ? "不設定" : `${optimizeResult[0].tp}%`}</span>　
                    預期報酬：<span style={{ color: "#ef5350", fontWeight: 700 }}>+{optimizeResult[0].totalReturn}%</span>
                  </div>
                  <div style={{ color: "#546e7a", fontSize: 11, marginTop: 6 }}>⚠️ 最佳參數基於歷史資料，未來不保證相同效果，建議搭配分段驗證確認</div>
                </div>
              )}
            </div>
          )}

          {/* 大盤對照 */}
          {activeTab === "benchmark" && benchmarkData && (
            <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: "0 0 8px", color: "#90caf9", fontSize: 13 }}>📈 大盤對照 — {stockCode} vs 0050（元大台灣50）</h3>
              <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 16 }}>以各自起始日為基準，比較持股報酬率</div>
              {(() => {
                const lastStock = benchmarkData[benchmarkData.length - 1]?.[stockCode] || 0;
                const lastBench = benchmarkData[benchmarkData.length - 1]?.["0050"] || 0;
                const beat = lastStock > lastBench;
                return (
                  <div style={{ background: beat ? "#0d2a1a" : "#2a0d0d", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div>
                      <span style={{ color: "#546e7a", fontSize: 11 }}>{stockCode} 累積報酬：</span>
                      <span style={{ color: "#ef5350", fontWeight: 700, fontSize: 16, marginLeft: 8 }}>{lastStock >= 0 ? "+" : ""}{lastStock.toFixed(2)}%</span>
                    </div>
                    <div>
                      <span style={{ color: "#546e7a", fontSize: 11 }}>0050 累積報酬：</span>
                      <span style={{ color: "#ffd54f", fontWeight: 700, fontSize: 16, marginLeft: 8 }}>{lastBench >= 0 ? "+" : ""}{lastBench.toFixed(2)}%</span>
                    </div>
                    <div style={{ color: beat ? "#4caf50" : "#ef9a9a", fontWeight: 700 }}>
                      {beat ? `✅ 跑贏大盤 +${(lastStock - lastBench).toFixed(2)}%` : `❌ 跑輸大盤 ${(lastStock - lastBench).toFixed(2)}%`}
                    </div>
                  </div>
                );
              })()}
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={benchmarkData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d2a3a" />
                  <XAxis dataKey="date" tick={{ fill: "#546e7a", fontSize: 10 }} interval={Math.floor(benchmarkData.length/8)} />
                  <YAxis tick={{ fill: "#546e7a", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#546e7a" strokeDasharray="4 2" />
                  <Line type="monotone" dataKey={stockCode} stroke="#ef5350" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="0050" stroke="#ffd54f" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === "ai_analysis" && (
            <div style={{ display: "grid", gap: 14 }}>
              {!stockData ? (
                <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 40, color: "#546e7a", fontSize: 13, textAlign: "center" }}>
                  請先點「開始分析」執行回測，再進行 AI 分析
                </div>
              ) : (
                <>
                  {/* ── 區塊 1：股性分析（純前端） ── */}
                  {stockPersonality && (
                    <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                      <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>🧬 股性分析 — {stockCode}</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
                        {[
                          { label: "股性類型", value: stockPersonality.personality, color: stockPersonality.personalityColor },
                          { label: "年化波動率", value: `${stockPersonality.annualVol}%`, color: parseFloat(stockPersonality.annualVol) > 40 ? "#ff7043" : parseFloat(stockPersonality.annualVol) > 25 ? "#ffd54f" : "#4caf50" },
                          { label: "趨勢強度", value: `${stockPersonality.trendRatio}%`, sub: "MA5>MA20 佔比", color: parseFloat(stockPersonality.trendRatio) > 55 ? "#ef5350" : "#64b5f6" },
                          { label: "均值回歸率", value: `${stockPersonality.reversionRatio}%`, sub: "偏離後回歸比例", color: parseFloat(stockPersonality.reversionRatio) > 58 ? "#64b5f6" : "#546e7a" },
                          { label: "平均持倉", value: `${stockPersonality.avgHoldDays} 天`, sub: "本次策略", color: "#ce93d8" },
                          { label: "分析資料", value: `${stockPersonality.totalDays} 筆`, sub: "交易日", color: "#80cbc4" },
                        ].map(({ label, value, color, sub }) => (
                          <div key={label} style={{ background: "#0d1b26", borderRadius: 8, padding: "12px 16px", border: "1px solid #1e3a4f" }}>
                            <div style={{ color: "#546e7a", fontSize: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                            <div style={{ color, fontSize: 17, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
                            {sub && <div style={{ color: "#546e7a", fontSize: 10, marginTop: 2 }}>{sub}</div>}
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "#0d1b26", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${stockPersonality.personalityColor}` }}>
                        <span style={{ color: stockPersonality.personalityColor, fontWeight: 700, fontSize: 12 }}>{stockPersonality.personality}：</span>
                        <span style={{ color: "#90caf9", fontSize: 12 }}>{stockPersonality.personalityDesc}</span>
                      </div>
                    </div>
                  )}

                  {/* ── 區塊 2：策略推薦（純前端） ── */}
                  {stockPersonality && (() => {
                    const rec = recommendStrategies(stockPersonality.personality);
                    return (
                      <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                        <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>🎯 策略推薦 — 根據 {stockPersonality.personality}</h3>
                        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                          {[
                            { label: "⭐ 最推薦", keys: rec.best, color: "#ef5350", bg: "#1a0808" },
                            { label: "👍 次推薦", keys: rec.good, color: "#ffd54f", bg: "#1a1500" },
                            { label: "❌ 不建議", keys: rec.avoid, color: "#546e7a", bg: "#0d1b26" },
                          ].map(({ label, keys, color, bg }) => keys.length > 0 && (
                            <div key={label} style={{ background: bg, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ color, fontSize: 12, fontWeight: 700, minWidth: 60 }}>{label}</span>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {keys.map(k => (
                                  <span key={k}
                                    style={{ background: `${STRATEGIES[k]?.color}22`, border: `1px solid ${STRATEGIES[k]?.color}88`, color: STRATEGIES[k]?.color, borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                                    onClick={() => { setStrategy(k); setActiveTab("chart"); }}
                                    title="點擊切換至此策略"
                                  >{STRATEGIES[k]?.name}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ color: "#546e7a", fontSize: 11, padding: "8px 12px", background: "#0d1b26", borderRadius: 6, borderLeft: "3px solid #1e3a4f" }}>
                          💡 {rec.reason}
                        </div>
                        <div style={{ color: "#37474f", fontSize: 10, marginTop: 6 }}>點擊策略名稱可直接切換並重新回測</div>
                      </div>
                    );
                  })()}

                  {/* ── 區塊 3：AI 回測分析（原有功能） ── */}
                  <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                    <h3 style={{ margin: "0 0 12px", color: "#90caf9", fontSize: 13 }}>🤖 AI 回測分析</h3>
                    {backtestResult && (
                      <div style={{ background: "#0d1b26", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, display: "flex", gap: 20, flexWrap: "wrap", color: "#546e7a" }}>
                        <span>股票：<span style={{ color: "#e0f0ff" }}>{stockCode}</span></span>
                        <span>策略：<span style={{ color: "#e0f0ff" }}>{STRATEGIES[strategy]?.name}</span></span>
                        <span>報酬率：<span style={{ color: profitColor(backtestResult.totalReturn) }}>{backtestResult.totalReturn}%</span></span>
                        <span>勝率：<span style={{ color: "#64b5f6" }}>{backtestResult.winRate}%</span></span>
                        <span>最大回撤：<span style={{ color: "#ff7043" }}>-{backtestResult.maxDrawdown}%</span></span>
                      </div>
                    )}
                    {!backtestResult && <div style={{ color: "#ffd54f", fontSize: 12, marginBottom: 12, padding: "8px 12px", background: "#1a1500", borderRadius: 6, borderLeft: "3px solid #ffd54f" }}>⚠️ 資料已載入但尚未執行回測，請點「開始分析」後再使用 AI 分析</div>}
                    {!claudeKey && <div style={{ color: "#ffd54f", fontSize: 12, marginBottom: 12, padding: "8px 12px", background: "#1a1500", borderRadius: 6, borderLeft: "3px solid #ffd54f" }}>⚠️ 請在上方輸入 Claude API Key 才能使用 AI 分析功能</div>}
                    <button onClick={handleClaudeAnalysis} disabled={claudeLoading || !claudeKey || !backtestResult}
                      style={{ background: (claudeKey && backtestResult) ? "linear-gradient(135deg,#6a1b9a,#1565c0)" : "#1e3a4f", border: "none", borderRadius: 8, color: "#fff", padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: (claudeKey && backtestResult) ? "pointer" : "not-allowed", marginBottom: 12 }}>
                      {claudeLoading ? "🤖 分析中..." : "🤖 分析回測結果"}
                    </button>
                    {claudeAnalysis && (
                      <div style={{ background: "#0d1b26", borderRadius: 10, padding: "16px 20px", border: "1px solid #6a1b9a", lineHeight: 1.8, fontSize: 13, color: "#e0f0ff", whiteSpace: "pre-line" }}>
                        {claudeAnalysis}
                      </div>
                    )}
                  </div>

                  {/* ── 區塊 4：走勢預測（Claude + web_search） ── */}
                  <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                    <h3 style={{ margin: "0 0 6px", color: "#90caf9", fontSize: 13 }}>
                      🔮 後市展望預測
                      <span style={{ marginLeft: 8, fontSize: 10, background: "#1a0d2e", border: "1px solid #7c4dff", borderRadius: 4, padding: "2px 7px", color: "#b39ddb" }}>Claude + 網路搜尋</span>
                    </h3>
                    <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 12 }}>結合最新時事新聞與技術面，分析 {stockCode} 近期可能走勢</div>
                    {!claudeKey && <div style={{ color: "#ffd54f", fontSize: 12, marginBottom: 12, padding: "8px 12px", background: "#1a1500", borderRadius: 6, borderLeft: "3px solid #ffd54f" }}>⚠️ 請在上方輸入 Claude API Key</div>}
                    <button onClick={handleClaudeOutlook} disabled={claudeOutlookLoading || !claudeKey || !stockPersonality}
                      style={{ background: (claudeKey && stockPersonality) ? "linear-gradient(135deg,#1a237e,#4a148c)" : "#1e3a4f", border: "none", borderRadius: 8, color: "#fff", padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: (claudeKey && stockPersonality) ? "pointer" : "not-allowed", marginBottom: 12 }}>
                      {claudeOutlookLoading ? "🔍 搜尋最新消息並分析中..." : "🔮 預測後市走勢"}
                    </button>
                    {claudeOutlookLoading && (
                      <div style={{ color: "#546e7a", fontSize: 11, marginBottom: 8 }}>⏳ Claude 正在搜尋 {stockCode} 的最新新聞、法說會、產業動態...</div>
                    )}
                    {claudeOutlook && (
                      <div style={{ background: "#0d0d1f", borderRadius: 10, padding: "16px 20px", border: "1px solid #4a148c", lineHeight: 1.9, fontSize: 13, color: "#e0f0ff", whiteSpace: "pre-line" }}>
                        {claudeOutlook}
                      </div>
                    )}
                    <div style={{ color: "#37474f", fontSize: 10, marginTop: 8 }}>⚠️ AI 預測僅供參考，不構成投資建議。本功能使用 claude-sonnet 模型（費用略高於 haiku）。</div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "guide" && (
            <div style={{ display: "grid", gap: 14 }}>
              {STRATEGY_DETAILS.map(({ type, items }) => (
                <div key={type} style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                  <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>📌 {type}</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e3a4f" }}>
                        {["策略名稱","使用線型","線型用意"].map(h => (
                          <th key={h} style={{ padding: "8px 14px", color: "#546e7a", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(({ name, lines, meaning }) => (
                        <tr key={name} style={{ borderBottom: "1px solid #0d2a3a" }}>
                          <td style={{ padding: "10px 14px", color: "#64b5f6", fontWeight: 600, whiteSpace: "nowrap" }}>{name}</td>
                          <td style={{ padding: "10px 14px", color: "#ffd54f", fontSize: 11, whiteSpace: "nowrap" }}>{lines}</td>
                          <td style={{ padding: "10px 14px", color: "#90caf9", lineHeight: 1.6 }}>{meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div style={{ background: "#0a1520", border: "1px solid #1e3a4f", borderRadius: 12, padding: 18 }}>
                <h3 style={{ margin: "0 0 14px", color: "#90caf9", fontSize: 13 }}>🎯 選策略的原則</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {MARKET_STRATEGY.map(({ market, strategies, color }) => (
                    <div key={market} style={{ background: "#0d1b26", borderRadius: 8, padding: "12px 16px", borderLeft: `3px solid ${color}` }}>
                      <div style={{ color, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📈 {market}</div>
                      {strategies.map(s => <div key={s} style={{ color: "#90caf9", fontSize: 11, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><span style={{ color, fontSize: 8 }}>●</span>{s}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!chartData.length && !multiResults && !loading && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#546e7a" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 15, marginBottom: 6, color: "#78909c" }}>輸入股票代號和 FinMind Token</div>
          <div style={{ fontSize: 12 }}>支援上市/上櫃 · 11 種策略 · K線滾輪縮放+拖曳 · Claude AI 分析</div>
        </div>
      )}
    </div>
  );
}
