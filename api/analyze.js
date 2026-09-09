import { GoogleGenAI } from "@google/genai";

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

    if (!image) {
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

    const ai = new GoogleGenAI({
      apiKey
    });

    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash-lite",

      input: [
        {
          type: "text",
          text: `
You are NEXT TRADER AI.

Analyze this trading chart screenshot.

Return ONLY JSON:

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

If the chart is unclear or signals conflict, use NO TRADE.

Never guarantee profit.
Never claim certainty.
Confidence must be 0-100.
`
        },

        {
          type: "image",
          data: base64Image,
          mime_type: mimeType
        }
      ],

      response_format: {
        type: "text",
        mime_type: "application/json"
      }
    });

    const text = interaction.output_text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned no analysis."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return res.status(200).json({
        raw_analysis: text
      });
    }

    return res.status(200).json(result);

  } catch (error) {

    console.error("GEMINI ERROR:", error);

    return res.status(500).json({
      error: error?.message || "Gemini API failed."
    });
  }
}
