import { isAuthorized } from "./auth.js";

const MODEL = "gemini-3.5-flash-lite";

function normalizeSignal(v) {
  const x = String(v || "").trim().toUpperCase();
  return ["CALL", "PUT", "NO TRADE"].includes(x) ? x : "NO TRADE";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  if (!isAuthorized(req)) return res.status(401).json({ error: "Login required." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY is missing in Vercel." });

  try {
    const body = req.body || {};
    const image = body.image;
    const settings = body.settings || {};
    const liveData = body.live_data && typeof body.live_data === "object" ? body.live_data : null;

    if (typeof image !== "string") return res.status(400).json({ error: "Chart image is required." });

    const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Invalid image format." });

    const mimeType = match[1];
    const base64Image = match[2];

    const market = settings.market || "OTC";
    const timeframe = settings.timeframe || "1 minute";
    const mode = settings.mode || "STRICT SMC";
    const minConfidence = Number(settings.min_confidence || 60);
    const live = settings.execution_mode === "FIXED_1M_CLOSE_TO_RUNNING_ENTRY";

    const prompt = `You are NEXT TRADER AI PRO, a fast and conservative chart-image technical analyst.

IMAGE IS THE ONLY SOURCE OF TRUTH.
Do not use previous requests. Do not invent future candles, hidden price, broker feed, unseen indicators or future movement.

Market: ${market}
Timeframe: ${timeframe}
Mode: ${mode}
Minimum confidence: ${minConfidence}%
Live mode: ${live ? "YES" : "NO"}

LIVE DATA BRIDGE (if present): ${liveData ? JSON.stringify(liveData).slice(0, 1800) : "none"}
If live bridge data is present, use it only as an additional current-market reference and never invent missing fields.

Analyze only what is visibly readable:
recent candles, bodies/wicks, momentum, swing highs/lows, market structure,
BOS/CHOCH if visible, support/resistance, equal highs/lows, liquidity sweeps,
rejection, engulfing, breakout/false breakout, FVG/imbalance, supply/demand,
visible moving averages, nearby opposing levels and current price location.

Compare CALL evidence against PUT evidence.
If evidence conflicts, setup is incomplete, chart is unclear, or confidence is below ${minConfidence}% => NO TRADE.

LIVE MODE:
The screenshot is captured near the end of the current 1-minute candle.
Analyze the just-closed candle.
CALL/PUT is for the NEW candle beginning at :00.
Never label a live CALL/PUT as NEXT CANDLE.
For live CALL/PUT use entry_candle = RUNNING CANDLE.

Return ONLY valid JSON:
{
 "signal":"CALL|PUT|NO TRADE",
 "confidence":0,
 "trend":"BULLISH|BEARISH|SIDEWAYS|UNCLEAR",
 "expiry":"${timeframe}",
 "entry_candle":"CURRENT CANDLE|RUNNING CANDLE|NEXT CANDLE|AFTER NEXT CANDLE|WAIT",
 "entry_instruction":"short instruction",
 "setup":"short setup name",
 "reasons":["reason 1","reason 2","reason 3","reason 4"],
 "risk":"LOW|MEDIUM|HIGH",
 "disclaimer":"Technical analysis is probabilistic; no signal is guaranteed.",
 "market_data":{"asset":"","current_price":"","visible_time":"","candle_close":""}
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Pragma": "no-cache"
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Image } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 260,
            thinkingConfig: { thinkingLevel: "minimal" }
          }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("GEMINI ERROR:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "Gemini API request failed."
      });
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || "")
      .join("")
      .trim();

    if (!text) return res.status(502).json({ error: "Gemini returned an empty response." });

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(200).json({
        signal: "NO TRADE",
        confidence: 0,
        trend: "UNCLEAR",
        expiry: timeframe,
        entry_candle: "WAIT",
        entry_instruction: "AI response could not be safely parsed.",
        setup: "Response parsing issue",
        reasons: ["Invalid AI JSON; signal blocked."],
        risk: "HIGH",
        disclaimer: "Technical analysis is probabilistic; no signal is guaranteed."
      });
    }

    let confidence = Number(result.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const signal = normalizeSignal(result.signal);
    const finalSignal = confidence >= minConfidence ? signal : "NO TRADE";
    const liveEntry = finalSignal === "CALL" || finalSignal === "PUT"
      ? (live ? "RUNNING CANDLE" : (result.entry_candle || "CURRENT CANDLE"))
      : "WAIT";

    const md = result.market_data && typeof result.market_data === "object" ? result.market_data : {};
    const marketData = {
      asset: String(md.asset || liveData?.asset || "UNKNOWN"),
      current_price: String(md.current_price || liveData?.price || liveData?.close || "UNKNOWN"),
      visible_time: String(md.visible_time || liveData?.server_time || "UNKNOWN"),
      candle_close: String(md.candle_close || liveData?.close || "UNKNOWN"),
      source: liveData ? "QUOTEX LIVE BRIDGE + SCREEN" : "SCREEN SNAPSHOT"
    };

    return res.status(200).json({
      signal: finalSignal,
      confidence,
      trend: ["BULLISH","BEARISH","SIDEWAYS","UNCLEAR"].includes(String(result.trend || "").toUpperCase())
        ? String(result.trend).toUpperCase() : "UNCLEAR",
      expiry: String(result.expiry || timeframe),
      entry_candle: liveEntry,
      entry_instruction: finalSignal === "NO TRADE"
        ? String(result.entry_instruction || "Wait for stronger confirmation.")
        : String(result.entry_instruction || (live ? "Entry on the running candle." : "Enter only after confirmation.")),
      setup: String(result.setup || "No clear setup"),
      reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 6).map(String) : [],
      risk: ["LOW","MEDIUM","HIGH"].includes(String(result.risk || "").toUpperCase())
        ? String(result.risk).toUpperCase() : "HIGH",
      market_data: marketData,
      disclaimer: "Technical analysis is probabilistic; no signal is guaranteed."
    });
  } catch (error) {
    console.error("NEXT TRADER ERROR:", error);
    return res.status(500).json({ error: error?.message || "Gemini API failed." });
  }
}
