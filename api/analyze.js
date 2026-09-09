import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT = `
You are NEXT TRADER AI, a screenshot-based technical chart analyzer.

Analyze the uploaded trading chart carefully.

Return ONLY valid JSON:

{
  "signal": "CALL",
  "confidence": 0,
  "trend": "BULLISH",
  "expiry": "1 minute",
  "setup": "string",
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "risk": "LOW",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}

Allowed signal: CALL, PUT, NO TRADE
Allowed trend: BULLISH, BEARISH, SIDEWAYS, UNCLEAR
Allowed risk: LOW, MEDIUM, HIGH

Rules:
- Analyze candle structure, trend, support/resistance and momentum.
- Look for confirmation rather than guessing.
- If the chart is unclear or conflicting, return NO TRADE.
- Never claim certainty or guaranteed profit.
- Confidence must be between 0 and 100.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Chart image is required."
      });
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: PROMPT
            },
            {
              type: "input_image",
              image_url: image,
              detail: "high"
            }
          ]
        }
      ]
    });

    const text = response.output_text.trim();

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).json({
        raw_analysis: text
      });
    }

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "AI analysis failed."
    });
  }
}
