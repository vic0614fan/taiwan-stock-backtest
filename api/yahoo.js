// api/yahoo.js — 伺服器端抓取 Yahoo Finance，避免 CORS 和 allorigins 不穩定問題
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { code, startTs, endTs } = req.query;
  if (!code || !startTs || !endTs) return res.status(400).json({ error: "缺少參數" });

  const suffixes = [".TW", ".TWO"];
  for (const suffix of suffixes) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1d&period1=${startTs}&period2=${endTs}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; StockBacktest/1.0)" }
      });
      if (!response.ok) continue;
      const json = await response.json();
      const result = json?.chart?.result?.[0];
      if (!result?.timestamp || result.timestamp.length === 0) continue;
      return res.status(200).json({ data: json, suffix });
    } catch(e) { continue; }
  }
  return res.status(404).json({ error: "找不到資料" });
}
