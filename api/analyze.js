const MODEL = "gemini-2.5-flash-lite";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel."
    });
  }

  try {

    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Chart image is required."
      });
    }

    const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);

    if (!match) {
      return res.status(400).json({
        error: "Invalid image format."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = `
You are NEXT TRADER AI, a screenshot-based chart analyzer.

Analyze this trading chart screenshot carefully.

Return ONLY valid JSON:

{
  "signal": "CALL",
  "confidence": 0,
  "trend": "BULLISH",
  "expiry": "1 minute",
  "setup": "string",
  "reasons": [
    "reason 1",
    "reason 2",
    "reason 3"
  ],
  "risk": "LOW",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}

Allowed signal:
CALL, PUT, NO TRADE

Allowed trend:
BULLISH, BEARISH, SIDEWAYS, UNCLEAR

Allowed risk:
LOW, MEDIUM, HIGH

Rules:
- Analyze candle structure.
- Analyze trend.
- Analyze support/resistance.
- Analyze momentum.
- Look for confirmation.
- If the chart is unclear or conflicting, return NO TRADE.
- Never guarantee profit.
- Never claim certainty.
- Confidence must be between 0 and 100.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("GEMINI ERROR:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned an empty response."
      });
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).json({
        raw_analysis: text
      });
    }

  } catch (error) {

    console.error("NEXT TRADER AI ERROR:", error);

    return res.status(500).json({
      error: error?.message || "AI analysis failed."
    });

  }
}
