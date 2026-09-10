import { isAuthorized } from "./auth.js";

const MODEL = "gemini-3.5-flash-lite";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  // =========================
  // AUTH
  // =========================

  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: "Login required."
    });
  }

  // =========================
  // API KEY
  // =========================

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel."
    });
  }

  try {

    const body = req.body || {};

    const image = body.image;
    const settings = body.settings || {};

    // =========================
    // IMAGE CHECK
    // =========================

    if (
      !image ||
      typeof image !== "string"
    ) {
      return res.status(400).json({
        error: "Chart image is required."
      });
    }

    const match = image.match(
      /^data:(image\/[^;]+);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Invalid image format."
      });
    }

    const mimeType = match[1];
    const base64Image = match[2];

    // =========================
    // SETTINGS
    // =========================

    const market =
      settings.market || "OTC";

    const timeframe =
      settings.timeframe || "1 minute";

    const mode =
      settings.mode || "STRICT SMC";

    const minConfidence =
      Number(settings.min_confidence || 60);

    // Unique request ID.
    // This helps make every analysis request independent.
    const requestId =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    // =========================
    // PROMPT
    // =========================

    const prompt = `
You are NEXT TRADER AI PRO.

REQUEST ID:
${requestId}

This is a NEW and INDEPENDENT chart analysis.
Do NOT rely on any previous chart, previous answer,
previous signal, or previous request.

You are analyzing the IMAGE supplied with this request.

==================================================
IMPORTANT IMAGE RULE
==================================================

The uploaded image is the PRIMARY source of truth.

Look directly at the actual image.

Do NOT assume that this image is the same as a previous image.

Do NOT reuse a previous answer.

Do NOT produce a generic answer without examining
the visible candles and chart structure.

If the image contains readable candles, analyze them.

==================================================
USER SETTINGS
==================================================

Market: ${market}
Timeframe: ${timeframe}
Mode: ${mode}
Minimum confidence: ${minConfidence}%

==================================================
ANALYSIS
==================================================

Analyze ONLY information visibly present in the image.

Check:

1. Recent candle direction
2. Candle body size
3. Upper/lower wick behavior
4. Bullish/bearish momentum
5. Recent swing highs and lows
6. Market structure
7. Break of structure if visible
8. Change of character if visible
9. Support and resistance
10. Equal highs
11. Equal lows
12. Liquidity sweep
13. Rejection
14. Engulfing candle
15. Breakout
16. False breakout
17. FVG / imbalance if visible
18. Supply/demand if visible
19. Moving averages ONLY if actually visible
20. Nearby opposing level
21. Current candle position
22. Whether CALL or PUT has stronger visible evidence

==================================================
DECISION LOGIC
==================================================

First determine:

A) Is the chart readable?

B) What is the dominant visible structure?

C) Is the recent momentum bullish, bearish, or sideways?

D) Is there a clean CALL setup?

E) Is there a clean PUT setup?

F) Is there confirmation?

G) Is price entering a nearby opposing level?

Then compare CALL evidence against PUT evidence.

Do NOT automatically choose NO TRADE.

However, if evidence is genuinely weak or conflicting,
return NO TRADE.

==================================================
CONFIDENCE
==================================================

Confidence must represent the strength of the visible
technical evidence.

0-39 = very weak
40-49 = weak
50-59 = moderate but insufficient
60-69 = usable confirmation
70-79 = strong setup
80-89 = very strong setup
90-100 = exceptional visible alignment

Do NOT give 45% automatically.

Do NOT give the same confidence to every image.

Confidence must change according to the actual chart.

IMPORTANT:

If confidence is below ${minConfidence}%,
signal MUST be NO TRADE.

==================================================
ENTRY
==================================================

Possible entry_candle values:

CURRENT CANDLE
NEXT CANDLE
AFTER NEXT CANDLE
WAIT

Only use CURRENT CANDLE if the visible setup is already
confirmed.

If confirmation is still developing, use NEXT CANDLE.

If the chart does not provide a clean setup, use WAIT.

==================================================
BINARY-STYLE OUTPUT
==================================================

For CALL:

There should be visible bullish evidence such as:
- bullish rejection
- bullish engulfing
- liquidity sweep and reclaim
- bullish structure
- support reaction
- momentum continuation
- confirmed breakout/retest

For PUT:

There should be visible bearish evidence such as:
- bearish rejection
- bearish engulfing
- liquidity sweep and rejection
- bearish structure
- resistance reaction
- momentum continuation
- confirmed breakout/retest

These are examples, not mandatory checkboxes.

==================================================
NO TRADE CONDITIONS
==================================================

Use NO TRADE when:

- chart is too blurry
- candles cannot be read
- important area is hidden
- CALL and PUT evidence conflict
- setup is incomplete
- price is directly at an opposing level
- there is no meaningful confirmation

==================================================
VERY IMPORTANT
==================================================

Never invent:

- future candles
- hidden candles
- broker data
- live price
- unseen indicators
- future movement

Never guarantee a winning trade.

This is probabilistic technical analysis.

==================================================
RETURN ONLY JSON
==================================================

Return exactly:

{
  "signal": "CALL|PUT|NO TRADE",
  "confidence": 0,
  "trend": "BULLISH|BEARISH|SIDEWAYS|UNCLEAR",
  "expiry": "${timeframe}",
  "entry_candle": "CURRENT CANDLE|NEXT CANDLE|AFTER NEXT CANDLE|WAIT",
  "entry_instruction": "short specific instruction",
  "setup": "short setup name",
  "reasons": [
    "reason 1",
    "reason 2",
    "reason 3",
    "reason 4"
  ],
  "risk": "LOW|MEDIUM|HIGH",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}
`;

    // =========================
    // GEMINI REQUEST
    // =========================

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        },

        body: JSON.stringify({

          contents: [
            {
              role: "user",

              parts: [

                {
                  text: prompt
                },

                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                }

              ]
            }
          ],

          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json"
          }

        })
      }
    );

    const data =
      await response.json();

    // =========================
    // GEMINI ERROR
    // =========================

    if (!response.ok) {

      console.error(
        "GEMINI ERROR:",
        data
      );

      return res.status(
        response.status
      ).json({

        error:
          data?.error?.message ||
          "Gemini API request failed."

      });

    }

    // =========================
    // EXTRACT RESPONSE
    // =========================

    const parts =
      data?.candidates?.[0]
        ?.content?.parts || [];

    const text =
      parts
        .map(part => part?.text || "")
        .join("")
        .trim();

    if (!text) {

      console.error(
        "EMPTY GEMINI RESPONSE:",
        data
      );

      return res.status(500).json({
        error:
          "Gemini returned an empty response."
      });

    }

    // =========================
    // PARSE JSON
    // =========================

    let result;

    try {

      result =
        JSON.parse(text);

    } catch (error) {

      console.error(
        "JSON PARSE ERROR:",
        error
      );

      console.error(
        "RAW GEMINI TEXT:",
        text
      );

      return res.status(200).json({

        signal: "NO TRADE",

        confidence: 0,

        trend: "UNCLEAR",

        expiry: timeframe,

        entry_candle: "WAIT",

        entry_instruction:
          "AI response could not be safely parsed.",

        setup:
          "Response parsing issue",

        reasons: [
          "The AI response was not valid JSON.",
          "The system blocked the signal for safety."
        ],

        risk: "HIGH",

        disclaimer:
          "Technical analysis is probabilistic; no signal is guaranteed."

      });
    }

    // =========================
    // NORMALIZE SIGNAL
    // =========================

    const rawSignal =
      String(
        result.signal || ""
      )
        .trim()
        .toUpperCase();

    const signal =
      ["CALL", "PUT", "NO TRADE"]
        .includes(rawSignal)
        ? rawSignal
        : "NO TRADE";

    // =========================
    // NORMALIZE CONFIDENCE
    // =========================

    let confidence =
      Number(result.confidence);

    if (!Number.isFinite(confidence)) {
      confidence = 0;
    }

    confidence =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(confidence)
        )
      );

    // =========================
    // FINAL SIGNAL
    // =========================

    const finalSignal =
      confidence >= minConfidence
        ? signal
        : "NO TRADE";

    // =========================
    // RESPONSE
    // =========================

    return res.status(200).json({

      signal:
        finalSignal,

      confidence,

      trend:
        result.trend ||
        "UNCLEAR",

      expiry:
        result.expiry ||
        timeframe,

      entry_candle:
        finalSignal === "NO TRADE"
          ? "WAIT"
          : (
              result.entry_candle ||
              "WAIT"
            ),

      entry_instruction:
        finalSignal === "NO TRADE"
          ? (
              result.entry_instruction ||
              "Wait for stronger confirmation before entering."
            )
          : (
              result.entry_instruction ||
              "Wait for confirmation before entering."
            ),

      setup:
        result.setup ||
        "No clear setup",

      reasons:
        Array.isArray(result.reasons)
          ? result.reasons
              .slice(0, 6)
              .map(String)
          : [
              "Visible chart evidence was insufficient."
            ],

      risk:
        ["LOW", "MEDIUM", "HIGH"]
          .includes(
            String(result.risk || "").toUpperCase()
          )
          ? String(result.risk).toUpperCase()
          : "HIGH",

      disclaimer:
        "Technical analysis is probabilistic; no signal is guaranteed."

    });

  } catch (error) {

    console.error(
      "NEXT TRADER ERROR:",
      error
    );

    return res.status(500).json({

      error:
        error?.message ||
        "Gemini API failed."

    });

  }

}
